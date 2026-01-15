// Frontend/src/core/data/DataManager.ts

import { schemaManager, type TreeTemplateNode } from './SchemaManager'
import { EventEmitter } from '@/core/EventEmitter'
import type { TopicData } from '@/types/topic'

import { schemaDriver as driver } from '@/driver'

// 🌟 引入 UI 格式化工具
import { getValueIcon, getValueType, formatFieldValue } from '@/packages/data-panel/utils/formatters'

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
  
  // Worker 实例
  private worker: Worker
  
  // 数据存储 (非响应式 Map)
  private rawData: Map<string, TopicData> = new Map()
  private parsedData: Map<string, ParsedData> = new Map()
  private renderedTrees: Map<string, RenderedTreeNode[]> = new Map()
  private treeCache: Map<string, CacheEntry> = new Map()
  
  // Schema 同步状态记录
  private syncedSchemas: Set<string> = new Set()

  // 🌟 [新增] UI 更新节流 (TopicKey -> Timestamp)
  private lastUiUpdate: Record<string, number> = {}
  private readonly UI_UPDATE_INTERVAL = 100; // UI 面板限制最高 10 FPS
  
  // 🌟 [新增] 环形缓冲区: 缓存最近收到的 60 帧数据
  private frameBuffer: Map<string, ParsedData[]> = new Map()
  private readonly BUFFER_SIZE = 60 
  
  private constructor() {
    super()
    
    // 初始化 Worker
    console.log(`[DataManager] Initializing with driver: ${driver.name}`)
    this.worker = driver.createWorker()
    
    // 设置监听
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
      const { success, topicKey, parsedData, error } = e.data
      
      if (success && parsedData) {
        this.handleWorkerResult(topicKey, parsedData)
      } else if (error) {
        if (Math.random() < 0.01) { 
          console.error(`[DataManager] Worker error for ${topicKey}:`, error)
        }
      }
    }
  }

  // 🌟 核心修改：只更新状态，不主动推送到 3D 渲染层
  private handleWorkerResult(topicKey: string, result: ParsedData) {
    // 1. 更新最新快照 (Atomic Update)
    this.parsedData.set(topicKey, result)
    
    // 2. 🌟 存入缓冲区 (Buffer)
    if (!this.frameBuffer.has(topicKey)) {
      this.frameBuffer.set(topicKey, [])
    }
    const buffer = this.frameBuffer.get(topicKey)!
    buffer.push(result)
    
    // 保持缓冲区大小 (FIFO)
    if (buffer.length > this.BUFFER_SIZE) {
      buffer.shift()
    }

    // 3. 构建渲染树 (UI 面板专用)
    const rendered = this.buildRenderedTree(topicKey, result)
    if (rendered) {
      this.renderedTrees.set(topicKey, rendered)
    }
    
    // 4. 通知 UI 面板 (Vue)，但必须节流
    this.notifyUiThrottled(topicKey)
  }
  
  private notifyUiThrottled(topicKey: string) {
    const now = Date.now()
    const last = this.lastUiUpdate[topicKey] || 0
    const raw = this.rawData.get(topicKey)
    
    if (raw && (now - last > this.UI_UPDATE_INTERVAL)) {
      this.emit('data-updated', {
        topicKey,
        frameId: raw.frame_id,
        timestamp: raw.timestamp
      } as DataUpdateEvent)
      
      this.lastUiUpdate[topicKey] = now
    }
  }
  
  updateData(topicKey: string, data: TopicData): void {
    this.rawData.set(topicKey, data)
    
    const schema = schemaManager.getSchema(topicKey)
    if (!schema) return
    
    // 步骤 A: 如果 Schema 还没发给 Worker，先发 Schema
    if (!this.syncedSchemas.has(topicKey)) {
      this.worker.postMessage({
        type: 'SET_SCHEMA',
        payload: { topicKey, schema }
      })
      this.syncedSchemas.add(topicKey)
    }
    
    // 步骤 B: 发送纯数据进行解析
    this.worker.postMessage({
      type: 'PARSE', 
      payload: {
        topicKey,
        data: data.data
      }
    })
  }
  
  // ========== 数据访问接口 (Pull Mode) ==========
  
  // 🌟 [新增] 获取最新解析数据 (供 SceneManager 主动调用)
  getLatestData(topicKey: string): ParsedData | undefined {
    return this.parsedData.get(topicKey)
  }
  
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
  
  // ========== 清理逻辑 ==========

  clearTopic(topicKey: string): void {
    this.rawData.delete(topicKey)
    this.parsedData.delete(topicKey)
    this.renderedTrees.delete(topicKey)
    this.treeCache.delete(topicKey)
    this.syncedSchemas.delete(topicKey) 
    this.frameBuffer.delete(topicKey)
    delete this.lastUiUpdate[topicKey]
  }
  
  clear(): void {
    this.rawData.clear()
    this.parsedData.clear()
    this.renderedTrees.clear()
    this.treeCache.clear()
    this.syncedSchemas.clear()
    this.frameBuffer.clear()
    this.lastUiUpdate = {}
    this.removeAllListeners()
  }

  // ========== 内部逻辑 (Tree 构建) ==========

  private buildRenderedTree(topicKey: string, parsedData: ParsedData): RenderedTreeNode[] | null {
    const template = schemaManager.getTemplate(topicKey)
    if (!template) return null
    
    const raw = this.rawData.get(topicKey)
    const uniqueKey = raw ? `${raw.frame_id}` : null
    
    const cached = this.treeCache.get(topicKey)
    if (uniqueKey && cached && cached.dataHash === uniqueKey) {
      return cached.tree
    }
    
    const tree = this.fillTemplateWithData(template, parsedData, '')
    
    if (uniqueKey) {
      this.treeCache.set(topicKey, { dataHash: uniqueKey, tree })
    }
    return tree
  }

  private createTreeNode(name: string, value: any, path: string, templateNode?: TreeTemplateNode): RenderedTreeNode {
    const hasData = value !== undefined && value !== null
    return {
      id: path, 
      name, 
      path,
      type: templateNode?.type || getValueType(value),
      repeated: templateNode?.repeated || Array.isArray(value),
      icon: templateNode?.icon || getValueIcon(value), 
      hasData, 
      value,
      formattedValue: hasData ? formatFieldValue(value, { type: templateNode?.type } as any) : 'null'
    }
  }

  private fillTemplateWithData(templateNodes: TreeTemplateNode[], data: any, parentPath: string = ''): RenderedTreeNode[] {
    return templateNodes.map(templateNode => {
      const fieldName = templateNode.name
      const value = data?.[fieldName]
      const currentPath = parentPath ? `${parentPath}.${fieldName}` : fieldName
      const node = this.createTreeNode(fieldName, value, currentPath, templateNode)
      
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          node.formattedValue = `[${value.length} items]`
          if (value.length < 500) { 
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

  private buildArrayChildren(array: any[], templateNode: TreeTemplateNode, parentPath: string): RenderedTreeNode[] {
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