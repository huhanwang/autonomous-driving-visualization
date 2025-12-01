// Frontend/src/drivers/pack/worker/parser.worker.ts

import type { ParseRequest, ParseResponse } from '@/core/types/driver'
import { parseData } from '../utils/parser'
import type { TopicSchema } from '@/core/types/common'

// 🌟 新增：Worker 内部缓存 Schema
const schemaCache = new Map<string, TopicSchema>()

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data

  // 1. 处理 Schema 缓存指令
  if (type === 'SET_SCHEMA') {
    const { topicKey, schema } = payload
    schemaCache.set(topicKey, schema)
    return
  }

  // 2. 处理解析指令
  if (type === 'PARSE') {
    const { topicKey, data } = payload
    
    try {
      // 从缓存获取 Schema，不再依赖主线程每次都传
      const schema = schemaCache.get(topicKey)
      
      if (!schema) {
        throw new Error(`Schema not found in worker cache for: ${topicKey}`)
      }

      const parsedData = parseData(data, schema)
      
      self.postMessage({
        success: true,
        topicKey,
        parsedData
      } as ParseResponse)

    } catch (error: any) {
      self.postMessage({
        success: false,
        topicKey,
        error: error.message
      } as ParseResponse)
    }
  }
}