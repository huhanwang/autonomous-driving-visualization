// stores/playback.ts - 混合模式：同时支持 DataBus 和旧 WebSocket

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  PlaybackStatus, 
  PlayMode,
  TimestampType 
} from '@/types/playback'
import { useWebSocket } from '@/composables/useWebSocket'
import { useDataBus } from '@/composables/useDataBus'
import { useTopicsStore } from './topics'
import { ElMessage } from 'element-plus'

export const usePlaybackStore = defineStore('playback', () => {
  // ========== 状态 ==========
  
  const connected = ref(false)
  const serverVersion = ref('')
  
  const isPlaying = ref(false)
  const playMode = ref<PlayMode>('FRAME_BASED')
  const timestampType = ref<TimestampType>('RAW_TIMESTAMP')
  
  const currentFrameId = ref(0)
  const currentTimestamp = ref(0)
  
  const frameRange = ref({ min: 0, max: 0 })
  const timeRange = ref({ min: 0, max: 0 })
  
  const progress = ref(0)
  
  const speedMultiplier = ref(1.0)
  const availableKeys = ref<string[]>([])
  
  // 🆕 模式标识
  const useDataBusMode = ref(true)
  
  let wsInstance: ReturnType<typeof useWebSocket> | null = null
  const { dataBus, subscribe, sendCommand: sendDataBusCommand, request } = useDataBus()
  
  // ========== 计算属性 ==========
  
  const totalFrames = computed(() => frameRange.value.max - frameRange.value.min)
  const duration = computed(() => timeRange.value.max - timeRange.value.min)
  
  const currentTimeFormatted = computed(() => {
    return new Date(currentTimestamp.value * 1000).toISOString().substr(11, 12)
  })
  
  const progressPercent = computed(() => progress.value * 100)
  
  const wsConnected = computed(() => {
    if (useDataBusMode.value) {
      return dataBus.isConnected()
    }
    return wsInstance?.connected.value ?? false
  })
  
  // ========== 初始化方法 ==========
  
  /**
   * 🆕 初始化 DataBus 订阅
   */
  function initialize() {
    console.log('🔧 Initializing playback store with DataBus')
    
    const topics = useTopicsStore()
    
    // 订阅消息
    subscribe('INIT_INFO', handleInitInfo)
    subscribe('PLAYBACK_STATUS', handlePlaybackStatus)
    subscribe('COMMAND_ACK', handleCommandAck)
    subscribe('ERROR', handleError)
    subscribe('SUBSCRIPTION_ACK', handleSubscriptionAck)
    
    // 订阅 Topic 相关消息（转发给 topics store）
    subscribe('TOPIC_SCHEMA', (msg: any) => topics.handleTopicSchema(msg))
    subscribe('TOPIC_DATA', (msg: any) => topics.handleTopicData(msg))
    subscribe('TOPIC_SCHEMA_RESPONSE', (msg: any) => topics.handleTopicSchemaResponse(msg))
    subscribe('TOPIC_DATA_RESPONSE', (msg: any) => topics.handleTopicDataResponse(msg))
    
    console.log('✅ Playback store initialized')
  }
  
  /**
   * 旧方法：设置 WebSocket 实例（保留兼容）
   */
  function setWebSocket(ws: ReturnType<typeof useWebSocket>) {
    console.log('📡 Using old WebSocket mode')
    useDataBusMode.value = false
    wsInstance = ws
    
    const topics = useTopicsStore()
    
    // 注册消息处理器（旧方式）
    ws.on('INIT_INFO', handleInitInfo)
    ws.on('PLAYBACK_STATUS', handlePlaybackStatus)
    ws.on('COMMAND_ACK', handleCommandAck)
    ws.on('ERROR', handleError)
    ws.on('SUBSCRIPTION_ACK', handleSubscriptionAck)
    
    ws.on('TOPIC_SCHEMA', (msg: any) => topics.handleTopicSchema(msg))
    ws.on('TOPIC_DATA', (msg: any) => topics.handleTopicData(msg))
    ws.on('TOPIC_SCHEMA_RESPONSE', (msg: any) => topics.handleTopicSchemaResponse(msg))
    ws.on('TOPIC_DATA_RESPONSE', (msg: any) => topics.handleTopicDataResponse(msg))
  }
  
  // ========== 消息处理 ==========
  
  function handleInitInfo(msg: any) {
    console.log('📥 Received INIT_INFO:', msg)
    
    // ✅ 兼容两种格式
    const data = msg.data || msg
    
    serverVersion.value = data.server_version || ''
    availableKeys.value = data.available_keys || []
    
    const topics = useTopicsStore()
    topics.initializeTopics(data.available_keys || [])
    
    if (data.initial_status) {
      updateStatus(data.initial_status)
    }
    
    connected.value = true
    console.log('✅ Store connected set to true')
  }
  
  function handlePlaybackStatus(msg: any) {
    updateStatus(msg.data)
  }
  
  function updateStatus(data: PlaybackStatus) {
    isPlaying.value = data.is_playing
    playMode.value = data.play_mode
    timestampType.value = data.timestamp_type
    
    currentFrameId.value = data.current_frame_id
    currentTimestamp.value = data.current_timestamp
    
    if (data.frame_range) {
      frameRange.value = data.frame_range
    }
    if (data.time_range) {
      timeRange.value = data.time_range
    }
    
    progress.value = data.progress || 0
    speedMultiplier.value = data.speed_multiplier || 1.0
  }
  
  function handleCommandAck(msg: any) {
    console.log('📥 Received COMMAND_ACK:', msg)
    
    if (msg.success) {
      ElMessage.success(`${msg.command} 成功`)
    } else {
      console.error(`Command ${msg.command} failed: ${msg.message}`)
      ElMessage.error(`${msg.command} 失败: ${msg.message}`)
    }
  }
  
  function handleSubscriptionAck(msg: any) {
    console.log('📥 Received SUBSCRIPTION_ACK:', msg)
    
    if (msg.success) {
      console.log('✅ Successfully subscribed to:', msg.topic_key)
      ElMessage.success(`订阅成功: ${msg.topic_key}`)
    } else {
      console.error('❌ Failed to subscribe:', msg.topic_key, msg.message)
      ElMessage.error(`订阅失败: ${msg.message}`)
    }
  }
  
  function handleError(msg: any) {
    console.error('📥 Received ERROR:', msg)
    ElMessage.error(`服务器错误: ${msg.message}`)
  }
  
  // ========== 通用发送方法 ==========
  
  function sendCommand(type: string, params?: any): boolean {
    console.log('📤 sendCommand called:', type, params)
    
    if (useDataBusMode.value) {
      // 🆕 DataBus 模式
      if (!dataBus.isConnected()) {
        console.error('❌ DataBus not connected')
        ElMessage.error('DataBus 未连接')
        return false
      }
      return sendDataBusCommand(type, params)
    } else {
      // 旧模式
      if (!wsInstance) {
        console.error('❌ WebSocket instance not set')
        ElMessage.error('WebSocket 未连接')
        return false
      }
      
      if (!wsInstance.connected.value) {
        console.error('❌ WebSocket not connected')
        ElMessage.error('WebSocket 未连接')
        return false
      }
      
      return wsInstance.send(type, params)
    }
  }
  
  // ========== 🆕 主动拉取接口 ==========
  
  async function requestTopicSchema(topicKey: string): Promise<any> {
    if (useDataBusMode.value) {
      const response = await request('GET_TOPIC_SCHEMA', { topic_key: topicKey })
      return response.schema
    } else {
      // 旧模式实现
      return new Promise((resolve, reject) => {
        // ... 旧的实现
      })
    }
  }
  
  async function requestTopicData(topicKey: string): Promise<any> {
    if (useDataBusMode.value) {
      return await request('GET_TOPIC_DATA', { topic_key: topicKey })
    } else {
      // 旧模式实现
      return new Promise((resolve, reject) => {
        // ... 旧的实现
      })
    }
  }
  
  // ========== 控制方法 ==========
  
  function play() {
    console.log('🎮 Calling play()')
    return sendCommand('PLAY')
  }
  
  function pause() {
    console.log('🎮 Calling pause()')
    return sendCommand('PAUSE')
  }
  
  function stop() {
    console.log('🎮 Calling stop()')
    return sendCommand('STOP')
  }
  
  function reset() {
    console.log('🎮 Calling reset()')
    return sendCommand('RESET')
  }
  
  function nextFrame() {
    console.log('🎮 Calling nextFrame()')
    return sendCommand('NEXT_FRAME')
  }
  
  function prevFrame() {
    console.log('🎮 Calling prevFrame()')
    return sendCommand('PREV_FRAME')
  }
  
  function seekToFrame(frameId: number) {
    console.log('🎮 Calling seekToFrame:', frameId)
    return sendCommand('SEEK_FRAME', { frame_id: frameId })
  }
  
  function seekToTime(timestamp: number) {
    console.log('🎮 Calling seekToTime:', timestamp)
    return sendCommand('SEEK_TIME', { timestamp })
  }
  
  function seekToProgress(prog: number) {
    console.log('🎮 Calling seekToProgress:', prog)
    return sendCommand('SEEK_PROGRESS', { progress: prog })
  }
  
  function setSpeed(multiplier: number) {
    console.log('🎮 Calling setSpeed:', multiplier)
    return sendCommand('SET_SPEED', { multiplier })
  }
  
  function getStatus() {
    console.log('🎮 Calling getStatus()')
    return sendCommand('GET_STATUS')
  }
  
  // ========== 订阅方法 ==========
  
  function subscribeTopic(topicKey: string) {
    console.log('🎯 Subscribing to topic:', topicKey)
    return sendCommand('SUBSCRIBE_TOPIC', { topic_key: topicKey })
  }
  
  function getAvailableTopics() {
    console.log('📋 Getting available topics')
    return sendCommand('GET_AVAILABLE_TOPICS')
  }
  
  return {
    // 状态
    connected,
    serverVersion,
    isPlaying,
    playMode,
    timestampType,
    currentFrameId,
    currentTimestamp,
    frameRange,
    timeRange,
    progress,
    speedMultiplier,
    availableKeys,
    wsConnected,
    useDataBusMode,
    
    // 计算属性
    totalFrames,
    duration,
    currentTimeFormatted,
    progressPercent,
    
    // 初始化
    initialize,
    setWebSocket,
    
    // 通用方法
    sendCommand,
    
    // 主动拉取
    requestTopicSchema,
    requestTopicData,
    
    // 播放控制
    play,
    pause,
    stop,
    reset,
    nextFrame,
    prevFrame,
    seekToFrame,
    seekToTime,
    seekToProgress,
    setSpeed,
    getStatus,
    
    // 订阅管理
    subscribeTopic,
    getAvailableTopics
  }
})