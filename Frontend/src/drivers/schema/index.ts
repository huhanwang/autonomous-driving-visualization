// src/drivers/schema/index.ts
import type { IDataDriver, IDataAdapter } from '@/core/types/driver'
import { SchemaAdapter } from './adapters/SchemaAdapter'

// ✅ 指向新的 worker
import ParserWorker from './worker/parser.worker?worker'

export const schemaDriver: IDataDriver = {
  name: 'schema-driver', // ✅ 更新名称

  createWorker(): Worker {
    return new ParserWorker()
  },

  getAdapters(): IDataAdapter[] {
    return [
      new SchemaAdapter()
    ]
  },

  onConnect(ws: WebSocket) {
    console.log('[SchemaDriver] Connected to WebSocket')
  }
}