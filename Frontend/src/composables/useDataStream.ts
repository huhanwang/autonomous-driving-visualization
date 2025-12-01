// Frontend/src/composables/useDataStream.ts - 通用数据流订阅 Hook

import { shallowRef, onMounted, onUnmounted, watch, type ShallowRef } from 'vue'
import { dataBus } from '@/core/DataBus'
import { dataManager } from '@/packages/data-panel/managers/DataManager'

/**
 * 通用数据流订阅 Hook
 * * 特性：
 * 1. 自动管理订阅/取消订阅
 * 2. 使用 shallowRef 优化性能（适合高频大数据）
 * 3. 支持组件卸载自动清理
 * * @param topicKey Topic 键名
 * @param defaultValue 默认值
 * @returns 响应式的数据引用
 */
export function useDataStream<T = any>(
  topicKey: string | (() => string), 
  defaultValue: T | null = null
): ShallowRef<T | null> {
  // 使用 shallowRef 避免 Vue 对大数据进行深度响应式转换
  const data = shallowRef<T | null>(defaultValue)
  
  let unsubscribe: (() => void) | null = null

  // 处理订阅逻辑
  function setupSubscription(key: string) {
    // 1. 清理旧订阅
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }

    if (!key) {
      data.value = defaultValue
      return
    }

    // 2. 尝试获取初始缓存数据
    const cached = dataManager.getParsedData(key)
    if (cached) {
      data.value = cached as T
    }

    // 3. 建立新订阅
    // 注意：这里订阅的是 DataBus 的事件，payload 应该是处理后的数据
    // 如果 DataBus 还是分发原始消息，这里可能需要适配
    // 假设 DataManager 或 DataBus 已经发出了更新信号
    
    // 方案 A: 监听 DataManager 的轻量级事件，然后主动拉取 (Pull Mode - 推荐)
    const handler = (event: any) => {
      if (event.topicKey === key) {
        const latest = dataManager.getParsedData(key)
        if (latest) {
          data.value = latest as T
        }
      }
    }
    
    dataManager.on('data-updated', handler)
    unsubscribe = () => dataManager.off('data-updated', handler)
  }

  // 监听 topicKey 变化
  if (typeof topicKey === 'function') {
    watch(topicKey, (newKey) => {
      setupSubscription(newKey)
    }, { immediate: true })
  } else {
    onMounted(() => {
      setupSubscription(topicKey)
    })
  }

  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  })

  return data
}