// core/types/message.ts - 消息类型定义

/**
 * WebSocket消息基类
 */
export interface Message {
    type: string
    payload: any
    timestamp: number
    source?: string
  }
  
  /**
   * 消息处理器
   */
  export type MessageHandler = (message: Message) => void
  
  /**
   * WebSocket消息类型枚举
   */
  export enum MessageType {
    // 初始化和状态
    INIT_INFO = 'INIT_INFO',
    PLAYBACK_STATUS = 'PLAYBACK_STATUS',
    COMMAND_ACK = 'COMMAND_ACK',
    ERROR = 'ERROR',
    
    // Topic相关
    TOPIC_SCHEMA = 'TOPIC_SCHEMA',
    TOPIC_DATA = 'TOPIC_DATA',
    TOPIC_SCHEMA_RESPONSE = 'TOPIC_SCHEMA_RESPONSE',
    TOPIC_DATA_RESPONSE = 'TOPIC_DATA_RESPONSE',
    
    // 订阅相关
    SUBSCRIPTION_ACK = 'SUBSCRIPTION_ACK',
    AVAILABLE_TOPICS = 'AVAILABLE_TOPICS',
    
    // 可视化相关（预留）
    VIS_2D_DATA = 'VIS_2D_DATA',
    VIS_3D_DATA = 'VIS_3D_DATA',
    IMAGE_DATA = 'IMAGE_DATA'
  }
  
  /**
   * 播放控制命令类型
   */
  export enum PlaybackCommand {
    PLAY = 'PLAY',
    PAUSE = 'PAUSE',
    STOP = 'STOP',
    RESET = 'RESET',
    NEXT_FRAME = 'NEXT_FRAME',
    PREV_FRAME = 'PREV_FRAME',
    SEEK_FRAME = 'SEEK_FRAME',
    SEEK_TIME = 'SEEK_TIME',
    SEEK_PROGRESS = 'SEEK_PROGRESS',
    SET_SPEED = 'SET_SPEED',
    GET_STATUS = 'GET_STATUS'
  }
  
  /**
   * 订阅控制命令类型
   */
  export enum SubscriptionCommand {
    SUBSCRIBE_TOPIC = 'SUBSCRIBE_TOPIC',
    GET_AVAILABLE_TOPICS = 'GET_AVAILABLE_TOPICS',
    GET_TOPIC_SCHEMA = 'GET_TOPIC_SCHEMA',
    GET_TOPIC_DATA = 'GET_TOPIC_DATA'
  }
  
  /**
   * 路由处理器配置
   */
  export interface RouteHandler {
    pattern: string | RegExp
    handler: MessageHandler
    priority?: number
  }