// core/types/module.ts - 模块接口定义

import type { Message } from './message'

/**
 * 模块标准接口
 * 所有功能模块必须实现此接口
 */
export interface Module {
  // ========== 元信息 ==========
  readonly id: string              // 模块唯一ID
  readonly name: string            // 模块名称
  readonly version: string         // 版本号
  readonly description?: string    // 描述
  
  // ========== 依赖 ==========
  dependencies?: string[]          // 依赖的其他模块ID
  
  // ========== 生命周期 ==========
  
  /**
   * 模块注册时调用
   * @param dataBus 数据总线实例
   */
  onRegister(dataBus: any): void  // 暂时用any，避免循环依赖
  
  /**
   * 模块激活时调用
   */
  onActivate(): void
  
  /**
   * 模块停用时调用
   */
  onDeactivate(): void
  
  /**
   * 模块销毁时调用
   */
  onDestroy(): void
  
  // ========== 数据处理 ==========
  
  /**
   * 处理WebSocket消息
   * @param message 消息对象
   */
  onMessage(message: Message): void
  
  /**
   * 处理数据更新
   * @param topic Topic名称
   * @param data 数据
   */
  onDataUpdate(topic: string, data: any): void
  
  /**
   * 处理全局事件（可选）
   * @param event 事件名称
   * @param data 数据
   */
  onEvent?(event: string, data: any): void
  
  // ========== 配置 ==========
  
  /**
   * 获取模块配置（可选）
   */
  getConfig?(): ModuleConfig
  
  /**
   * 更新模块配置（可选）
   */
  updateConfig?(config: Partial<ModuleConfig>): void
}

/**
 * 模块配置接口
 */
export interface ModuleConfig {
  enabled: boolean           // 是否启用
  lazy?: boolean            // 是否懒加载
  position?: string         // 显示位置
  [key: string]: any        // 其他自定义配置
}

/**
 * 模块工厂函数类型
 */
export type ModuleFactory = () => Module

/**
 * 模块注册信息
 */
export interface ModuleRegistration {
  module: Module
  config: ModuleConfig
  active: boolean
  registeredAt: number
}