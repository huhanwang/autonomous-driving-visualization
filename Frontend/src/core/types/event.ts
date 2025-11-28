// core/types/event.ts - 事件类型定义

/**
 * 系统事件类型
 */
export enum SystemEvent {
    // 连接事件
    CONNECTED = 'system:connected',
    DISCONNECTED = 'system:disconnected',
    RECONNECTING = 'system:reconnecting',
    CONNECTION_ERROR = 'system:connection-error',
    
    // 模块事件
    MODULE_REGISTERED = 'system:module-registered',
    MODULE_ACTIVATED = 'system:module-activated',
    MODULE_DEACTIVATED = 'system:module-deactivated',
    MODULE_DESTROYED = 'system:module-destroyed',
    
    // 播放事件
    PLAYBACK_STARTED = 'playback:started',
    PLAYBACK_PAUSED = 'playback:paused',
    PLAYBACK_STOPPED = 'playback:stopped',
    PLAYBACK_STATE_CHANGED = 'playback:state-changed',
    
    // 数据事件
    DATA_LOADED = 'data:loaded',
    DATA_UPDATED = 'data:updated',
    DATA_ERROR = 'data:error',
    
    // Topic事件
    TOPIC_SELECTED = 'topic:selected',
    TOPIC_SUBSCRIBED = 'topic:subscribed',
    TOPIC_UNSUBSCRIBED = 'topic:unsubscribed'
  }
  
  /**
   * 事件数据接口
   */
  export interface EventData {
    event: string
    timestamp: number
    data: any
    source?: string
  }
  
  /**
   * 连接状态事件数据
   */
  export interface ConnectionEventData {
    connected: boolean
    url?: string
    error?: string
  }
  
  /**
   * 模块事件数据
   */
  export interface ModuleEventData {
    moduleId: string
    moduleName: string
    action: 'registered' | 'activated' | 'deactivated' | 'destroyed'
  }
  
  /**
   * Topic事件数据
   */
  export interface TopicEventData {
    topicKey: string
    action: 'selected' | 'subscribed' | 'unsubscribed'
    data?: any
  }
  
  /**
   * 播放状态事件数据
   */
  export interface PlaybackEventData {
    isPlaying: boolean
    currentFrame?: number
    currentTime?: number
    speed?: number
  }