// topic.ts - Topic相关类型定义

export interface TopicField {
    id: number
    name: string
    path: string
    type: string
    repeated: boolean
    message_type?: string
    enum_type?: string
  }
  
  export interface TopicSchema {
    proto_type: string
    fields: TopicField[]
  }
  
  export interface TopicData {
    frame_id: number
    timestamp: number
    data: Record<string, any>
  }
  
  export interface ParsedTopicData {
    [key: string]: any
  }
  
  export interface TopicSubscription {
    key: string
    subscribed: boolean
    lastUpdate?: number
  }