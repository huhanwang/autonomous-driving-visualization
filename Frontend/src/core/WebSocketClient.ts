// src/core/WebSocketClient.ts - WebSocket客户端封装 (二元结构优化版)

import { EventEmitter } from './EventEmitter'
import type { Message } from './types/message'

/**
 * WebSocket客户端配置
 */
export interface WebSocketClientConfig {
  reconnect?: boolean          // 是否自动重连
  reconnectInterval?: number   // 重连间隔（毫秒）
  heartbeatInterval?: number   // 心跳间隔（毫秒）
  debug?: boolean             // 是否开启调试
}

/**
 * 消息队列项 (仅用于非紧急的大型文本数据)
 */
interface QueueItem {
  data: any
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null
  private url: string = ''
  private config: WebSocketClientConfig
  
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private isManualClose: boolean = false
  
  // 仅用于处理非关键文本消息的队列
  private messageQueue: QueueItem[] = []
  private isProcessingQueue: boolean = false
  
  // 文本处理时间预算 (ms)
  private readonly FRAME_BUDGET_MS = 4 
  
  constructor(config: WebSocketClientConfig = {}) {
    super()
    
    this.config = {
      reconnect: true,
      reconnectInterval: 3000,
      heartbeatInterval: 30000,
      debug: false,
      ...config
    }
  }
  
  async connect(url: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.warn('[WS] Already connected')
      return
    }
    
    this.url = url
    this.isManualClose = false
    
    return new Promise((resolve, reject) => {
      try {
        if (this.config.debug) {
          console.log('[WS] Connecting to:', url)
        }
        
        this.ws = new WebSocket(url)
        this.ws.binaryType = 'arraybuffer'
        
        this.ws.onopen = () => {
          if (this.config.debug) console.log('[WS] Connected')
          this.emit('connected', { url })
          this.startHeartbeat()
          resolve()
        }
        
        this.ws.onclose = (event) => {
          if (this.config.debug) console.log('[WS] Disconnected:', event.code)
          this.emit('disconnected', { code: event.code, reason: event.reason })
          this.stopHeartbeat()
          this.messageQueue = []
          
          if (!this.isManualClose && this.config.reconnect) {
            this.scheduleReconnect()
          }
        }
        
        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error)
          this.emit('error', { error })
          reject(error)
        }
        
        // 🌟 [核心优化] 二元分流处理
        this.ws.onmessage = async (event) => {
          const data = event.data

          // ===============================
          // 通道 1: 展示数据 (Binary) - 直通车
          // ===============================
          if (data instanceof ArrayBuffer) {
            // 立即分发，不排队，不阻塞。
            // 目标是尽快让 DataBus 拿到数据并扔给 Worker。
            // 积压控制交由渲染层的 SceneManager 处理（丢帧策略）。
            this.emit('binary', data)
            return
          }
          
          if (data instanceof Blob) {
             try {
                 const buffer = await data.arrayBuffer()
                 this.emit('binary', buffer)
             } catch (e) { console.error(e) }
             return
          }

          // ===============================
          // 通道 2: 指令/文本数据 - 优先处理
          // ===============================
          if (typeof data === 'string') {
            // ⚡️ 极速通道：判断是否为控制指令
            // 只要不是特别巨大的 JSON，都视为指令尝试立即解析
            if (data.length < 10240) { 
              this.processTextImmediate(data)
            } else {
              // 极少见的大文本，放入低优先级队列，避免阻塞 UI
              this.enqueueMessage(data)
            }
          }
        }
        
      } catch (error) {
        console.error('[WS] Connection failed:', error)
        reject(error)
      }
    })
  }

  // ========== 文本消息处理逻辑 ==========

  /**
   * 立即处理文本消息 (指令/状态/Ack)
   * 目标：0 延迟响应 UI
   */
  private processTextImmediate(data: string) {
    try {
      const trimmed = data.trim()
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return
      
      const message: Message = JSON.parse(data)
      
      // 直接触发，不进入任何调度，确保 UI 按钮 0 延迟响应
      this.emit('message', message) 
      
    } catch (error) {
      // JSON 解析失败忽略即可
    }
  }

  /**
   * 将大文本加入低优先级队列
   */
  private enqueueMessage(data: any) {
    this.messageQueue.push({ data })
    this.scheduleQueueProcessing()
  }

  private scheduleQueueProcessing() {
    if (this.isProcessingQueue) return
    this.isProcessingQueue = true
    requestAnimationFrame(this.processQueueBatch)
  }

  /**
   * 批量处理低优先级文本队列
   */
  private processQueueBatch = () => {
    const startTime = performance.now()
    
    do {
      const item = this.messageQueue.shift()
      if (!item) break

      this.processTextImmediate(item.data)

      // 检查时间预算
      if (performance.now() - startTime > this.FRAME_BUDGET_MS) {
        if (this.messageQueue.length > 0) {
            requestAnimationFrame(this.processQueueBatch)
        } else {
            this.isProcessingQueue = false
        }
        return
      }

    } while (this.messageQueue.length > 0)

    this.isProcessingQueue = false
  }

  // ===========================================
  
  disconnect(): void {
    if (this.config.debug) console.log('[WS] Disconnecting...')
    this.isManualClose = true
    this.stopReconnect()
    this.stopHeartbeat()
    this.messageQueue = [] 
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
  
  send(message: any): boolean {
    if (!this.isConnected()) return false
    
    try {
      // WebSocket.send 是异步非阻塞的，立即调用
      if (message instanceof ArrayBuffer || message instanceof Uint8Array) {
        this.ws!.send(message)
      } else {
        const payload = typeof message === 'string' ? message : JSON.stringify(message)
        this.ws!.send(payload)
      }
      return true
    } catch (error) {
      console.error('[WS] Failed to send message:', error)
      this.emit('error', { error })
      return false
    }
  }
  
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
  
  getWebSocket(): WebSocket | null {
    return this.ws
  }
  
  private startHeartbeat(): void {
    if (!this.config.heartbeatInterval) return
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'HEARTBEAT', timestamp: Date.now() })
      }
    }, this.config.heartbeatInterval)
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return
    if (this.config.debug) console.log('[WS] Reconnecting in', this.config.reconnectInterval, 'ms')
    
    this.emit('reconnecting', { interval: this.config.reconnectInterval })
    
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect(this.url).catch((error) => {
        console.error('[WS] Reconnect failed:', error)
      })
    }, this.config.reconnectInterval)
  }
  
  private stopReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
  
  destroy(): void {
    this.disconnect()
    this.removeAllListeners()
  }
}