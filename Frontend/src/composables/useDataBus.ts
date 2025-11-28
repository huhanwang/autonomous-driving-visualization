// composables/useDataBus.ts - DataBus 组合式函数

import { dataBus } from '@/core/DataBus'

/**
 * 使用 DataBus 的组合式函数
 * 提供便捷的访问方式
 */
export function useDataBus() {
  /**
   * 连接服务器
   */
  async function connect(url?: string): Promise<void> {
    return dataBus.connect(url)
  }
  
  /**
   * 断开连接
   */
  function disconnect(): void {
    dataBus.disconnect()
  }
  
  /**
   * 检查连接状态
   */
  function isConnected(): boolean {
    return dataBus.isConnected()
  }
  
  /**
   * 订阅消息
   */
  function subscribe(topic: string, callback: (data: any) => void) {
    return dataBus.subscribe(topic, callback)
  }
  
  /**
   * 发送命令
   */
  function sendCommand(type: string, params?: any): boolean {
    return dataBus.sendCommand(type, params)
  }
  
  /**
   * 请求数据
   */
  async function request<T = any>(type: string, params?: any): Promise<T> {
    return dataBus.request<T>(type, params)
  }
  
  /**
   * 监听连接事件
   */
  function onConnected(callback: () => void) {
    dataBus.on('connected', callback)
    return () => dataBus.off('connected', callback)
  }
  
  function onDisconnected(callback: () => void) {
    dataBus.on('disconnected', callback)
    return () => dataBus.off('disconnected', callback)
  }
  
  function onError(callback: (error: any) => void) {
    dataBus.on('error', callback)
    return () => dataBus.off('error', callback)
  }
  
  return {
    // 实例
    dataBus,
    
    // 连接管理
    connect,
    disconnect,
    isConnected,
    
    // 通信
    subscribe,
    sendCommand,
    request,
    
    // 事件
    onConnected,
    onDisconnected,
    onError
  }
}