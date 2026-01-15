// src/core/DataBus.ts

import { EventEmitter } from './EventEmitter'
import { WebSocketClient } from './WebSocketClient'
import { MessageRouter } from './MessageRouter'
import { DataCache } from './data/DataCache'
import type { Message } from './types/message'
import type { Module } from './types/module'
import type { DataCallback, UnsubscribeFn } from './types/common'
import { sceneManager } from './vis/SceneManager'
import VizParserWorker from '@/drivers/schema/worker/viz-parser.worker.ts?worker'

enum BinaryMessageType {
  SCENE_GRAPH = 0x01,
  IMAGE_DATA = 0x02
}

export interface ImageDataEvent {
  topic: string
  timestamp: number
  width: number
  height: number
  format: 'jpeg' | 'png'
  data: Uint8Array
}

export interface DataBusConfig {
  wsUrl?: string
  reconnect?: boolean
  reconnectInterval?: number
  cacheSize?: number
  debug?: boolean
}

export class DataBus extends EventEmitter {
  private config: DataBusConfig
  private wsClient: WebSocketClient
  private messageRouter: MessageRouter
  private dataCache: DataCache
  private subscriptions: Map<string, Set<DataCallback>> = new Map()
  
  private parserWorker: Worker
  
  // 🌟 [新增] 数据流总开关
  // true: 正常接收所有数据
  // false: 丢弃所有业务数据 (TopicData, Binary)，只保留控制信令 (Status, Ack)
  private isDataFlowEnabled: boolean = true

  constructor(config: DataBusConfig = {}) {
    super()
    this.config = {
      reconnect: true,
      reconnectInterval: 3000,
      cacheSize: 100,
      debug: false,
      ...config
    }
    
    this.wsClient = new WebSocketClient({
      reconnect: this.config.reconnect,
      reconnectInterval: this.config.reconnectInterval,
      heartbeatInterval: 30000,
      debug: this.config.debug
    })
    
    this.messageRouter = new MessageRouter()
    this.dataCache = new DataCache(this.config.cacheSize)
    
    this.parserWorker = new VizParserWorker()
    this.setupWorkerHandlers()

    this.setupWebSocketHandlers()
  }

  // 🌟 [新增] 控制数据闸门
  public setDataFlowEnabled(enabled: boolean) {
    this.isDataFlowEnabled = enabled
  }

  private setupWorkerHandlers() {
    this.parserWorker.onmessage = (e) => {
      const { type, data, success, error } = e.data
      
      // 🌟 [优化] 即使 Worker 解析完了，如果现在闸门关了，也不要交给 SceneManager
      // (双重保险，防止 Worker 解析耗时导致的数据延迟到达)
      if (!this.isDataFlowEnabled) return

      if (type === 'SCENE_PARSED' && success) {
        sceneManager.handleDecodedFrame(data)
      } else if (type === 'ERROR') {
        if (this.config.debug) console.warn('[DataBus] Worker parse error:', error)
      }
    }
    
    this.parserWorker.onerror = (err) => {
      console.error('[DataBus] Worker system error:', err)
    }
  }

  private sendToWorker(buffer: ArrayBuffer) {
    this.parserWorker.postMessage(
      { type: 'PARSE_SCENE', payload: buffer },
      [buffer] 
    )
  }

  // ... (Connect, Subscribe 等标准方法保持不变) ...
  async connect(url: string): Promise<void> { await this.wsClient.connect(url) }
  disconnect(): void { this.wsClient.disconnect(); this.parserWorker.terminate() }
  isConnected(): boolean { return this.wsClient.isConnected() }
  
