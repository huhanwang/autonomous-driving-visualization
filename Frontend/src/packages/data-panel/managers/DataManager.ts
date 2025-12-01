// Frontend/src/packages/data-panel/managers/DataManager.ts

import { schemaManager, type TreeTemplateNode } from './SchemaManager'
import { EventEmitter } from '@/managers/EventEmitter'
import type { TopicData } from '@/types/topic'

// 🌟 1. 引入驱动 (通过 Vite 别名动态指向当前驱动入口)
import { packDriver as driver } from '@/driver'

// 🌟 2. 引入 UI 格式化工具 (仅保留格式化逻辑)
import { getValueIcon, getValueType, formatFieldValue } from '../utils/formatters'

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
  
  // 🌟 3. Schema 同步状态记录 (关键修复：确保这里初始化)
  private syncedSchemas: Set<string> = new Set()
  
  private constructor() {
    super()
    
    // 初始化 Worker (使用驱动工厂创建)
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
        // 降低日志级别，防止刷屏
        if (Math.random() < 0.01) { 
          console.error(`[DataManager] Worker error for ${topicKey}:`, error)
        }
      }
    }
  }

  private handleWorkerResult(topicKey: string, result: ParsedData) {
    this.parsedData.set(topicKey, result)
    
    // 构建渲染树 (目前仍在主线程，因为涉及 UI 图标)
    const rendered = this.buildRenderedTree(topicKey, result)
    if (rendered) {
      this.renderedTrees.set(topicKey, rendered)
    }
    
    // 发送轻量级通知
    const raw = this.rawData.get(topicKey)
    if (raw) {
      this.emit('data-updated', {
        topicKey,
        frameId: raw.frame_id,
        timestamp: raw.timestamp
      } as DataUpdateEvent)
    }
  }
  
  // 🌟 4. 优化后的 updateData (带 Schema 缓存检查)
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
    
    // 步骤 B: 发送纯数据进行解析 (不带 Schema，减少开销)
    this.worker.postMessage({
      type: 'PARSE', // 对应 Worker 里的 PARSE 指令
      payload: {
        topicKey,
        data: data.data
      }
    })
  }
  
  // ========== 数据访问接口 (Pull Mode) ==========
  
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
    this.syncedSchemas.delete(topicKey) // 清除同步状态
  }
  
  clear(): void {
    this.rawData.clear()
    this.parsedData.clear()
    this.renderedTrees.clear()
    this.treeCache.clear()
    this.syncedSchemas.clear() // 清除同步状态
    this.removeAllListeners()
  }

  // ========== 内部逻辑 (Tree 构建) ==========

  private buildRenderedTree(topicKey: string, parsedData: ParsedData): RenderedTreeNode[] | null {
    const template = schemaManager.getTemplate(topicKey)
    if (!template) return null
    
    // 简单优化：如果数据没变，直接返回缓存
    // const dataHash = JSON.stringify(parsedData).length.toString() // 简易哈希
    // const cached = this.treeCache.get(topicKey)
    // if (cached && cached.dataHash === dataHash) return cached.tree
    
    const tree = this.fillTemplateWithData(template, parsedData, '')
    // this.treeCache.set(topicKey, { dataHash, tree })
    return tree
  }

  private createTreeNode(name: string, value: any, path: string, templateNode?: TreeTemplateNode): RenderedTreeNode {
    const hasData = value !== undefined && value !== null
    return {
      id: path, name, path,
      type: templateNode?.type || getValueType(value),
      repeated: templateNode?.repeated || Array.isArray(value),
      icon: getValueIcon(value),
      hasData, value,
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
          if (value.length < 500) { // 限制数组显示数量，防止 DOM 爆炸
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