// stores/topics.ts - 添加主动拉取响应处理,实现前后端解耦
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TopicSubscription } from '@/types/topic'
import { schemaManager } from '@/packages/data-panel/managers/SchemaManager'
import { dataManager } from '@/packages/data-panel/managers/DataManager'

export const useTopicsStore = defineStore('topics', () => {
  // 订阅状态
  const subscriptions = ref<Map<string, TopicSubscription>>(new Map())
  
  // 计算属性:订阅的topics列表
  const subscribedTopics = computed(() => {
    return Array.from(subscriptions.value.values())
      .filter(sub => sub.subscribed)
      .map(sub => sub.key)
  })
  
  // 计算属性:有数据的topics
  const topicsWithData = computed(() => {
    const keys: string[] = []
    subscriptions.value.forEach((sub) => {
      if (dataManager.hasData(sub.key)) {
        keys.push(sub.key)
      }
    })
    return keys
  })
  
  // 计算属性:当前所有数据
  const currentData = computed(() => {
    const dataMap = new Map()
    subscriptions.value.forEach((sub) => {
      const data = dataManager.getRawData(sub.key)
      if (data) {
        dataMap.set(sub.key, data)
      }
    })
    return dataMap
  })
  
  // ========== 原有的推送消息处理(保留) ==========
  
  /**
   * 处理 TOPIC_SCHEMA 推送消息(播放时的实时schema)
   */
  function handleTopicSchema(msg: any) {
    console.log('📊 TopicsStore: Received TOPIC_SCHEMA push:', msg.topic_key)
    schemaManager.setSchema(msg.topic_key, msg.schema)
  }
  
  /**
   * 处理 TOPIC_DATA 推送消息(播放时的实时数据)
   */
  function handleTopicData(msg: any) {
    const topicKey = msg.topic_key
    
    // 更新数据(转发给 DataManager)
    dataManager.updateData(topicKey, {
      frame_id: msg.frame_id,
      timestamp: msg.timestamp,
      data: msg.data
    })
    
    // 更新订阅信息中的最后更新时间
    if (subscriptions.value.has(topicKey)) {
      const sub = subscriptions.value.get(topicKey)!
      sub.lastUpdate = Date.now()
    }
  }
  
  // ========== 🆕 新增:主动拉取响应处理 ==========
  
  /**
   * 🆕 处理 TOPIC_SCHEMA_RESPONSE(主动请求的schema响应)
   */
  function handleTopicSchemaResponse(msg: any) {
    console.log('📊 TopicsStore: Received TOPIC_SCHEMA_RESPONSE:', msg.topic_key)
    
    // 直接设置schema到 SchemaManager
    // 注意:这里不需要做额外处理,因为Promise的resolve会在playback store中处理
    // 这里只是为了统一日志和可能的副作用处理
    schemaManager.setSchema(msg.topic_key, msg.schema)
  }
  
  /**
   * 🆕 处理 TOPIC_DATA_RESPONSE(主动请求的数据响应)
   */
  function handleTopicDataResponse(msg: any) {
    const topicKey = msg.topic_key
    
    console.log('📊 TopicsStore: Received TOPIC_DATA_RESPONSE:', topicKey,
               msg.frame_id !== null ? `frame: ${msg.frame_id}` : '(no data)')
    
    // 如果有数据,更新到 DataManager
    if (msg.data !== null) {
      dataManager.updateData(topicKey, {
        frame_id: msg.frame_id,
        timestamp: msg.timestamp,
        data: msg.data
      })
      
      // 更新订阅信息
      if (subscriptions.value.has(topicKey)) {
        const sub = subscriptions.value.get(topicKey)!
        sub.lastUpdate = Date.now()
      }
    }
  }
  
  // ========== 订阅管理 ==========
  
  /**
   * 初始化可用的topics
   */
  function initializeTopics(keys: string[]) {
    console.log('🔧 TopicsStore: Initializing topics:', keys)
    
    keys.forEach(key => {
      if (!subscriptions.value.has(key)) {
        subscriptions.value.set(key, {
          key,
          subscribed: false
        })
      }
    })
  }
  
  /**
   * 订阅topic
   */
  function subscribeTopic(key: string) {
    const sub = subscriptions.value.get(key)
    if (sub) {
      sub.subscribed = true
      console.log('✅ TopicsStore: Subscribed to:', key)
    }
  }
  
  /**
   * 取消订阅topic
   */
  function unsubscribeTopic(key: string) {
    const sub = subscriptions.value.get(key)
    if (sub) {
      sub.subscribed = false
      console.log('❌ TopicsStore: Unsubscribed from:', key)
    }
  }
  
  /**
   * 获取topic的schema(从 SchemaManager)
   */
  function getSchema(key: string) {
    return schemaManager.getSchema(key)
  }
  
  /**
   * 获取topic的当前数据(从 DataManager)
   */
  function getData(key: string) {
    return dataManager.getRawData(key)
  }
  
  /**
   * 检查是否有数据
   */
  function hasData(key: string): boolean {
    return dataManager.hasData(key)
  }
  
  /**
   * 清空所有数据
   */
  function clear() {
    subscriptions.value.clear()
    schemaManager.clear()
    dataManager.clear()
  }
  
  return {
    // 状态
    subscriptions,
    
    // 计算属性
    subscribedTopics,
    topicsWithData,
    currentData,
    
    // 原有的推送消息处理
    handleTopicSchema,
    handleTopicData,
    
    // 🆕 新增的响应消息处理
    handleTopicSchemaResponse,
    handleTopicDataResponse,
    
    // 订阅管理
    initializeTopics,
    subscribeTopic,
    unsubscribeTopic,
    getSchema,
    getData,
    hasData,
    clear
  }
})