  subscribe<T = any>(topic: string, callback: DataCallback<T>): UnsubscribeFn {
    if (!this.subscriptions.has(topic)) this.subscriptions.set(topic, new Set())
    this.subscriptions.get(topic)!.add(callback as DataCallback)
    return () => this.unsubscribe(topic, callback as DataCallback)
  }
  unsubscribe(topic: string, callback?: DataCallback): void {
    const callbacks = this.subscriptions.get(topic)
    if (!callbacks) return
    if (callback) {
      callbacks.delete(callback)
      if (callbacks.size === 0) this.subscriptions.delete(topic)
    } else {
      this.subscriptions.delete(topic)
    }
  }
  publish<T = any>(topic: string, data: T): void {
    const callbacks = this.subscriptions.get(topic)
    if (callbacks) callbacks.forEach(cb => { try { cb(data) } catch(e){} })
    // Wildcard matching
    for (const [pattern, cbs] of this.subscriptions.entries()) {
      if (pattern.includes('*') && this.matchPattern(topic, pattern)) {
        cbs.forEach(cb => { try { cb(data) } catch(e){} })
      }
    }
  }
  sendCommand(type: string, params?: any): boolean {
    if (!this.isConnected()) return false
    return this.wsClient.send({ type, timestamp: Date.now(), ...(params && { params }) })
  }
  async request<T>(type: string, params?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substr(2, 9)
      const timeout = setTimeout(() => {
        this.off('response:' + requestId, handler)
        reject(new Error('Request timeout'))
      }, 5000)
      const handler = (response: any) => {
        clearTimeout(timeout)
        if (response.error) resolve(response as any)
        else resolve(response.data)
      }
      this.once('response:' + requestId, handler)
      this.sendCommand(type, { ...params, _requestId: requestId })
    })
  }

  private setupWebSocketHandlers(): void {
    this.wsClient.on('connected', (d) => this.emit('connected', d))
    this.wsClient.on('disconnected', (d) => this.emit('disconnected', d))
    this.wsClient.on('error', (d) => this.emit('error', d))
    
    this.wsClient.on('message', (message: Message) => {
      // 🌟 [核心拦截逻辑 - 文本消息]
      // 如果闸门关闭，并且消息类型是数据推送 (TOPIC_DATA)，直接丢弃。
      // 但必须放行控制消息 (如 STATUS, ACK, SCHEMA 等)，否则 UI 会失去响应。
      if (!this.isDataFlowEnabled) {
        if (message.type === 'TOPIC_DATA') {
            return
        }
      }
      
      this.publish(message.type, message)
    })

    this.wsClient.on('binary', (data: ArrayBuffer) => {
      // 🌟 [核心拦截逻辑 - 二进制消息]
      // 二进制消息通常全是重型业务数据 (3D场景、图像)，如果闸门关闭，全部丢弃。
      // 这将直接切断 2D、3D、图像 的数据源，实现“秒停”。
      if (!this.isDataFlowEnabled) {
          return 
      }

      if (data.byteLength < 1) return

      const view = new DataView(data)
      const firstByte = view.getUint8(0) 

      if (firstByte === 0x43) {
        this.sendToWorker(data)
        return
      }

      const payload = data.slice(1)

      switch (firstByte) {
        case BinaryMessageType.SCENE_GRAPH:
          this.sendToWorker(payload)
          break

        case BinaryMessageType.IMAGE_DATA:
          this.handleImagePacket(payload)
          break

        default:
          if (this.config.debug) {
            console.warn(`[DataBus] Unknown binary type: 0x${firstByte.toString(16)}`)
          }
      }
    })
  }

  private handleImagePacket(buffer: ArrayBuffer) {
    try {
      const view = new DataView(buffer)
      let offset = 0
      const checkBound = (need: number) => { if (offset + need > buffer.byteLength) throw new Error('Packet truncated') }

      checkBound(2)
      const topicLen = view.getUint16(offset, true); offset += 2
      checkBound(topicLen)
      const topicBytes = new Uint8Array(buffer, offset, topicLen); offset += topicLen
      const topic = new TextDecoder().decode(topicBytes)

      checkBound(8 + 2 + 2 + 1 + 4)
      const timestamp = view.getFloat64(offset, true); offset += 8
      const width = view.getUint16(offset, true); offset += 2
      const height = view.getUint16(offset, true); offset += 2
      const formatId = view.getUint8(offset++);
      const dataLen = view.getUint32(offset, true); offset += 4

      checkBound(dataLen)
      const imageData = new Uint8Array(buffer.slice(offset, offset + dataLen))

      this.emit('image-data', { topic, timestamp, width, height, format: formatId === 0 ? 'jpeg' : 'png', data: imageData })

    } catch (e) { console.error('[DataBus] Failed to parse image packet:', e) }
  }
  
  private matchPattern(str: string, pattern: string): boolean {
    const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${regexPattern}$`).test(str)
  }

  destroy(): void {
    this.disconnect()
    this.dataCache.clear()
    this.subscriptions.clear()
    this.removeAllListeners()
  }
}

export const dataBus = new DataBus({
  debug: import.meta.env?.DEV || false
})