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

// 引入 SceneManager
import { sceneManager } from '@/packages/vis-3d/core/SceneManager'

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
  
  // 核心依赖
  const { dataBus, subscribe, sendCommand: sendDataBusCommand, request } = useDataBus()
  
  // 初始化锁
  let isInitialized = false
  
  // 乐观更新计时器
  let optimisticTimer: number | null = null
  
  // ========== 计算属性 ==========
  
  const totalFrames = computed(() => frameRange.value.max - frameRange.value.min)
  const duration = computed(() => timeRange.value.max - timeRange.value.min)
  
  const currentTimeFormatted = computed(() => {
    return new Date(currentTimestamp.value * 1000).toISOString().substr(11, 12)
  })
  
  const progressPercent = computed(() => progress.value * 100)
  
  const wsConnected = computed(() => dataBus.isConnected())
  
  // ========== 初始化方法 ==========
  
  function initialize() {
    if (isInitialized) {
      console.log('♻️ Playback store already initialized, skipping subscription')
      return
    }

    console.log('🔧 Initializing playback store with DataBus')
    
    const topics = useTopicsStore()
    
    subscribe('INIT_INFO', handleInitInfo)
    subscribe('PLAYBACK_STATUS', handlePlaybackStatus)
    subscribe('COMMAND_ACK', handleCommandAck)
    subscribe('ERROR', handleError)
    subscribe('SUBSCRIPTION_ACK', handleSubscriptionAck)
    
    subscribe('TOPIC_SCHEMA', (msg: any) => topics.handleTopicSchema(msg))
    subscribe('TOPIC_DATA', (msg: any) => topics.handleTopicData(msg))
    subscribe('TOPIC_SCHEMA_RESPONSE', (msg: any) => topics.handleTopicSchemaResponse(msg))
    subscribe('TOPIC_DATA_RESPONSE', (msg: any) => topics.handleTopicDataResponse(msg))
    
    isInitialized = true
    console.log('✅ Playback store initialized (Listeners Attached)')
  }
  
  // ========== 消息处理 ==========
  
  function handleInitInfo(msg: any) {
    const data = msg.data || msg
    console.log('📥 Received INIT_INFO')
    serverVersion.value = data.server_version || ''
    availableKeys.value = data.available_keys || []
    
    const topics = useTopicsStore()
    if (topics.initializeTopics) {
      topics.initializeTopics(data.available_keys || [])
    } else if (topics.initialize) {
      topics.initialize(data.available_keys || [])
    }
    
    if (data.initial_status) {
      updateStatus(data.initial_status, true) 
    }
    
    connected.value = true
  }
  
  function handlePlaybackStatus(msg: any) {
    if (optimisticTimer) return
    const status = msg.data || msg
    updateStatus(status)
  }
  
  function updateStatus(data: PlaybackStatus, force = false) {
    if (force || data.is_playing !== isPlaying.value) {
        isPlaying.value = data.is_playing
        sceneManager.setPhysicsActive(data.is_playing)
        
        // 🌟 [同步状态]
        if (data.is_playing) {
           sceneManager.setPaused(false)
           // 如果后端推过来 Playing 状态，说明我们应该接收数据
           dataBus.setDataFlowEnabled(true) 
        } else {
           sceneManager.setPaused(true)
           // 如果后端是 Pause 状态，我们也不应该接收流数据（除非是单步请求的）
           // 这里可以保守一点：如果是 Pause，就不强制关闸，让 play/pause 按钮去控制
           // 或者：后端都说 Pause 了，那肯定没数据了，关不关无所谓
        }
    }

    playMode.value = data.play_mode
    timestampType.value = data.timestamp_type
    
    currentFrameId.value = data.current_frame_id
    currentTimestamp.value = data.current_timestamp
    
    if (data.frame_range) frameRange.value = data.frame_range
    if (data.time_range) timeRange.value = data.time_range
    
    progress.value = data.progress || 0
    speedMultiplier.value = data.speed_multiplier || 1.0
  }
  
  function handleCommandAck(msg: any) {
    if (!msg.success) {
      console.error(`Command ${msg.command} failed: ${msg.message}`)
      ElMessage.error(`${msg.command} 失败: ${msg.message}`)
      if (msg.command === 'PLAY' || msg.command === 'PAUSE') {
        clearOptimisticTimer()
        getStatus()
      }
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
    if (msg.message && msg.message.includes('HEARTBEAT')) return;
    console.error('📥 Received ERROR:', msg)
    ElMessage.error(`服务器错误: ${msg.message}`)
  }
  
  function sendCommand(type: string, params?: any): boolean {
    if (!dataBus.isConnected()) {
      if (!wsConnected.value) ElMessage.error('DataBus 未连接')
      return false
    }
    return sendDataBusCommand(type, params)
  }
  
  // 🌟 [修正] 添加 function 关键字
  async function requestTopicSchema(topicKey: string): Promise<any> {
    const response = await request('GET_TOPIC_SCHEMA', { topic_key: topicKey })
    return response.schema
  }
  
  // 🌟 [修正] 添加 function 关键字
  async function requestTopicData(topicKey: string): Promise<any> {
    return await request('GET_TOPIC_DATA', { topic_key: topicKey })
  }
  
  // ========== 🌟 [核心修改] 业务控制方法 (乐观更新 + 物理阻断) ==========
  
  function setOptimisticState(playing: boolean) {
    isPlaying.value = playing
    sceneManager.setPhysicsActive(playing)
    
    if (optimisticTimer) clearTimeout(optimisticTimer)
    optimisticTimer = window.setTimeout(() => {
        optimisticTimer = null
    }, 2000)
  }

  function clearOptimisticTimer() {
    if (optimisticTimer) {
        clearTimeout(optimisticTimer)
        optimisticTimer = null
    }
  }

  function play() { 
    // 🟢 1. 允许 3D 渲染
    sceneManager.setPaused(false)
    // 🟢 2. 打开数据总闸 (接收 Topic/Image/Scene)
    dataBus.setDataFlowEnabled(true)
    
    setOptimisticState(true)
    return sendCommand('PLAY') 
  }
  
  function pause() { 
    // 🔴 1. 3D 急刹车 (清除 pendingFrame)
    sceneManager.setPaused(true)
    // 🔴 2. 关闭数据总闸 (丢弃网络层所有新到的业务数据)
    dataBus.setDataFlowEnabled(false)

    setOptimisticState(false)
    return sendCommand('PAUSE') 
  }

  function togglePlay() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }
  
  function stop() { 
    sceneManager.setPaused(true)
    dataBus.setDataFlowEnabled(false)
    setOptimisticState(false)
    return sendCommand('STOP') 
  }
  
  function reset() { 
    sceneManager.setPaused(true)
    dataBus.setDataFlowEnabled(false)
    setOptimisticState(false)
    return sendCommand('RESET') 
  }
  
  // 单步控制：必须临时打开闸门
  function nextFrame() { 
    sceneManager.expectNextFrame() // 🎫 3D 放行令牌
    dataBus.setDataFlowEnabled(true) // 🟢 临时开闸接收这一帧
    return sendCommand('NEXT_FRAME') 
  }
  
  function prevFrame() { 
    sceneManager.expectNextFrame() 
    dataBus.setDataFlowEnabled(true)
    return sendCommand('PREV_FRAME') 
  }
  
  function seekToFrame(frameId: number) {
    sceneManager.expectNextFrame()
    dataBus.setDataFlowEnabled(true)
    return sendCommand('SEEK_FRAME', { frame_id: frameId })
  }
  
  function seekToTime(timestamp: number) {
    sceneManager.expectNextFrame()
    dataBus.setDataFlowEnabled(true)
    return sendCommand('SEEK_TIME', { timestamp })
  }
  
  function seekToProgress(prog: number) {
    sceneManager.expectNextFrame()
    dataBus.setDataFlowEnabled(true)
    return sendCommand('SEEK_PROGRESS', { progress: prog })
  }
  
  function setSpeed(multiplier: number) {
    return sendCommand('SET_SPEED', { multiplier })
  }
  
  function getStatus() {
    return sendCommand('GET_STATUS')
  }
  
  // ========== 订阅方法 ==========
  
  async function subscribeTopic(topicKey: string) {
    const sent = sendCommand('SUBSCRIBE_TOPIC', { topic_key: topicKey })
    
    if (sent) {
      const topics = useTopicsStore()
      try {
        if (!topics.getSchema(topicKey)) {
          const schema = await requestTopicSchema(topicKey)
          if (schema) {
            topics.handleTopicSchemaResponse({ topic_key: topicKey, schema })
          }
        }
        const response = await requestTopicData(topicKey)
        if (response && response.data !== null) {
          topics.handleTopicDataResponse({
            topic_key: topicKey,
            frame_id: response.frame_id,
            timestamp: response.timestamp,
            data: response.data
          })
        }
      } catch (error) {
        console.warn('⚠️ [AutoFetch] Failed to fetch initial data:', error)
      }
    }
    return sent
  }
  
  function getAvailableTopics() {
    return sendCommand('GET_AVAILABLE_TOPICS')
  }
  
  return {
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
    totalFrames,
    duration,
    currentTimeFormatted,
    progressPercent,
    initialize,
    sendCommand,
    requestTopicSchema,
    requestTopicData,
    play,
    pause,
    togglePlay,
    stop,
    reset,
    nextFrame,
    prevFrame,
    seekToFrame,
    seekToTime,
    seekToProgress,
    setSpeed,
    getStatus,
    subscribeTopic,
    getAvailableTopics
  } 
})