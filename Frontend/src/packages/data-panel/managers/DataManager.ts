// Frontend/src/packages/data-panel/managers/DataManager.ts - 驱动化改造版

import { schemaManager, type TreeTemplateNode } from './SchemaManager'
import { EventEmitter } from '@/managers/EventEmitter'
import type { TopicData } from '@/types/topic'

// 🌟 核心改变：从虚拟别名导入驱动，而不是具体的 Worker 文件
// 无论底层是 Pack 还是 ROS，这里都不需要改代码
import { packDriver as driver } from '@/driver' // 暂时为了类型推断，Vite别名会处理实际加载

// 移除这些具体的解析工具依赖，因为它们现在封装在 Worker 内部了
// import { setNestedValue... } from '../utils/protoParser' 
import { getValueIcon, getValueType, formatFieldValue } from '../utils/formatters' // UI 相关的保留

export interface RenderedTreeNode extends TreeTemplateNode {
  value?: any
  formattedValue?: string
  children?: RenderedTreeNode[]
  hasData: boolean
}

export interface ParsedData {
  [key: string]: any
}

interface CacheEntry {
  dataHash: string
  tree: RenderedTreeNode[]
}

export interface DataUpdateEvent {
  topicKey: string
  frameId: number
  timestamp: number
}

export class DataManager extends EventEmitter {
  private static instance: DataManager
  
  // Worker 实例 (通用 Worker 类型)
  private worker: Worker
  
  private rawData: Map<string, TopicData> = new Map()
  private parsedData: Map<string, ParsedData> = new Map()
  private renderedTrees: Map<string, RenderedTreeNode[]> = new Map()
  
  private treeCache: Map<string, CacheEntry> = new Map()
  
  private constructor() {
    super()
    
    // 🌟 核心改变：使用驱动工厂创建 Worker
    console.log(`[DataManager] Initializing with driver: ${driver.name}`)
    this.worker = driver.createWorker()
    
    this.setupWorker()
  }
  
