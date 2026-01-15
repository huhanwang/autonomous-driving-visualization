// src/drivers/schema/worker/viz-parser.worker.ts

import { VizDecoder, type DecodeResult } from '@/core/protocol/VizDecoder'

// 辅助函数：收集所有可转移对象（ArrayBuffer）
// 以实现零拷贝传输
function collectTransferables(obj: any, transferables: Set<ArrayBuffer>) {
  if (!obj || typeof obj !== 'object') return

  if (obj instanceof ArrayBuffer) {
    transferables.add(obj)
    return
  }

  // TypedArray (Uint8Array, Float32Array 等) 的 buffer
  if (ArrayBuffer.isView(obj)) {
    transferables.add(obj.buffer)
    return
  }

  // 递归遍历数组或对象
  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectTransferables(item, transferables)
    }
  } else {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        collectTransferables(obj[key], transferables)
      }
    }
  }
}

// Worker 内部的消息处理逻辑
self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data

  try {
    if (type === 'PARSE_SCENE') {
      // 1. 执行耗时的解码操作 (CPU 密集型)
      // payload 是 ArrayBuffer，VizDecoder 会同步解析它
      const result = VizDecoder.decode(payload) 
      
      // 🌟 [核心优化] 收集 Transferable Objects
      // 防止主线程接收结果时发生深拷贝 (Deep Clone) 导致的卡顿
      const transferables = new Set<ArrayBuffer>()
      collectTransferables(result, transferables)

      // 2. 将解析后的对象发回主线程 (Zero-Copy)
      self.postMessage(
        {
          type: 'SCENE_PARSED',
          success: true,
          data: result
        },
        Array.from(transferables) // 转移所有权
      )
    }
  } catch (error) {
    console.error('[VizParserWorker] Parse error:', error)
    self.postMessage({
      type: 'ERROR',
      success: false,
      error: error
    })
  }
}