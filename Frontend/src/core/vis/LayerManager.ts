// src/core/vis/LayerManager.ts

import { reactive } from 'vue'
import { EventEmitter } from '@/core/EventEmitter'
import type { DecodedObject } from '@/core/protocol/VizDecoder'

export interface LayerNode {
  id: string
  name: string
  type: 'layer'
  visible: boolean
  children: GroupNode[]
  opacity: number
}

export interface GroupNode {
  id: string
  name: string
  type: 'group'
  visible: boolean
  parentLayerId: string
  children: ObjectNode[] 
}

export interface ObjectNode {
  id: string
  name: string
  type: 'object'
  visible: boolean
}

export interface SelectionState {
  selectedId: string | null
  hoveredId: string | null
  filterText: string
}

export class LayerManager extends EventEmitter {
  private static instance: LayerManager

  public tree = reactive<LayerNode[]>([])
  
  // 核心数据存储
  private objectMap = new Map<string, DecodedObject>()
  
  // 🆕 新增：Group 到 Object ID 的反向索引，用于快速局部清除
  private groupIndex = new Map<string, Set<string>>()

  public state = reactive<SelectionState>({
    selectedId: null,
    hoveredId: null,
    filterText: ''
  })

  private constructor() { super() }

  static getInstance() {
    if (!this.instance) this.instance = new LayerManager()
    return this.instance
  }

  /**
   * 🌟 核心修改：基于 Group 的增量更新
   */
  updateScene(newObjects: DecodedObject[]) {
    // 1. 找出这一帧数据涉及了哪些 Group (Dirty Groups)
    const dirtyGroupIds = new Set<string>()
    for (const obj of newObjects) {
      // 假设 VizDecoder 已经填充了 groupId，如果没有则归为 default
      const gid = (obj as any).groupId || 'default_group'
      dirtyGroupIds.add(gid)
    }

    // 2. 只清除这些 Dirty Groups 里的旧对象
    // 如果某个 Group 在这一帧没有出现，它的旧数据会被保留（解决闪烁问题）
    for (const groupId of dirtyGroupIds) {
      if (this.groupIndex.has(groupId)) {
        const oldObjIds = this.groupIndex.get(groupId)!
        // 从主 Map 中删除旧对象
        for (const oid of oldObjIds) {
          this.objectMap.delete(oid)
        }
        // 清空该 Group 的索引，准备接收新数据
        this.groupIndex.get(groupId)!.clear()
      } else {
        this.groupIndex.set(groupId, new Set())
      }
    }

    // 3. 写入新数据
    for (const obj of newObjects) {
      const gid = (obj as any).groupId || 'default_group'
      
      // 更新主 Map
      this.objectMap.set(obj.id, obj)
      
      // 更新索引
      if (!this.groupIndex.has(gid)) {
        this.groupIndex.set(gid, new Set())
      }
      this.groupIndex.get(gid)!.add(obj.id)

      // 更新 UI 树结构
      this.ensureTreeStructure(obj)
    }
    
    // 通知渲染器
    this.emit('scene-updated')
  }

  getRenderableObjects(): DecodedObject[] {
    const result: DecodedObject[] = []
    const filterText = this.state.filterText.trim().toLowerCase()

    for (const layer of this.tree) {
      if (!layer.visible) continue

      for (const group of layer.children) {
        if (!group.visible) continue

        for (const node of group.children) {
          if (!node.visible) continue

          const obj = this.objectMap.get(node.id)
          // ⚠️ 注意：由于我们现在做增量更新，tree 里可能包含了一些已经被删除的 ID
          // (比如上一帧 Group A 有 5 个对象，这一帧 Group A 只有 3 个，tree 里可能有残留)
          // 通过 !obj 判断可以自动过滤掉已删除的对象
          if (!obj) continue

          if (filterText && !obj.id.toLowerCase().includes(filterText)) {
            continue
          }
          result.push(obj)
        }
      }
    }
    return result
  }

  getObjectById(id: string): DecodedObject | undefined {
    return this.objectMap.get(id)
  }

  selectObject(id: string | null) {
    if (this.state.selectedId === id) return
    this.state.selectedId = id
    this.emit('selection-changed', id)
  }

  private ensureTreeStructure(obj: DecodedObject) {
    const layerId = (obj as any).layerId || 'default_layer'
    const layerName = (obj as any).layerName || 'Default Layer'
    const groupId = (obj as any).groupId || `${layerId}_group`
    const groupName = (obj as any).groupName || 'Objects'

    // 1. Find or Create Layer
    let layer = this.tree.find(l => l.id === layerId)
    if (!layer) {
      layer = {
        id: layerId,
        name: layerName,
        type: 'layer',
        visible: true,
        children: [],
        opacity: 1.0
      }
      this.tree.push(layer)
    }

    // 2. Find or Create Group
    let group = layer.children.find(g => g.id === groupId)
    if (!group) {
      group = {
        id: groupId,
        name: groupName,
        type: 'group',
        visible: true,
        parentLayerId: layerId,
        children: []
      }
      layer.children.push(group)
    }

    // 3. Ensure Object Node exists
    const existingNode = group.children.find(n => n.id === obj.id)
    if (!existingNode) {
      group.children.push({
        id: obj.id,
        name: obj.id,
        type: 'object',
        visible: true
      })
    }
  }
}

export const layerManager = LayerManager.getInstance()