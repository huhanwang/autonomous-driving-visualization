// core/DataBus.ts - 数据总线（核心调度器）

import { EventEmitter } from './EventEmitter'
import { WebSocketClient } from './WebSocketClient'
import { MessageRouter } from './MessageRouter'
import { DataCache } from './DataCache'
import type { Message } from './types/message'
import type { Module } from './types/module'
import type { DataCallback, UnsubscribeFn } from './types/common'

/**
 * 数据总线配置
 */
export interface DataBusConfig {
  wsUrl?: string
  reconnect?: boolean
  reconnectInterval?: number
  cacheSize?: number
  debug?: boolean
}

/**
 * 数据总线 - 整个应用的数据流中心
 * 
 * 职责：
 * 1. 管理WebSocket连接
 * 2. 路由消息到对应模块
 * 3. 提供发布-订阅机制
 * 4. 管理模块生命周期
 * 5. 缓存数据状态
 * 
 * @example
 * ```typescript
 * const dataBus = new DataBus({ debug: true })
 * await dataBus.connect('ws://localhost:9002')
 * 
 * // 订阅数据
 * dataBus.subscribe('topic:*', (data) => {
 *   console.log('Received:', data)
 * })
 * 
 * // 注册模块
 * dataBus.registerModule(myModule)
 * ```
 */
export class DataBus extends EventEmitter {
  private config: DataBusConfig
  
  // 核心组件
  private wsClient: WebSocketClient
  private messageRouter: MessageRouter
  private dataCache: DataCache
  
  // 模块管理
  private modules: Map<string, Module> = new Map()
  private activeModules: Set<string> = new Set()
  
  // 订阅管理
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
    
    // 初始化核心组件
    this.wsClient = new WebSocketClient({
      reconnect: this.config.reconnect,
      reconnectInterval: this.config.reconnectInterval,
      debug: this.config.debug
    })
    
    this.messageRouter = new MessageRouter()
    this.dataCache = new DataCache(this.config.cacheSize)
    
