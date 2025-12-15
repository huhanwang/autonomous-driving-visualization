// Frontend/src/core/DataBus.ts

import { EventEmitter } from './EventEmitter'
import { WebSocketClient } from './WebSocketClient'
import { MessageRouter } from './MessageRouter'
import { DataCache } from './data/DataCache'
import type { Message } from './types/message'
import type { Module } from './types/module'
import type { DataCallback, UnsubscribeFn } from './types/common'

// 引入 SceneManager 用于处理 3D 场景数据
import { sceneManager } from './vis/SceneManager'

// 🌟 定义二进制消息类型枚举
enum BinaryMessageType {
  SCENE_GRAPH = 0x01, // 3D 场景数据
  IMAGE_DATA = 0x02   // 图像数据
}

// 🌟 定义图像数据事件 Payload
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
  private modules: Map<string, Module> = new Map()
  private activeModules: Set<string> = new Set()
  private subscriptions: Map<string, Set<DataCallback>> = new Map()
  
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
    
    this.setupWebSocketHandlers()
  }
  
  // ... (标准连接管理方法保持不变) ...
  async connect(url: string): Promise<void> { 
    if (this.config.debug) console.log('[DataBus] Connecting to:', url)
    await this.wsClient.connect(url) 
  }
  disconnect(): void { this.wsClient.disconnect() }
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
    // 通配符匹配
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
  
  // ========== 核心修复：二进制分流逻辑 ==========
  
  private setupWebSocketHandlers(): void {
    this.wsClient.on('connected', (d) => this.emit('connected', d))
    this.wsClient.on('disconnected', (d) => this.emit('disconnected', d))
    this.wsClient.on('error', (d) => this.emit('error', d))
    
    this.wsClient.on('message', (message: Message) => {
      // ... 模块分发 ...
      this.publish(message.type, message)
    })

    this.wsClient.on('binary', (data: ArrayBuffer) => {
      if (data.byteLength < 1) return

      const view = new DataView(data)
      const firstByte = view.getUint8(0) // 读取第1个字节

      // 🛡️ 兼容性修复：如果遇到 0x43 ('C')，说明是原始 Scene 数据 (Magic: 'SC')
      // 这意味着后端发送了没有 Header 的数据，我们需要直接兼容它
      if (firstByte === 0x43) {
        // 直接整个包传给 SceneManager，不进行切片
        sceneManager.handleBinaryMessage(data)
        return
      }

      // 标准协议：[Type: 1B] [Payload]
      // 切片获取 Payload
      const payload = data.slice(1)

      switch (firstByte) {
        case BinaryMessageType.SCENE_GRAPH: // 0x01
          sceneManager.handleBinaryMessage(payload)
          break

        case BinaryMessageType.IMAGE_DATA: // 0x02
          this.handleImagePacket(payload)
          break

        default:
          // 只有既不是 0x43 也不是标准 Type 时才报错
          if (this.config.debug) {
            console.warn(`[DataBus] Unknown binary type: 0x${firstByte.toString(16)}`)
          }
      }
    })
  }

  /**
   * 解析图像包: [TopicLen:2][Topic][Ts:8][W:2][H:2][Fmt:1][DataLen:4][Data]
   */
  private handleImagePacket(buffer: ArrayBuffer) {
    try {
      const view = new DataView(buffer)
      let offset = 0

      // 边界检查 helper
      const checkBound = (need: number) => {
        if (offset + need > buffer.byteLength) throw new Error('Packet truncated')
      }

      // 1. Topic
      checkBound(2)
      const topicLen = view.getUint16(offset, true); offset += 2
      
      checkBound(topicLen)
      const topicBytes = new Uint8Array(buffer, offset, topicLen); offset += topicLen
      const topic = new TextDecoder().decode(topicBytes)

      // 2. Metadata
      checkBound(8 + 2 + 2 + 1 + 4)
      const timestamp = view.getFloat64(offset, true); offset += 8
      const width = view.getUint16(offset, true); offset += 2
      const height = view.getUint16(offset, true); offset += 2
      const formatId = view.getUint8(offset++);
      const dataLen = view.getUint32(offset, true); offset += 4

      // 3. Image Data Body
      checkBound(dataLen)
      
      // 必须 slice 复制，防止 WebSocket 底层 buffer 复用
      const imageData = new Uint8Array(buffer.slice(offset, offset + dataLen))

      // 4. 广播事件
      this.emit('image-data', {
        topic,
        timestamp,
        width,
        height,
        format: formatId === 0 ? 'jpeg' : 'png',
        data: imageData
      })

    } catch (e) {
      // 捕获所有解析错误，防止 crash
      console.error('[DataBus] Failed to parse image packet:', e)
    }
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