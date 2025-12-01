// Frontend/src/drivers/pack/worker/parser.worker.ts

import type { ParseResponse } from '@/core/types/driver'
import { parseData } from '../utils/parser'
import type { TopicSchema } from '@/core/types/common'

// 🌟 Worker 内部缓存 Schema
const schemaCache = new Map<string, TopicSchema>()

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data

  // 1. 处理 Schema 缓存指令
  if (type === 'SET_SCHEMA') {
    const { topicKey, schema } = payload
    if (topicKey && schema) {
      schemaCache.set(topicKey, schema)
      // console.log(`[Worker] Schema cached for ${topicKey}`)
    }
    return
  }

  // 2. 处理解析指令
  if (type === 'PARSE') {
    const { topicKey, data } = payload
    
    try {
      // 从缓存获取 Schema
      const schema = schemaCache.get(topicKey)
      
      if (!schema) {
        // 如果 Worker 还没收到 Schema，暂时无法解析，但这不一定是错误
        // 可能是 Schema 消息还没传过来，直接返回空或错误
        throw new Error(`Schema not found in worker cache for: ${topicKey}`)
      }

      // 执行解析
      const parsedData = parseData(data, schema)
      
      const response: ParseResponse = {
        success: true,
        topicKey,
        parsedData
      }
      
      self.postMessage(response)

    } catch (error: any) {
      self.postMessage({
        success: false,
        topicKey,
        error: error.message
      } as ParseResponse)
    }
  }
}