    // 绑定WebSocket事件
    this.setupWebSocketHandlers()
  }
  
  // ========== 连接管理 ==========
  
  /**
   * 连接WebSocket服务器
   */
  async connect(url: string): Promise<void> {
    if (this.config.debug) {
      console.log('[DataBus] Connecting to:', url)
    }
    
    await this.wsClient.connect(url)
  }
  
  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.config.debug) {
      console.log('[DataBus] Disconnecting...')
    }
    
    this.wsClient.disconnect()
  }
  
  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.wsClient.isConnected()
  }
  
  // ========== 模块管理 ==========
  
  /**
   * 注册模块
   */
  registerModule(module: Module): void {
    // 检查依赖
    if (module.dependencies) {
      for (const dep of module.dependencies) {
        if (!this.modules.has(dep)) {
          throw new Error(`[DataBus] Dependency not found: ${dep} for module ${module.id}`)
        }
      }
    }
    
    // 注册模块
    this.modules.set(module.id, module)
    
    // 调用模块的注册钩子
    module.onRegister(this)
    
    // 默认激活
    this.activateModule(module.id)
    
    if (this.config.debug) {
      console.log('[DataBus] Module registered:', module.id)
    }
    
    this.emit('module:registered', { moduleId: module.id })
  }
  
  /**
   * 注销模块
   */
  unregisterModule(moduleId: string): void {
    const module = this.modules.get(moduleId)
    if (!module) return
    
    // 停用模块
    this.deactivateModule(moduleId)
    
    // 销毁模块
    module.onDestroy()
    
    // 移除模块
    this.modules.delete(moduleId)
    
    if (this.config.debug) {
      console.log('[DataBus] Module unregistered:', moduleId)
    }
    
    this.emit('module:unregistered', { moduleId })
  }
  
  /**
   * 激活模块
   */
  activateModule(moduleId: string): void {
    const module = this.modules.get(moduleId)
    if (!module) {
      throw new Error(`[DataBus] Module not found: ${moduleId}`)
    }
    
    if (this.activeModules.has(moduleId)) {
      return // 已激活
    }
    
    module.onActivate()
    this.activeModules.add(moduleId)
    
    if (this.config.debug) {
      console.log('[DataBus] Module activated:', moduleId)
    }
    
    this.emit('module:activated', { moduleId })
  }
  
  /**
   * 停用模块
   */
  deactivateModule(moduleId: string): void {
    const module = this.modules.get(moduleId)
    if (!module) return
    
    if (!this.activeModules.has(moduleId)) {
      return // 未激活
    }
    
    module.onDeactivate()
    this.activeModules.delete(moduleId)
    
    if (this.config.debug) {
      console.log('[DataBus] Module deactivated:', moduleId)
    }
    
    this.emit('module:deactivated', { moduleId })
  }
  
  /**
   * 获取模块
   */
  getModule(moduleId: string): Module | undefined {
    return this.modules.get(moduleId)
  }
  
  /**
   * 获取所有模块ID
   */
  getModuleIds(): string[] {
    return Array.from(this.modules.keys())
  }
  
  // ========== 发布-订阅 ==========
  
  /**
   * 订阅数据更新
   * 
   * @param topic Topic名称或通配符 (支持 'topic:*')
   * @param callback 回调函数
   * @returns 取消订阅函数
   */
  subscribe(topic: string, callback: DataCallback): UnsubscribeFn {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set())
    }
    
    this.subscriptions.get(topic)!.add(callback)
    
    if (this.config.debug) {
      console.log('[DataBus] Subscribed:', topic)
    }
    
    // 返回取消订阅函数
    return () => this.unsubscribe(topic, callback)
  }
  
  /**
   * 取消订阅
   */
  unsubscribe(topic: string, callback?: DataCallback): void {
    const callbacks = this.subscriptions.get(topic)
    if (!callbacks) return
    
    if (callback) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.subscriptions.delete(topic)
      }
    } else {
      this.subscriptions.delete(topic)
    }
    
    if (this.config.debug) {
      console.log('[DataBus] Unsubscribed:', topic)
    }
  }
  
  /**
   * 发布数据
   */
  publish(topic: string, data: any): void {
    if (this.config.debug) {
      console.log('[DataBus] Publishing:', topic)
    }
    
    // 精确匹配
    const callbacks = this.subscriptions.get(topic)
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error('[DataBus] Subscription callback error:', error)
        }
      })
    }
    
    // 通配符匹配
    for (const [pattern, callbacks] of this.subscriptions.entries()) {
      if (pattern.includes('*') && this.matchPattern(topic, pattern)) {
        callbacks.forEach(callback => {
          try {
            callback(data)
          } catch (error) {
            console.error('[DataBus] Subscription callback error:', error)
          }
        })
      }
    }
  }
  
  // ========== 请求-响应 ==========
  
  /**
   * 向后端发送请求并等待响应
   */
  async request<T>(type: string, params?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substr(2, 9)
      const timeout = setTimeout(() => {
        this.off('response:' + requestId, handler)
        reject(new Error('Request timeout'))
      }, 5000)
      
      const handler = (response: any) => {
        clearTimeout(timeout)
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve(response.data)
        }
      }
      
      this.once('response:' + requestId, handler)
      
      this.sendCommand(type, { ...params, _requestId: requestId })
    })
  }
  
  /**
   * 向后端发送命令
   */
  sendCommand(type: string, params?: any): boolean {
    if (!this.isConnected()) {
      console.warn('[DataBus] Not connected, cannot send command')
      return false
    }
    
    return this.wsClient.send({
      type,
      timestamp: Date.now(),
      ...(params && { params })
    })
  }
  
  // ========== 事件广播 ==========
  
  /**
   * 广播事件给所有模块
   */
  broadcast(event: string, data: any): void {
    if (this.config.debug) {
      console.log('[DataBus] Broadcasting:', event)
    }
    
    for (const [moduleId, module] of this.modules.entries()) {
      if (this.activeModules.has(moduleId) && module.onEvent) {
        try {
          module.onEvent(event, data)
        } catch (error) {
          console.error(`[DataBus] Module ${moduleId} event handler error:`, error)
        }
      }
    }
    
    // 同时发射全局事件
    this.emit(event, data)
  }
  
  // ========== 数据缓存访问 ==========
  
  /**
   * 获取缓存数据
   */
  getCachedData(key: string): any {
    return this.dataCache.getTopicData(key)
  }
  
  /**
   * 设置缓存数据
   */
  setCachedData(key: string, data: any): void {
    this.dataCache.setTopicData(key, data)
  }
  
  /**
   * 清除缓存
   */
  clearCache(key?: string): void {
    if (key) {
      this.dataCache.clearTopic(key)
    } else {
      this.dataCache.clear()
    }
  }
  
  /**
   * 获取数据缓存实例
   */
  getDataCache(): DataCache {
    return this.dataCache
  }
  
  /**
   * 获取消息路由器实例
   */
  getMessageRouter(): MessageRouter {
    return this.messageRouter
  }
  
  // ========== 私有方法 ==========
  
  /**
   * 设置WebSocket事件处理器
   */
  // DataBus.ts 中 setupWebSocketHandlers 的修复
  private setupWebSocketHandlers(): void {
    // 连接事件
    this.wsClient.on('connected', (data) => {
      this.emit('connected', data)
    })
    
    this.wsClient.on('disconnected', (data) => {
      this.emit('disconnected', data)
    })
    
    this.wsClient.on('error', (data) => {
      this.emit('error', data)
    })
    
    // 消息事件
    this.wsClient.on('message', (message: Message) => {
      // 1. 路由到消息处理器
      // this.messageRouter.route(message)
      
      // 2. 分发给所有模块
      for (const [moduleId, module] of this.modules.entries()) {
        if (this.activeModules.has(moduleId)) {
          try {
            module.onMessage(message)
          } catch (error) {
            console.error(`[DataBus] Module ${moduleId} message handler error:`, error)
          }
        }
      }
      
      // 3. ✅ 修复：发布完整消息，不只是 payload
      this.publish(message.type, message)  // 改这里！传递完整 message
    })
  }
  
  /**
   * 模式匹配（支持通配符）
   */
  private matchPattern(str: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(str)
  }
  
  /**
   * 销毁实例
   */
  destroy(): void {
    // 注销所有模块
    for (const moduleId of this.modules.keys()) {
      this.unregisterModule(moduleId)
    }
    
    // 断开连接
    this.disconnect()
    
    // 清除缓存
    this.clearCache()
    
    // 清除订阅
    this.subscriptions.clear()
    
    // 清除所有事件监听
    this.removeAllListeners()
    
    if (this.config.debug) {
      console.log('[DataBus] Destroyed')
    }
  }
}

/**
 * DataBus 单例实例
 * 全局唯一的数据总线
 */
export const dataBus = new DataBus({
  debug: import.meta.env?.DEV || false
})