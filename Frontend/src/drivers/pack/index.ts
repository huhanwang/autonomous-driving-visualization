// Frontend/src/drivers/pack/index.ts
// Pack 驱动入口

import type { IDataDriver, IDataAdapter } from '@/core/types/driver'
import { PackAdapter } from './adapters/PackAdapter'

// 这里的 ?worker 是 Vite 的特定语法，表示导入为 Worker 构造函数
import ParserWorker from './worker/parser.worker?worker'

export const packDriver: IDataDriver = {
  name: 'pack-driver',

  // 1. 工厂方法：创建解析 Worker
  createWorker(): Worker {
    return new ParserWorker()
  },

  // 2. 获取适配器列表
  getAdapters(): IDataAdapter[] {
    return [
      new PackAdapter()
    ]
  },

  // 3. 连接钩子 (Pack 协议目前不需要特殊握手，留空)
  onConnect(ws: WebSocket) {
    console.log('[PackDriver] Connected to WebSocket')
  }
}