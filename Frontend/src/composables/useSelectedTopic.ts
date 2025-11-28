// composables/useSelectedTopic.ts - 全局选中Topic管理

import { ref } from 'vue'

// 全局单例状态
const selectedTopic = ref<string>('')

/**
 * 全局选中Topic管理
 * 用于在不同组件之间共享选中的Topic状态
 */
export function useSelectedTopic() {
    function selectTopic(topic: string) {
      selectedTopic.value = topic
      console.log('🎯 Global selectedTopic changed:', topic)
    }
    
    function clearSelection() {
      selectedTopic.value = ''
    }
    
    return {
      selectedTopic,
      selectTopic,
      clearSelection
    }
  }