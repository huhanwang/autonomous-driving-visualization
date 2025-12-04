// core/WebSocketClient.ts - WebSocket客户端封装

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
 * WebSocket客户端
 * 
 * 职责：
 * 1. 管理WebSocket连接
 * 2. 自动重连
 * 3. 心跳保活
 * 4. 消息收发
 * 
 * 事件：
 * - 'connected': 连接成功
 * - 'disconnected': 连接断开
 * - 'message': 收到消息
 * - 'error': 发生错误
 */
export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null
  private url: string = ''
  private config: WebSocketClientConfig
  
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private isManualClose: boolean = false
  
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
  
  /**
   * 连接WebSocket服务器
   */
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
          if (this.config.debug) {
            console.log('[WS] Connected')
          }
          
          this.emit('connected', { url })
          this.startHeartbeat()
          resolve()
        }
        
        this.ws.onclose = (event) => {
          if (this.config.debug) {
            console.log('[WS] Disconnected:', event.code, event.reason)
          }
          
          this.emit('disconnected', { code: event.code, reason: event.reason })
          this.stopHeartbeat()
          
          // 自动重连
          if (!this.isManualClose && this.config.reconnect) {
            this.scheduleReconnect()
          }
        }
        
        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error)
          this.emit('error', { error })
          reject(error)
        }
        
        this.ws.onmessage = async (event) => { // 🌟 改为 async 以支持 Blob.arrayBuffer()
          const data = event.data

          // 1. 处理 ArrayBuffer (正常情况)
          if (data instanceof ArrayBuffer) {
            // console.log('[WS] binary:', data)
            this.emit('binary', data)
            return
          }
          
          // 2. 处理 Blob (异常情况：binaryType 设置失效)
          // 这是一个兜底逻辑，防止应用崩溃
          if (data instanceof Blob) {
             // console.warn('[WS] Received Blob instead of ArrayBuffer. Converting...')
             try {
                 const buffer = await data.arrayBuffer()
                 this.emit('binary', buffer)
             } catch (e) {
                 console.error('[WS] Failed to convert Blob:', e)
             }
             return // 🛑 必须 return，防止进入下面的 JSON 解析
          }

          // 3. 处理文本 (JSON 信令)
          if (typeof data === 'string') {
            try {
              // 简单的过滤：如果字符串看起来不像 JSON (比如不是 { 或 [ 开头)，直接忽略
              const trimmed = data.trim()
              if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
                  // console.warn('[WS] Received non-JSON string:', data)
                  return
              }
              
              const message: Message = JSON.parse(data)
              this.emit('message', message)
            } catch (error) {
              // console.error('[WS] JSON Parse Error:', error)
              // 忽略解析错误，不要抛出异常中断程序
            }
          }
        }
        
      } catch (error) {
        console.error('[WS] Connection failed:', error)
        reject(error)
      }
    })
  }
  
  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.config.debug) {
      console.log('[WS] Disconnecting...')
    }
    
    this.isManualClose = true
    this.stopReconnect()
    this.stopHeartbeat()
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
  
  /**
   * 发送消息
   */
  send(message: any): boolean {
    if (!this.isConnected()) {
      // console.warn('[WS] Not connected, cannot send message')
      return false
    }
    
    try {
      // ⚡️ [关键修改] 明确支持 ArrayBuffer 和 Uint8Array
      if (message instanceof ArrayBuffer || message instanceof Uint8Array) {
        this.ws!.send(message)
      } else {
        // 文本消息：如果是对象则序列化，否则直接发送
        const payload = typeof message === 'string' 
          ? message 
          : JSON.stringify(message)
        
        this.ws!.send(payload)
      }
      
      return true
    } catch (error) {
      console.error('[WS] Failed to send message:', error)
      this.emit('error', { error })
      return false
    }
  }
  
  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
  
  /**
   * 获取WebSocket实例
   */
  getWebSocket(): WebSocket | null {
    return this.ws
  }
  
  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    if (!this.config.heartbeatInterval) return
    
    this.stopHeartbeat()
    
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'HEARTBEAT', timestamp: Date.now() })
      }
    }, this.config.heartbeatInterval)
  }
  
  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
  
  /**
   * 调度重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return
    
    if (this.config.debug) {
      console.log('[WS] Reconnecting in', this.config.reconnectInterval, 'ms')
    }
    
    this.emit('reconnecting', { 
      interval: this.config.reconnectInterval 
    })
    
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect(this.url).catch((error) => {
        console.error('[WS] Reconnect failed:', error)
      })
    }, this.config.reconnectInterval)
  }
  
  /**
   * 停止重连
   */
  private stopReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
  
  /**
   * 销毁实例
   */
  destroy(): void {
    this.disconnect()
    this.removeAllListeners()
  }
}