// SchemaManager.ts - Schema管理器（单例模式）

import type { TopicSchema, TopicField } from '@/types/topic'

/**
 * 树结构模板节点
 * 只包含结构信息，不包含实际数据值
 */
export interface TreeTemplateNode {
  id: string                    // 唯一标识：字段路径
  name: string                  // 字段名称
  path: string                  // 完整路径
  type: string                  // 字段类型
  repeated: boolean             // 是否数组
  icon: string                  // 显示图标
  children?: TreeTemplateNode[] // 子节点模板
  fieldId?: number              // 对应的field ID
}

/**
 * Schema信息包装
 */
interface SchemaInfo {
  schema: TopicSchema
  template: TreeTemplateNode[]
  fieldMap: Map<number, TopicField>  // field_id -> field 快速查找
  pathMap: Map<string, TopicField>   // path -> field 快速查找
}

/**
 * Schema管理器
 * 职责：
 * 1. 缓存和管理所有 topic 的 schema
 * 2. 预计算树结构模板（Schema是静态的，只需计算一次）
 * 3. 提供快速查询接口
 */
export class SchemaManager {
  private static instance: SchemaManager
  
  private schemas: Map<string, SchemaInfo> = new Map()
  
  private constructor() {}
  
  /**
   * 获取单例
   */
  static getInstance(): SchemaManager {
    if (!SchemaManager.instance) {
      SchemaManager.instance = new SchemaManager()
    }
    return SchemaManager.instance
  }
  
  /**
   * 设置 topic 的 schema
   */
  setSchema(topicKey: string, schema: TopicSchema): void {
    console.log(`📋 SchemaManager: Setting schema for ${topicKey}`)
    
    // 构建字段映射
    const fieldMap = new Map<number, TopicField>()
    const pathMap = new Map<string, TopicField>()
    
    schema.fields.forEach(field => {
      fieldMap.set(field.id, field)
      pathMap.set(field.path, field)
    })
    
    // 构建树模板
    const template = this.buildTreeTemplate(schema)
    
    // 缓存
    this.schemas.set(topicKey, {
      schema,
      template,
      fieldMap,
      pathMap
    })
    
    console.log(`✅ SchemaManager: Schema cached for ${topicKey}, ${schema.fields.length} fields`)
  }
  
  /**
   * 获取 schema
   */
  getSchema(topicKey: string): TopicSchema | undefined {
    return this.schemas.get(topicKey)?.schema
  }
  
  /**
   * 获取树模板
   */
  getTemplate(topicKey: string): TreeTemplateNode[] | undefined {
    return this.schemas.get(topicKey)?.template
  }
  
  /**
   * 通过 field_id 查找字段
   */
  getFieldById(topicKey: string, fieldId: number): TopicField | undefined {
    return this.schemas.get(topicKey)?.fieldMap.get(fieldId)
  }
  
  /**
   * 通过路径查找字段
   */
  getFieldByPath(topicKey: string, path: string): TopicField | undefined {
    return this.schemas.get(topicKey)?.pathMap.get(path)
  }
  
  /**
   * 检查是否有 schema
   */
  hasSchema(topicKey: string): boolean {
    return this.schemas.has(topicKey)
  }
  
  /**
   * 清空所有 schema
   */
  clear(): void {
    this.schemas.clear()
    console.log('🗑️ SchemaManager: All schemas cleared')
  }
  
  /**
   * 构建树结构模板
   * 核心思想：从 schema 的 fields 构建出完整的树形结构
   */
  private buildTreeTemplate(schema: TopicSchema): TreeTemplateNode[] {
    const rootNodes: Map<string, TreeTemplateNode> = new Map()
    
    // 按路径深度排序，确保父节点先创建
    const sortedFields = [...schema.fields].sort((a, b) => {
      const depthA = a.path.split('.').length
      const depthB = b.path.split('.').length
      return depthA - depthB
    })
    
    // 遍历所有字段，构建树结构
    sortedFields.forEach(field => {
      const node = this.createTemplateNode(field)
      
      // 解析路径，找到父节点
      const pathParts = this.parsePath(field.path)
      
      if (pathParts.length === 1) {
        // 根节点
        rootNodes.set(field.path, node)
      } else {
        // 子节点，找到父节点并添加
        const parentPath = pathParts.slice(0, -1).join('.')
        const parentNode = this.findNodeByPath(Array.from(rootNodes.values()), parentPath)
        
        if (parentNode) {
          if (!parentNode.children) {
            parentNode.children = []
          }
          parentNode.children.push(node)
        } else {
          // 如果找不到父节点，可能是schema定义问题，放到根节点
          console.warn(`⚠️ Parent node not found for ${field.path}, adding to root`)
          rootNodes.set(field.path, node)
        }
      }
    })
    
    return Array.from(rootNodes.values())
  }
  
  /**
   * 创建模板节点
   */
  private createTemplateNode(field: TopicField): TreeTemplateNode {
    const cleanPath = field.path.replace(/\[\]$/, '')
    
    return {
      id: cleanPath,
      name: this.getFieldName(field.path),
      path: cleanPath,
      type: field.type,
      repeated: field.repeated,
      icon: this.getFieldIcon(field),
      fieldId: field.id
    }
  }
  
  /**
   * 从路径获取字段名称
   */
  private getFieldName(path: string): string {
    const cleanPath = path.replace(/\[\]$/, '')
    const parts = cleanPath.split('.')
    return parts[parts.length - 1]
  }
  
  /**
   * 解析路径为数组
   */
  private parsePath(path: string): string[] {
    const cleanPath = path.replace(/\[\]$/, '')
    return cleanPath.split('.')
  }
  
  /**
   * 在树中查找指定路径的节点
   */
  private findNodeByPath(nodes: TreeTemplateNode[], path: string): TreeTemplateNode | null {
    for (const node of nodes) {
      if (node.path === path) {
        return node
      }
      if (node.children) {
        const found = this.findNodeByPath(node.children, path)
        if (found) return found
      }
    }
    return null
  }
  
  /**
   * 获取字段类型对应的图标
   */
  private getFieldIcon(field: TopicField): string {
    if (field.repeated) {
      return '📋'
    }
    
    switch (field.type) {
      case 'message':
        return '📦'
      case 'string':
        return '📝'
      case 'int32':
      case 'int64':
      case 'uint32':
      case 'uint64':
      case 'sint32':
      case 'sint64':
      case 'fixed32':
      case 'fixed64':
      case 'sfixed32':
      case 'sfixed64':
        return '🔢'
      case 'double':
      case 'float':
        return '🔢'
      case 'bool':
        return '✓'
      case 'bytes':
        return '📎'
      case 'enum':
        return '🏷️'
      default:
        return '❓'
    }
  }
}

// 导出单例
export const schemaManager = SchemaManager.getInstance()