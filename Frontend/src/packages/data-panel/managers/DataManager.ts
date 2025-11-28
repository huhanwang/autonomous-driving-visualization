// DataManager.ts - 优化版

import type { TopicData } from '@/types/topic'
import { schemaManager, type TreeTemplateNode } from './SchemaManager'
import { EventEmitter } from '@/managers/EventEmitter'
import { setNestedValue, getValueIcon, getValueType, formatFieldValue } from '../utils/protoParser'

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

export class DataManager extends EventEmitter {
  private static instance: DataManager
  
  private rawData: Map<string, TopicData> = new Map()
  private parsedData: Map<string, ParsedData> = new Map()
  private renderedTrees: Map<string, RenderedTreeNode[]> = new Map()
  private treeCache: Map<string, CacheEntry> = new Map()
  
  private constructor() {
    super()
  }
  
  static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager()
    }
    return DataManager.instance
  }
  
  // 在 DataManager.ts 的 updateData 方法中添加
  updateData(topicKey: string, data: TopicData): void {
    // console.log('🔄 DataManager.updateData:', topicKey, 'frame:', data.frame_id)
    
    this.rawData.set(topicKey, data)
    
    const parsed = this.parseData(topicKey, data.data)
    if (!parsed) return
    this.parsedData.set(topicKey, parsed)
    
    const rendered = this.buildRenderedTree(topicKey, parsed)
    if (!rendered) return
    this.renderedTrees.set(topicKey, rendered)
    
    // console.log('📤 Emitting data-updated event')
    this.emit('data-updated', {
      topicKey,
      frameId: data.frame_id,
      timestamp: data.timestamp,
      renderedTree: rendered
    })
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
  
  private parseData(topicKey: string, data: Record<string, any>): ParsedData | null {
    const schema = schemaManager.getSchema(topicKey)
    if (!schema) return null
    
    const result: ParsedData = {}
    
    for (const [fieldIdStr, value] of Object.entries(data)) {
      const fieldId = parseInt(fieldIdStr)
      const field = schemaManager.getFieldById(topicKey, fieldId)
      
      if (!field) continue
      
      let processedValue = value
      
      if (field.repeated && field.type === 'message' && Array.isArray(value)) {
        processedValue = value.map(item => {
          if (typeof item === 'object' && item !== null) {
            return this.convertFieldIdsToNested(topicKey, item, field.path)
          }
          return item
        })
      }
      
      setNestedValue(result, field.path, processedValue)
    }
    
    return result
  }
  
  private convertFieldIdsToNested(
    topicKey: string, 
    obj: Record<string, any>,
    parentPath: string
  ): any {
    const schema = schemaManager.getSchema(topicKey)
    if (!schema) return obj
    
    const result: any = {}
    const cleanParentPath = parentPath.replace(/\[\]$/, '')
    const expectedPrefix = cleanParentPath ? `${cleanParentPath}.` : ''
    
    for (const [fieldIdStr, value] of Object.entries(obj)) {
      const fieldId = parseInt(fieldIdStr)
      const field = schemaManager.getFieldById(topicKey, fieldId)
      
      if (!field || !field.path.startsWith(expectedPrefix)) continue
      
      const relativePath = field.path
        .slice(expectedPrefix.length)
        .replace(/\[\]$/, '')
      
      let processedValue = value
      
      if (field.repeated && field.type === 'message' && Array.isArray(value)) {
        processedValue = value.map(item => 
          typeof item === 'object' && item !== null
            ? this.convertFieldIdsToNested(topicKey, item, field.path)
            : item
        )
      }
      
      this.setNestedValueSimple(result, relativePath, processedValue)
    }
    
    return result
  }
  
  private setNestedValueSimple(obj: any, path: string, value: any): void {
    const parts = path.split('.')
    let current = obj
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in current)) {
        current[part] = {}
      }
      current = current[part]
    }
    
    const lastPart = parts[parts.length - 1]
    current[lastPart] = value
  }
  
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
    return JSON.stringify(data)
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
          node.children = this.buildArrayChildren(value, templateNode, currentPath)
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