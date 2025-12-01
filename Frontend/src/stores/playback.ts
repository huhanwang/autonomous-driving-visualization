// Frontend/src/stores/playback.ts

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  PlaybackStatus, 
  PlayMode,
  TimestampType 
} from '@/types/playback'
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
  
  // 核心依赖：只使用 DataBus
  const { dataBus, subscribe, sendCommand: sendDataBusCommand, request } = useDataBus()
  
  // 🌟 [修复] 添加初始化锁，防止重复订阅
  let isInitialized = false
  
  // ========== 计算属性 ==========
  
  const totalFrames = computed(() => frameRange.value.max - frameRange.value.min)
  const duration = computed(() => timeRange.value.max - timeRange.value.min)
  
  const currentTimeFormatted = computed(() => {
    return new Date(currentTimestamp.value * 1000).toISOString().substr(11, 12)
  })
  
  const progressPercent = computed(() => progress.value * 100)
  
  const wsConnected = computed(() => dataBus.isConnected())
  
  // ========== 初始化方法 ==========
  
  /**
   * 初始化 DataBus 订阅
   * 🌟 [修复] 增加防抖检查
   */
  function initialize() {
    if (isInitialized) {
      console.log('♻️ Playback store already initialized, skipping subscription')
      return
    }

    console.log('🔧 Initializing playback store with DataBus')
    
    const topics = useTopicsStore()
    
    // 订阅系统控制消息
    subscribe('INIT_INFO', handleInitInfo)
    subscribe('PLAYBACK_STATUS', handlePlaybackStatus)
    subscribe('COMMAND_ACK', handleCommandAck)
    subscribe('ERROR', handleError)
    subscribe('SUBSCRIPTION_ACK', handleSubscriptionAck)
    
    // 订阅 Topic 相关消息（转发给 topics store 处理）
    subscribe('TOPIC_SCHEMA', (msg: any) => topics.handleTopicSchema(msg))
    subscribe('TOPIC_DATA', (msg: any) => topics.handleTopicData(msg))
    subscribe('TOPIC_SCHEMA_RESPONSE', (msg: any) => topics.handleTopicSchemaResponse(msg))
    subscribe('TOPIC_DATA_RESPONSE', (msg: any) => topics.handleTopicDataResponse(msg))
    
    isInitialized = true
    console.log('✅ Playback store initialized (Listeners Attached)')
  }
  
  // ========== 消息处理 ==========
  
  function handleInitInfo(msg: any) {
    // 兼容直接 Payload 或 {data: Payload} 格式
    const data = msg.data || msg
    
    console.log('📥 Received INIT_INFO')
    
    serverVersion.value = data.server_version || ''
    availableKeys.value = data.available_keys || []
    
    // 通知 topics store 初始化列表
    const topics = useTopicsStore()
    // 兼容 topics store 可能存在的两种初始化方法名
    if (topics.initializeTopics) {
      topics.initializeTopics(data.available_keys || [])
    } else if (topics.initialize) {
      topics.initialize(data.available_keys || [])
    }
    
    if (data.initial_status) {
      updateStatus(data.initial_status)
    }
    
    connected.value = true
  }
  
  function handlePlaybackStatus(msg: any) {
    updateStatus(msg.data || msg)
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
    if (!msg.success) {
      console.error(`Command ${msg.command} failed: ${msg.message}`)
      ElMessage.error(`${msg.command} 失败: ${msg.message}`)
    }
  }
  
  function handleSubscriptionAck(msg: any) {
    if (msg.success) {
      ElMessage.success(`订阅成功: ${msg.topic_key}`)
    } else {
      console.error('❌ Failed to subscribe:', msg.topic_key, msg.message)
      ElMessage.error(`订阅失败: ${msg.message}`)
    }
  }
  
  function handleError(msg: any) {
    // 忽略心跳错误
    if (msg.message && msg.message.includes('HEARTBEAT')) return;
    
    console.error('📥 Received ERROR:', msg)
    ElMessage.error(`服务器错误: ${msg.message}`)
  }
  
  // ========== 通用发送方法 ==========
  
  function sendCommand(type: string, params?: any): boolean {
    if (!dataBus.isConnected()) {
      // 避免重复弹窗
      if (!wsConnected.value) ElMessage.error('DataBus 未连接')
      return false
    }
    return sendDataBusCommand(type, params)
  }
  
  // ========== 主动拉取接口 ==========
  
  async function requestTopicSchema(topicKey: string): Promise<any> {
    const response = await request('GET_TOPIC_SCHEMA', { topic_key: topicKey })
    return response.schema
  }
  
  async function requestTopicData(topicKey: string): Promise<any> {
    return await request('GET_TOPIC_DATA', { topic_key: topicKey })
  }
  
  // ========== 业务控制方法 ==========
  
  function play() { return sendCommand('PLAY') }
  function pause() { return sendCommand('PAUSE') }
  function stop() { return sendCommand('STOP') }
  function reset() { return sendCommand('RESET') }
  function nextFrame() { return sendCommand('NEXT_FRAME') }
  function prevFrame() { return sendCommand('PREV_FRAME') }
  
  function seekToFrame(frameId: number) {
    return sendCommand('SEEK_FRAME', { frame_id: frameId })
  }
  
  function seekToTime(timestamp: number) {
    return sendCommand('SEEK_TIME', { timestamp })
  }
  
  function seekToProgress(prog: number) {
    return sendCommand('SEEK_PROGRESS', { progress: prog })
  }
  
  function setSpeed(multiplier: number) {
    return sendCommand('SET_SPEED', { multiplier })
  }
  
  function getStatus() {
    return sendCommand('GET_STATUS')
  }
  
  // ========== 订阅方法 ==========
  
  function subscribeTopic(topicKey: string) {
    return sendCommand('SUBSCRIBE_TOPIC', { topic_key: topicKey })
  }
  
  function getAvailableTopics() {
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
    
    // 计算属性
    totalFrames,
    duration,
    currentTimeFormatted,
    progressPercent,
    
    // 初始化
    initialize,
    
    // 核心操作
    sendCommand,
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