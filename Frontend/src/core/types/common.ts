// core/types/common.ts - 核心通用类型定义

/**
 * Topic数据结构
 */
export interface TopicData {
    frame_id: number
    timestamp: number
    data: Record<string, any>
  }
  
  /**
   * Topic Schema定义
   */
  export interface TopicSchema {
    proto_type: string
    fields: TopicField[]
  }
  
  /**
   * Topic字段定义
   */
  export interface TopicField {
    id: number
    name: string
    path: string
    type: string
    repeated: boolean
    message_type?: string
    enum_type?: string
  }
  
  /**
   * 数据订阅回调
   */
  export type DataCallback = (data: any) => void
  
  /**
   * 取消订阅函数
   */
  export type UnsubscribeFn = () => void
  
  /**
   * 事件处理器
   */
  export type EventHandler = (...args: any[]) => void
  
  /**
   * 缓存统计信息
   */
  export interface CacheStats {
    size: number
    hits: number
    misses: number
    hitRate: number
  }
  
  /**
   * 帧数据
   */
  export interface FrameData {
    frame_id: number
    timestamp: number
    topics: Map<string, any>
  }
  
  /**
   * 元数据
   */
  export interface MetaData {
    [key: string]: any
  }