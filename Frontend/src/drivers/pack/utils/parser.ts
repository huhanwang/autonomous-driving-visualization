// Frontend/src/drivers/pack/utils/parser.ts
// 纯数据解析工具 (运行在 Worker 中)

import type { TopicSchema, TopicField } from '@/core/types/common'

/**
 * 设置嵌套对象的值 (完整路径版)
 */
export function setNestedValue(obj: any, path: string, value: any): void {
  // 移除数组标记 []
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
 * 设置嵌套对象的值 (相对路径版 - 用于递归内部)
 */
export function setNestedValueSimple(obj: any, path: string, value: any): void {
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

/**
 * 递归转换嵌套对象中的 Field ID -> 嵌套结构
 */
export function convertFieldIdsToNested(
  obj: Record<string, any>,
  parentPath: string,
  schema: TopicSchema,
  fieldMap: Map<number, TopicField>
): any {
  const result: any = {}
  const cleanParentPath = parentPath.replace(/\[\]$/, '')
  const expectedPrefix = cleanParentPath ? `${cleanParentPath}.` : ''

  for (const [fieldIdStr, value] of Object.entries(obj)) {
    const fieldId = parseInt(fieldIdStr)
    const field = fieldMap.get(fieldId)

    // 校验字段是否属于当前层级结构
    if (!field || !field.path.startsWith(expectedPrefix)) continue

    // 计算相对路径
    const relativePath = field.path
      .slice(expectedPrefix.length)
      .replace(/\[\]$/, '')

    let processedValue = value

    if (field.repeated && field.type === 'message' && Array.isArray(value)) {
      processedValue = value.map(item =>
        typeof item === 'object' && item !== null
          ? convertFieldIdsToNested(item, field.path, schema, fieldMap)
          : item
      )
    }

    setNestedValueSimple(result, relativePath, processedValue)
  }

  return result
}

/**
 * 解析扁平数据为嵌套结构 (主入口)
 */
export function parseData(data: Record<string, any>, schema: TopicSchema): Record<string, any> {
  if (!schema || !schema.fields) return data

  // 预构建字段映射
  const fieldMap = new Map<number, TopicField>()
  for (const field of schema.fields) {
    fieldMap.set(field.id, field)
  }

  const result: Record<string, any> = {}

  for (const [fieldIdStr, value] of Object.entries(data)) {
    const fieldId = parseInt(fieldIdStr)
    const field = fieldMap.get(fieldId)

    if (!field) continue

    let processedValue = value

    // 处理 repeated message
    if (field.repeated && field.type === 'message' && Array.isArray(value)) {
      processedValue = value.map(item => {
        if (typeof item === 'object' && item !== null) {
          return convertFieldIdsToNested(item, field.path, schema, fieldMap)
        }
        return item
      })
    }

    setNestedValue(result, field.path, processedValue)
  }

  return result
}