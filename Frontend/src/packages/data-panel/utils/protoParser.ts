// protoParser.ts - 优化版

import type { TopicSchema, TopicField, ParsedTopicData } from '@/types/topic'

/**
 * 值格式化器集合
 */
export const ValueFormatters = {
  bytes: (value: any) => {
    const length = Array.isArray(value) ? value.length : 
                   typeof value === 'string' ? value.length : 0
    return `[${length} bytes]`
  },
  
  number: (value: number, type?: string) => {
    if (type === 'double' || type === 'float') {
      return value.toFixed(6)
    }
    return value.toString()
  },
  
  string: (value: string, maxLength = 100) => {
    return value.length > maxLength 
      ? value.substring(0, maxLength) + '...' 
      : value
  },
  
  array: (value: any[]) => `[${value.length} items]`,
  
  boolean: (value: boolean) => value ? 'true' : 'false',
  
  object: () => '{...}',
  
  null: () => 'null'
}

/**
 * 格式化字段值用于显示
 */
export function formatFieldValue(value: any, field?: TopicField): string {
  if (value === null || value === undefined) {
    return ValueFormatters.null()
  }
  
  if (field?.type === 'bytes') {
    return ValueFormatters.bytes(value)
  }
  
  if (Array.isArray(value)) {
    return ValueFormatters.array(value)
  }
  
  const type = typeof value
  
  if (type === 'number') {
    return ValueFormatters.number(value, field?.type)
  }
  
  if (type === 'boolean') {
    return ValueFormatters.boolean(value)
  }
  
  if (type === 'string') {
    return ValueFormatters.string(value)
  }
  
  if (type === 'object') {
    return ValueFormatters.object()
  }
  
  return String(value)
}

/**
 * 获取值类型的图标
 */
export function getValueIcon(value: any): string {
  if (value === null || value === undefined) return '∅'
  if (Array.isArray(value)) return '📋'
  if (typeof value === 'object') return '📦'
  if (typeof value === 'number') return '🔢'
  if (typeof value === 'boolean') return '✓'
  if (typeof value === 'string') return '📝'
  return '❓'
}

/**
 * 获取值的类型字符串
 */
export function getValueType(value: any): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value
}

/**
 * 设置嵌套对象的值
 */
export function setNestedValue(obj: any, path: string, value: any): void {
  const cleanPath = path.replace(/\[\]$/, '')
  const parts = cleanPath.split('.')
  
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

/**
 * 字段节点
 */
export interface FieldNode {
  id: string
  name: string
  type: string
  icon: string
  value?: any
  formattedValue?: string
  children?: FieldNode[]
}

/**
 * 从对象构建树形结构（使用队列遍历）
 */
export function buildFieldTree(obj: any, parentPath: string = ''): FieldNode[] {
  if (!obj || typeof obj !== 'object') return []
  
  const nodes: FieldNode[] = []
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key
    
    const node: FieldNode = {
      id: currentPath,
      name: key,
      type: getValueType(value),
      icon: getValueIcon(value)
    }
    
    if (Array.isArray(value)) {
      node.formattedValue = `[${value.length} items]`
      node.children = buildArrayChildren(value, currentPath)
    } else if (typeof value === 'object' && value !== null) {
      node.children = buildFieldTree(value, currentPath)
    } else {
      node.value = value
      node.formattedValue = formatFieldValue(value)
    }
    
    nodes.push(node)
  }
  
  return nodes
}

/**
 * 构建数组子节点
 */
function buildArrayChildren(array: any[], parentPath: string): FieldNode[] {
  return array.map((item, index) => {
    const arrayItemPath = `${parentPath}[${index}]`
    
    if (typeof item === 'object' && item !== null) {
      return {
        id: arrayItemPath,
        name: `[${index}]`,
        type: 'object',
        icon: '📦',
        children: buildFieldTree(item, arrayItemPath)
      }
    } else {
      return {
        id: arrayItemPath,
        name: `[${index}]`,
        type: typeof item,
        icon: getValueIcon(item),
        value: item,
        formattedValue: formatFieldValue(item)
      }
    }
  })
}

/**
 * 展平树结构（使用队列遍历避免递归栈溢出）
 */
export function flattenTree(nodes: FieldNode[]): FieldNode[] {
  const result: FieldNode[] = []
  const queue = [...nodes]
  
  while (queue.length > 0) {
    const node = queue.shift()!
    result.push(node)
    
    if (node.children) {
      queue.push(...node.children)
    }
  }
  
  return result
}

/**
 * 搜索树节点（优化版）
 */
export function searchTree(nodes: FieldNode[], searchText: string): FieldNode[] {
  if (!searchText) return nodes
  
  const lowerSearch = searchText.toLowerCase()
  const flatNodes = flattenTree(nodes)
  
  return flatNodes.filter(node => 
    node.name.toLowerCase().includes(lowerSearch) ||
    node.formattedValue?.toLowerCase().includes(lowerSearch)
  )
}