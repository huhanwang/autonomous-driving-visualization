// src/core/vis/LayerManager.ts

import { reactive } from 'vue'
import { EventEmitter } from '@/core/EventEmitter'
import { 
  CoordinateSystem, 
  ViewMask, 
  type DecodedLayer, 
  type DecodedTopic, 
  type DecodedGroup, 
  type DecodedObject 
} from '@/core/protocol/VizDecoder'

// UI 树节点定义
export interface UINode {
  id: string          // 前端生成的唯一完整路径 ID (用于 el-tree node-key)
  rawId: string       // 原始数据的 ID (用于显示和属性查询)
  name: string        // 显示名称
  type: 'layer' | 'topic' | 'group' | 'object'
  visible: boolean
  viewMask: number    // 🌟 新增：视图掩码，用于区分 2D/3D 显示
  children?: UINode[] 
  frameId?: bigint 
}

export interface SelectionState {
  selectedId: string | null // 存储的是 UI Path ID
  hoveredId: string | null
  filterText: string
}

export class LayerManager extends EventEmitter {
  private static instance: LayerManager

  // UI 树结构
  public tree = reactive<UINode[]>([])
  
  // 核心数据存储 (UI Path ID -> Object)
  // 我们使用 UI 生成的唯一路径作为 Key，这样即使原始 ID 重复，也能分别存储
  private objectMap = new Map<string, DecodedObject>()
  
  // Topic 完整路径 -> Last Frame ID (用于增量更新检测)
  private topicFrameIndex = new Map<string, bigint>()

  public state = reactive<SelectionState>({
    selectedId: null,
    hoveredId: null,
    filterText: ''
  })

  // 🌟 [新增] 当前坐标系，默认为 ROS 标准
  // 渲染层 (World.ts) 会读取此属性来决定根容器的旋转
  public currentCoordinateSystem = CoordinateSystem.RIGHT_HANDED_Z_UP_X_FWD

  private constructor() { super() }

  static getInstance() {
    if (!this.instance) this.instance = new LayerManager()
    return this.instance
  }

  /**
   * 处理新的一帧数据
   * 🌟 [修改] 接收包含坐标系的完整结果
   */
  updateScene(result: { layers: DecodedLayer[], coordinateSystem: CoordinateSystem }) {
    // 1. 更新坐标系状态
    this.currentCoordinateSystem = result.coordinateSystem

    // 2. 更新图层
    let hasChanges = false
    const decodedLayers = result.layers

    for (const dataLayer of decodedLayers) {
        // Layer 的 ID 通常是唯一的，直接用
        let uiLayer = this.tree.find(l => l.id === dataLayer.id)
        
        if (!uiLayer) {
            uiLayer = {
                id: dataLayer.id,
                rawId: dataLayer.id,
                name: dataLayer.name || dataLayer.id,
                type: 'layer',
                visible: true,
                viewMask: dataLayer.viewMask, // ✅ 从数据中获取 Mask
                children: []
            }
            this.tree.push(uiLayer)
            hasChanges = true
        } else {
            // 如果 Mask 发生变化，也需要更新
            if (uiLayer.viewMask !== dataLayer.viewMask) {
                uiLayer.viewMask = dataLayer.viewMask
                // Mask 变化不需要触发树结构的大重绘，但可能影响渲染过滤
            }
        }
        
        const topicsChanged = this.updateLayerTopics(uiLayer, dataLayer.topics)
        if (topicsChanged) hasChanges = true
    }
    
    if (hasChanges) {
        this.emit('scene-updated')
    }
  }

  /**
   * 增量更新 Layer 下的 Topics
   */
  private updateLayerTopics(uiLayer: UINode, dataTopics: DecodedTopic[]): boolean {
      let hasChanges = false
      if (!uiLayer.children) uiLayer.children = []

      // 建立索引以便快速更新
      const existingTopicMap = new Map<string, UINode>()
      for (const child of uiLayer.children) {
          if (child.type === 'topic') existingTopicMap.set(child.id, child)
      }

      for (const dataTopic of dataTopics) {
          // 构造 Topic 唯一路径：LayerID/TopicID
          const topicPath = `${uiLayer.id}/${dataTopic.id}`
          const existingTopic = existingTopicMap.get(topicPath)
          const lastFrameId = this.topicFrameIndex.get(topicPath)

          // 增量检测：FrameId 没变则跳过
          if (existingTopic && lastFrameId === dataTopic.frameId) {
              continue
          }

          hasChanges = true
          
          // 如果已存在，先清理旧数据的引用映射
          if (existingTopic) {
              this.removeNodeRecursively(existingTopic)
          }

          const uiTopic: UINode = {
              id: topicPath,
              rawId: dataTopic.id,
              name: dataTopic.id,
              type: 'topic',
              visible: existingTopic?.visible ?? true,
              viewMask: ViewMask.ALL, // Topic 层默认在所有视图显示
              frameId: dataTopic.frameId,
              children: []
          }

          // 递归构建子节点 (Group/Object)
          if (dataTopic.rootNode) {
              const nodes = dataTopic.rootNode.nodeType === 'group' 
                  ? (dataTopic.rootNode as DecodedGroup).children 
                  : [dataTopic.rootNode];
              
              uiTopic.children = this.mapDataToUINodes(nodes, topicPath)
          }

          this.topicFrameIndex.set(topicPath, dataTopic.frameId)

          // 更新 UI 树
          const idx = uiLayer.children.findIndex(c => c.id === topicPath)
          if (idx >= 0) {
              uiLayer.children[idx] = uiTopic
          } else {
              uiLayer.children.push(uiTopic)
          }
      }
      return hasChanges
  }

