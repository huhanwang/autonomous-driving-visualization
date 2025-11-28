// playback.ts - 播放相关类型定义

export type PlayMode = 'FRAME_BASED' | 'TIME_BASED'
export type TimestampType = 'RAW_TIMESTAMP' | 'LOCAL_TIMESTAMP'
export type PlaybackState = 'playing' | 'paused' | 'stopped'

export interface FrameRange {
  min: number
  max: number
}

export interface TimeRange {
  min: number
  max: number
}

export interface PlaybackStatus {
  is_playing: boolean
  play_mode: PlayMode
  timestamp_type: TimestampType
  current_frame_id: number
  current_timestamp: number
  frame_range: FrameRange
  time_range: TimeRange
  progress: number
  speed_multiplier: number
  sleep_time_ms: number
  time_step: number
  main_axis_key: string
}

export interface InitInfo {
  server_version: string
  available_keys: string[]
  initial_status: PlaybackStatus
}

export interface CommandAck {
  command: string
  success: boolean
  message?: string
}

export interface ErrorMessage {
  error_code: string
  message: string
}

// WebSocket消息类型
export type WSMessageType = 
  | 'INIT_INFO' 
  | 'PLAYBACK_STATUS' 
  | 'COMMAND_ACK' 
  | 'ERROR'

export interface WSMessage {
  type: WSMessageType
  data?: any
  timestamp?: number
  command?: string
  success?: boolean
  message?: string
  error_code?: string
}