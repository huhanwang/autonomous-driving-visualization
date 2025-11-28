// composables/useWebSocket.ts - 修改默认端口
import { ref } from 'vue'
import type { WSMessage } from '@/types/playback'

// ⚠️ 在模块作用域创建单例实例
let wsInstance: ReturnType<typeof createWebSocket> | null = null

function createWebSocket(url: string) {
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const connecting = ref(false)
  const error = ref<string | null>(null)
  
  const messageHandlers = new Map<string, (data: any) => void>()
  
  /**
   * 连接WebSocket
   */
  function connect() {
    if (ws.value?.readyState === WebSocket.OPEN) {
      console.warn('WebSocket already connected')
      return
    }
    
    connecting.value = true
    error.value = null
    
    try {
      console.log('🔌 Connecting to WebSocket:', url)
      ws.value = new WebSocket(url)
      
      ws.value.onopen = () => {
        connected.value = true
        connecting.value = false
        error.value = null
        console.log('✅ WebSocket connected to', url)
      }
      
      ws.value.onmessage = (event) => {
        // console.log('📨 Received:', event.data.substring(0, 100))
        try {
          const msg: WSMessage = JSON.parse(event.data)
          const handler = messageHandlers.get(msg.type)
          if (handler) {
            handler(msg)
          } else {
            console.warn('⚠️ No handler for message type:', msg.type)
          }
        } catch (e) {
          console.error('❌ Failed to parse WebSocket message:', e)
        }
      }
      
      ws.value.onerror = (event) => {
        console.error('❌ WebSocket error:', event)
        error.value = 'WebSocket connection error'
      }
      
      ws.value.onclose = () => {
        connected.value = false
        connecting.value = false
        console.log('🔌 WebSocket disconnected')
      }
    } catch (e) {
      connecting.value = false
      error.value = `Failed to connect: ${e}`
      console.error('❌ WebSocket connection failed:', e)
    }
  }
  
  /**
   * 断开连接
   */
  function disconnect() {
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    connected.value = false
    connecting.value = false
  }
  
  /**
   * 发送消息
   */
  function send(type: string, params?: any) {
    console.log('📤 Sending:', type, params)
    console.log('📊 WebSocket state:', {
      connected: connected.value,
      readyState: ws.value?.readyState,
      readyStateName: ws.value?.readyState === WebSocket.OPEN ? 'OPEN' : 
                      ws.value?.readyState === WebSocket.CONNECTING ? 'CONNECTING' :
                      ws.value?.readyState === WebSocket.CLOSING ? 'CLOSING' :
                      ws.value?.readyState === WebSocket.CLOSED ? 'CLOSED' : 'UNKNOWN'
    })
    
    if (!connected.value) {
      console.warn('⚠️ WebSocket not connected, cannot send message')
      return false
    }
    
    const message = {
      type,
      timestamp: Date.now(),
      ...(params && { params })
    }
    
    try {
      ws.value?.send(JSON.stringify(message))
      console.log('✅ Message sent successfully')
      return true
    } catch (e) {
      console.error('❌ Failed to send message:', e)
      return false
    }
  }
  
  /**
   * 注册消息处理器
   */
  function on(messageType: string, handler: (data: any) => void) {
    messageHandlers.set(messageType, handler)
    console.log('📝 Registered handler for:', messageType)
  }
  
  /**
   * 移除消息处理器
   */
  function off(messageType: string) {
    messageHandlers.delete(messageType)
  }
  
  /**
   * 清除所有处理器
   */
  function clearHandlers() {
    messageHandlers.clear()
  }
  
  return {
    ws,
    connected,
    connecting,
    error,
    connect,
    disconnect,
    send,
    on,
    off,
    clearHandlers
  }
}

/**
 * 获取单例 WebSocket 实例
 */
export function useWebSocket(url: string = 'ws://localhost:9002') {  // ✅ 改为 9002
  if (!wsInstance) {
    console.log('🆕 Creating new WebSocket instance')
    wsInstance = createWebSocket(url)
  } else {
    console.log('♻️ Reusing existing WebSocket instance')
  }
  return wsInstance
}