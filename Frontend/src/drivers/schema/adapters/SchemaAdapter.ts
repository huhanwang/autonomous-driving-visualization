// src/drivers/schema/adapters/SchemaAdapter.ts
import type { IDataAdapter } from '@/core/types/driver'
import type { RenderableObject } from '@/core/types/viz-standard'

// ✅ 改名为 SchemaAdapter
export class SchemaAdapter implements IDataAdapter {
  
  canHandle(topic: string, schemaType?: string): boolean {
    return true
  }

  transform(data: any, context?: any): RenderableObject[] {
    const results: RenderableObject[] = []
    // TODO: 实现通用转换逻辑
    return results
  }
}