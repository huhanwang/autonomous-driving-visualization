// Frontend/src/packages/data-panel/utils/formatters.ts
// UI 格式化工具集 (仅保留视图层相关逻辑)

import type { TopicField } from '@/types/topic'

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