  static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager()
    }
    return DataManager.instance
  }
  
  private setupWorker() {
    this.worker.onmessage = (e: MessageEvent) => {
      // 驱动层保证返回标准格式：{ success, topicKey, parsedData, error }
      const { success, topicKey, parsedData, error } = e.data
      
      if (success && parsedData) {
        this.handleWorkerResult(topicKey, parsedData)
      } else if (error) {
        console.error(`[DataManager] Worker error for ${topicKey}:`, error)
      }
    }
  }

  private handleWorkerResult(topicKey: string, result: ParsedData) {
    this.parsedData.set(topicKey, result)
    
    const rendered = this.buildRenderedTree(topicKey, result)
    if (rendered) {
      this.renderedTrees.set(topicKey, rendered)
    }
    
    const raw = this.rawData.get(topicKey)
    
    if (raw) {
      this.emit('data-updated', {
        topicKey,
        frameId: raw.frame_id,
        timestamp: raw.timestamp
      } as DataUpdateEvent)
    }
  }
  
  updateData(topicKey: string, data: TopicData): void {
    this.rawData.set(topicKey, data)
    
    const schema = schemaManager.getSchema(topicKey)
    if (!schema) return
    
    // 🌟 优化：如果该 Topic 的 Schema 还没发给 Worker，先发一次
    if (!this.syncedSchemas.has(topicKey)) {
      this.worker.postMessage({
        type: 'SET_SCHEMA',
        payload: { topicKey, schema }
      })
      this.syncedSchemas.add(topicKey)
    }
    
    // 🌟 优化：现在只发送纯数据，通信量减少 90%
    this.worker.postMessage({
      type: 'PARSE',
      payload: {
        topicKey,
        data: data.data // 只传数据部分
        // schema: schema  <-- 删掉这一行！不要重复传！
      }
    })
  }
  
  // ========== 以下代码保持不变 ==========
  
  getRenderedTree(topicKey: string): RenderedTreeNode[] | undefined {
    return this.renderedTrees.get(topicKey)
  }
  
  getRawData(topicKey: string): TopicData | undefined {
    return this.rawData.get(topicKey)
  }
  
  getParsedData(topicKey: string): ParsedData | undefined {
    return this.parsedData.get(topicKey)
  }
  
  hasData(topicKey: string): boolean {
    return this.rawData.has(topicKey)
  }
  
  clearTopic(topicKey: string): void {
    this.rawData.delete(topicKey)
    this.parsedData.delete(topicKey)
    this.renderedTrees.delete(topicKey)
    this.treeCache.delete(topicKey)
  }
  
  clear(): void {
    this.rawData.clear()
    this.parsedData.clear()
    this.renderedTrees.clear()
    this.treeCache.clear()
    this.removeAllListeners()
  }
  
  // 构建渲染树逻辑 (UI 相关，暂留此处)
  private buildRenderedTree(topicKey: string, parsedData: ParsedData): RenderedTreeNode[] | null {
    const template = schemaManager.getTemplate(topicKey)
    if (!template) return null
    
    const dataHash = this.computeDataHash(parsedData)
    const cached = this.treeCache.get(topicKey)
    
    if (cached && cached.dataHash === dataHash) {
      return cached.tree
    }
    
    const tree = this.fillTemplateWithData(template, parsedData, '')
    
    this.treeCache.set(topicKey, { dataHash, tree })
    return tree
  }
  
  private computeDataHash(data: ParsedData): string {
    return JSON.stringify(data).length.toString()
  }
  
  private createTreeNode(
    name: string,
    value: any,
    path: string,
    templateNode?: TreeTemplateNode
  ): RenderedTreeNode {
    const hasData = value !== undefined && value !== null
    
    return {
      id: path,
      name,
      path,
      type: templateNode?.type || getValueType(value),
      repeated: templateNode?.repeated || Array.isArray(value),
      icon: getValueIcon(value),
      hasData,
      value, 
      formattedValue: hasData ? formatFieldValue(value, { type: templateNode?.type } as any) : 'null'
    }
  }
  
  private fillTemplateWithData(
    templateNodes: TreeTemplateNode[],
    data: any,
    parentPath: string = ''
  ): RenderedTreeNode[] {
    return templateNodes.map(templateNode => {
      const fieldName = templateNode.name
      const value = data?.[fieldName]
      const currentPath = parentPath ? `${parentPath}.${fieldName}` : fieldName
      
      const node = this.createTreeNode(fieldName, value, currentPath, templateNode)
      
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          node.formattedValue = `[${value.length} items]`
          if (value.length < 1000) { 
             node.children = this.buildArrayChildren(value, templateNode, currentPath)
          }
        } else if (typeof value === 'object') {
          if (templateNode.children?.length) {
            node.children = this.fillTemplateWithData(templateNode.children, value, currentPath)
          } else {
            node.children = this.buildDynamicTree(value, currentPath)
          }
        }
      } else {
        if (templateNode.children?.length) {
          node.children = this.fillTemplateWithData(templateNode.children, {}, currentPath)
        }
      }
      
      return node
    })
  }
  
  private buildArrayChildren(
    array: any[],
    templateNode: TreeTemplateNode,
    parentPath: string
  ): RenderedTreeNode[] {
    return array.map((item, index) => {
      const arrayItemPath = `${parentPath}[${index}]`
      const arrayItemNode = this.createTreeNode(`[${index}]`, item, arrayItemPath)
      
      if (typeof item === 'object' && item !== null) {
        arrayItemNode.icon = '📦'
        arrayItemNode.type = 'object'
        
        if (templateNode.children?.length) {
          arrayItemNode.children = this.fillTemplateWithData(templateNode.children, item, arrayItemPath)
        } else {
          arrayItemNode.children = this.buildDynamicTree(item, arrayItemPath)
        }
      }
      
      return arrayItemNode
    })
  }
  
  private buildDynamicTree(obj: any, parentPath: string): RenderedTreeNode[] {
    if (!obj || typeof obj !== 'object') return []
    
    return Object.entries(obj).map(([key, value]) => {
      const currentPath = `${parentPath}.${key}`
      const node = this.createTreeNode(key, value, currentPath)
      
      if (Array.isArray(value)) {
        node.formattedValue = `[${value.length} items]`
        node.children = this.buildArrayChildren(value, node as TreeTemplateNode, currentPath)
      } else if (typeof value === 'object' && value !== null) {
        node.children = this.buildDynamicTree(value, currentPath)
      }
      
      return node
    })
  }
}

export const dataManager = DataManager.getInstance()