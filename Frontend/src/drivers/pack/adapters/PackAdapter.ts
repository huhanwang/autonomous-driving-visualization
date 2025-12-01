// Frontend/src/drivers/pack/adapters/PackAdapter.ts

import type { IDataAdapter } from '@/core/types/driver'
import type { RenderableObject } from '@/core/types/viz-standard'

/**
 * 通用 Pack 适配器
 * 目前只是一个空实现，未来在这里根据 Schema 类型将 parsedData 转换为 Point/Line
 */
export class PackAdapter implements IDataAdapter {
  
  canHandle(topic: string, schemaType?: string): boolean {
    // 默认接管所有 Pack 数据，或者根据 schemaType 细分
    return true
  }

  transform(data: any, context?: any): RenderableObject[] {
    const results: RenderableObject[] = []

    // TODO: 这里是未来 2D/3D 可视化的核心
    // 示例：如果数据里有 "position.x" 和 "position.y"，转为点
    /*
    if (data.position && typeof data.position.x === 'number') {
      results.push({
        id: context?.id || 'unknown',
        type: 'point',
        position: { x: data.position.x, y: data.position.y, z: 0 }
      })
    }
    */

    return results
  }
}