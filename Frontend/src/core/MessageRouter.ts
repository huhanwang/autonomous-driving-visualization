// core/MessageRouter.ts - 消息路由器

import type { Message, MessageHandler } from './types/message'

/**
 * 路由规则
 */
interface Route {
  pattern: string | RegExp
  handler: MessageHandler
  priority: number
}

/**
 * 消息路由器
 * 
 * 职责：
 * 1. 根据消息类型分发给对应的处理器
 * 2. 支持通配符匹配（如 'TOPIC_*'）
 * 3. 支持优先级排序
 * 4. 支持同一类型多个处理器
 */
export class MessageRouter {
  private routes: Map<string, Route[]> = new Map()
  private wildcardRoutes: Route[] = []
  
  /**
   * 注册消息处理器
   * 
   * @param pattern 消息类型或模式
   *   - 精确匹配: 'TOPIC_SCHEMA'
   *   - 通配符: 'TOPIC_*' (匹配所有以TOPIC_开头的消息)
   *   - 正则表达式: /^TOPIC_.+/
   * 
   * @param handler 处理器函数
   * @param priority 优先级（数字越大优先级越高，默认0）
   * 
   * @example
   * router.register('TOPIC_SCHEMA', handleSchema)
   * router.register('TOPIC_*', handleAllTopicMessages, 1)
   * router.register(/^VIS_/, handleVisualization)
   */
  register(
    pattern: string | RegExp,
    handler: MessageHandler,
    priority: number = 0
  ): void {
    const route: Route = { pattern, handler, priority }
    
    if (typeof pattern === 'string') {
      if (pattern.includes('*')) {
        // 通配符路由
        this.wildcardRoutes.push(route)
        this.wildcardRoutes.sort((a, b) => b.priority - a.priority)
      } else {
        // 精确匹配路由
        if (!this.routes.has(pattern)) {
          this.routes.set(pattern, [])
        }
        const handlers = this.routes.get(pattern)!
        handlers.push(route)
        handlers.sort((a, b) => b.priority - a.priority)
      }
    } else {
      // 正则表达式路由
      this.wildcardRoutes.push(route)
      this.wildcardRoutes.sort((a, b) => b.priority - a.priority)
    }
    
    console.log('[Router] Registered:', pattern, 'priority:', priority)
  }
  
  /**
   * 注销消息处理器
   * 
   * @param pattern 消息类型或模式
   * @param handler 处理器函数（可选，不提供则移除所有该类型的处理器）
   */
  unregister(pattern: string | RegExp, handler?: MessageHandler): void {
    if (typeof pattern === 'string' && !pattern.includes('*')) {
      // 精确匹配
      const handlers = this.routes.get(pattern)
      if (handlers) {
        if (handler) {
          const index = handlers.findIndex(r => r.handler === handler)
          if (index > -1) {
            handlers.splice(index, 1)
          }
        } else {
          this.routes.delete(pattern)
        }
      }
    } else {
      // 通配符或正则表达式
      if (handler) {
        const index = this.wildcardRoutes.findIndex(r => r.handler === handler)
        if (index > -1) {
          this.wildcardRoutes.splice(index, 1)
        }
      } else {
        this.wildcardRoutes = this.wildcardRoutes.filter(r => r.pattern !== pattern)
      }
    }
    
    console.log('[Router] Unregistered:', pattern)
  }
  
  /**
   * 路由消息到对应的处理器
   * 
   * @param message 消息对象
   */
  route(message: Message): void {
    const messageType = message.type
    let handled = false
    
    // 1. 精确匹配
    const exactHandlers = this.routes.get(messageType)
    if (exactHandlers && exactHandlers.length > 0) {
      for (const route of exactHandlers) {
        try {
          route.handler(message)
          handled = true
        } catch (error) {
          console.error('[Router] Handler error:', error)
        }
      }
    }
    
    // 2. 通配符和正则匹配
    for (const route of this.wildcardRoutes) {
      let matched = false
      
      if (typeof route.pattern === 'string') {
        // 通配符匹配
        matched = this.matchWildcard(messageType, route.pattern)
      } else {
        // 正则表达式匹配
        matched = route.pattern.test(messageType)
      }
      
      if (matched) {
        try {
          route.handler(message)
          handled = true
        } catch (error) {
          console.error('[Router] Handler error:', error)
        }
      }
    }
    
    // 3. 未处理的消息警告
    if (!handled) {
      console.warn('[Router] No handler for message type:', messageType)
    }
  }
  
  /**
   * 检查是否有处理器
   * 
   * @param messageType 消息类型
   */
  hasHandler(messageType: string): boolean {
    // 检查精确匹配
    if (this.routes.has(messageType)) {
      return true
    }
    
    // 检查通配符和正则匹配
    for (const route of this.wildcardRoutes) {
      if (typeof route.pattern === 'string') {
        if (this.matchWildcard(messageType, route.pattern)) {
          return true
        }
      } else {
        if (route.pattern.test(messageType)) {
          return true
        }
      }
    }
    
    return false
  }
  
  /**
   * 获取所有已注册的路由
   */
  getRoutes(): string[] {
    const routes = Array.from(this.routes.keys())
    const wildcards = this.wildcardRoutes.map(r => 
      typeof r.pattern === 'string' ? r.pattern : r.pattern.toString()
    )
    return [...routes, ...wildcards]
  }
  
  /**
   * 清空所有路由
   */
  clear(): void {
    this.routes.clear()
    this.wildcardRoutes = []
    console.log('[Router] Cleared all routes')
  }
  
  /**
   * 通配符匹配
   * 
   * @param str 字符串
   * @param pattern 模式（支持 * 通配符）
   * 
   * @example
   * matchWildcard('TOPIC_SCHEMA', 'TOPIC_*') // true
   * matchWildcard('PLAYBACK_STATUS', 'TOPIC_*') // false
   */
  private matchWildcard(str: string, pattern: string): boolean {
    // 将通配符模式转换为正则表达式
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // 转义特殊字符
      .replace(/\*/g, '.*')                     // * 转为 .*
    
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(str)
  }
}