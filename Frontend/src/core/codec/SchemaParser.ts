// src/core/codec/SchemaParser.ts
import type { TopicSchema, TopicField } from '@/core/types/common'

/**
 * 核心 Schema 解析器
 * 职责：负责根据 Schema 将 ID-Key 的数据还原为 Name-Key 的语义化数据
 * 这是一个纯逻辑工具类，不依赖任何 Driver 或 Worker 上下文
 */
export class SchemaParser {
  
  /**
   * 解析数据的主入口
   */
  static parse(data: Record<string, any>, schema: TopicSchema): Record<string, any> {
    if (!schema || !schema.fields) return data

    // 1. 预构建字段映射 (为了性能，这里也可以由调用方传入缓存好的 map)
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
            return this.convertFieldIdsToNested(item, field.path, schema, fieldMap)
          }
          return item
        })
      }

      this.setNestedValue(result, field.path, processedValue)
    }

    return result
  }

  /**
   * 递归处理嵌套结构
   */
  private static convertFieldIdsToNested(
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

      // 校验字段是否属于当前层级
      if (!field || !field.path.startsWith(expectedPrefix)) continue

      // 计算相对路径
      const relativePath = field.path
        .slice(expectedPrefix.length)
        .replace(/\[\]$/, '')

      let processedValue = value

      if (field.repeated && field.type === 'message' && Array.isArray(value)) {
        processedValue = value.map(item =>
          typeof item === 'object' && item !== null
            ? this.convertFieldIdsToNested(item, field.path, schema, fieldMap)
            : item
        )
      }

      this.setNestedValueSimple(result, relativePath, processedValue)
    }

    return result
  }

  /**
   * 设置对象值 (完整路径)
   */
  private static setNestedValue(obj: any, path: string, value: any): void {
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
    current[parts[parts.length - 1]] = value
  }

  /**
   * 设置对象值 (相对路径)
   */
  private static setNestedValueSimple(obj: any, path: string, value: any): void {
    const parts = path.split('.')
    let current = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in current)) {
        current[part] = {}
      }
      current = current[part]
    }
    current[parts[parts.length - 1]] = value
  }
}