  /**
   * 递归映射数据节点 -> UI 节点
   */
  private mapDataToUINodes(
      dataNodes: (DecodedGroup | DecodedObject)[],
      parentPath: string
  ): UINode[] {
      const uiNodes: UINode[] = []
      
      // 使用 Map 记录当前层级每个 ID 出现的次数，处理重复 ID
      const idCounter = new Map<string, number>()

      for (const node of dataNodes) {
          const rawId = node.id || 'unknown'
          
          // 获取当前 ID 出现的次数
          let count = idCounter.get(rawId) || 0
          idCounter.set(rawId, count + 1)
          
          // 如果是重复的 ID，追加后缀，例如: vehicle/0_dup1
          const uniqueSuffix = count > 0 ? `_dup${count}` : ''
          const uniquePath = `${parentPath}/${rawId}${uniqueSuffix}`

          if (node.nodeType === 'group') {
              const groupData = node as DecodedGroup
              uiNodes.push({
                  id: uniquePath,
                  rawId: rawId,
                  name: groupData.name || rawId,
                  type: 'group',
                  visible: groupData.visible,
                  viewMask: groupData.viewMask, // ✅ 获取组的掩码
                  children: this.mapDataToUINodes(groupData.children, uniquePath)
              })
          } else if (node.nodeType === 'object') {
              const objectData = node as DecodedObject
              
              // 建立映射：UI 唯一路径 -> 原始数据对象
              this.objectMap.set(uniquePath, objectData)
              
              uiNodes.push({
                  id: uniquePath,
                  rawId: rawId,
                  name: objectData.name || rawId,
                  type: 'object',
                  visible: objectData.visible,
                  viewMask: objectData.viewMask // ✅ 获取对象的掩码
              })
          }
      }
      return uiNodes
  }

  private removeNodeRecursively(node: UINode) {
      if (node.type === 'object') {
          this.objectMap.delete(node.id)
      }
      if (node.children) {
          for (const child of node.children) {
              this.removeNodeRecursively(child)
          }
      }
  }

  // ========== 公共 API ==========

  /**
   * 根据 UI 路径获取对象
   */
  getObjectById(uiId: string): DecodedObject | undefined {
    return this.objectMap.get(uiId)
  }

  /**
   * 选中对象
   */
  selectObject(uiId: string | null) {
    if (this.state.selectedId === uiId) return
    this.state.selectedId = uiId
    this.emit('selection-changed', uiId)
  }

  /**
   * 🌟 [核心修改] 获取可渲染对象
   * @param targetView 当前视图类型 (VIEW_2D 或 VIEW_3D)
   * 仅返回 visible = true 且 viewMask 匹配的对象
   */
  getRenderableObjects(targetView: ViewMask): DecodedObject[] {
    const result: DecodedObject[] = []
    const filterText = this.state.filterText.trim().toLowerCase()

    // 递归遍历，传入父级的累积掩码
    // 初始 parentMask 为 ALL，表示根节点不设限
    const traverse = (nodes: UINode[], parentMask: number) => {
      for (const node of nodes) {
        // 1. 基础可见性检查 (UI 开关)
        if (!node.visible) continue

        // 2. 计算当前节点的有效掩码 (继承父级限制)
        // 逻辑：Effective = Parent & Self
        // 例如：父级只在 3D 显示 (2)，子级是 ALL (3) -> 2 & 3 = 2 (只在 3D 显示)
        const effectiveMask = parentMask & node.viewMask

        // 3. 检查是否匹配当前目标视图
        // 如果有效掩码中不包含目标视图位，则跳过该节点及其子节点
        if ((effectiveMask & targetView) === 0) {
            continue 
        }

        if (node.type === 'object') {
          const obj = this.objectMap.get(node.id)
          if (obj) {
             // 搜索过滤：匹配 rawId 或 name
             if (filterText && !node.rawId.toLowerCase().includes(filterText) && !node.name.toLowerCase().includes(filterText)) continue
             result.push(obj)
          }
        } else if (node.children) {
          // 递归，传递当前的有效掩码
          traverse(node.children, effectiveMask)
        }
      }
    }

    // 从根节点开始遍历
    traverse(this.tree, ViewMask.ALL)
    return result
  }
  
  /**
   * 清空所有状态
   */
  clear() {
    this.tree.splice(0, this.tree.length)
    this.objectMap.clear()
    this.topicFrameIndex.clear()
    this.state.selectedId = null
    this.state.hoveredId = null
    this.emit('scene-updated')
  }
}

export const layerManager = LayerManager.getInstance()