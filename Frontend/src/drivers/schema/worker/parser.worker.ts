// src/drivers/schema/worker/parser.worker.ts

import type { ParseResponse } from '@/core/types/driver'
import type { TopicSchema } from '@/core/types/common'

// ✅ 引入核心解析器
import { SchemaParser } from '@/core/codec/SchemaParser'

const schemaCache = new Map<string, TopicSchema>()

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data

  if (type === 'SET_SCHEMA') {
    const { topicKey, schema } = payload
    if (topicKey && schema) {
      schemaCache.set(topicKey, schema)
    }
    return
  }

  if (type === 'PARSE') {
    const { topicKey, data } = payload
    
    try {
      const schema = schemaCache.get(topicKey)
      if (!schema) {
        throw new Error(`Schema not found in worker cache for: ${topicKey}`)
      }

      // ✅ 调用核心解析器
      const parsedData = SchemaParser.parse(data, schema)
      
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