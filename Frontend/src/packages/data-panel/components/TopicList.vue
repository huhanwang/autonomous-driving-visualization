<template>
  <div class="topic-list">
    <div class="list-header">
      <div class="header-left">
        <span class="title">数据列表</span>
      </div>
      <div class="header-right">
        <el-tag size="small" type="info">
          {{ filteredTopicsCount }} / {{ availableTopics.length }}
        </el-tag>
      </div>
    </div>

    <div class="list-controls">
      <el-input
        v-model="searchText"
        placeholder="搜索 topic..."
        :prefix-icon="Search"
        clearable
        size="small"
        class="search-input"
      />
      <el-select
        v-model="selectedPackFilter"
        placeholder="筛选 Pack"
        clearable
        size="small"
        class="pack-filter"
      >
        <el-option
          v-for="group in packGroups"
          :key="group.packAbbrev"
          :label="`${group.packAbbrev} (${group.topics.length})`"
          :value="group.packAbbrev"
        />
      </el-select>
    </div>

    <el-scrollbar class="list-content">
      <div class="topic-groups">
        <div
          v-for="group in filteredGroups"
          :key="group.packAbbrev"
          class="topic-group"
        >
          <div class="group-header" @click="toggleGroup(group.packAbbrev)">
            <div class="group-header-left">
              <el-icon class="collapse-icon" :class="{ expanded: isGroupExpanded(group.packAbbrev) }">
                <ArrowRight />
              </el-icon>
              <span class="group-name">{{ group.packAbbrev }}</span>
              <el-tag size="small" type="info" class="group-count">
                {{ group.topics.length }}
              </el-tag>
              <el-tag
                v-if="group.hasRecentData"
                size="small"
                type="success"
                class="has-data-tag"
              >
                有数据
              </el-tag>
            </div>
          </div>

          <el-collapse-transition>
            <div v-show="isGroupExpanded(group.packAbbrev)" class="group-content">
              <div
                v-for="parsed in group.topics"
                :key="parsed.fullKey"
                class="topic-item"
                :class="{ 
                  active: selectedTopic === parsed.fullKey,
                  'has-data': hasData(parsed.fullKey)
                }"
                @click="selectTopic(parsed.fullKey)"
              >
                <div class="topic-content">
                  <div class="topic-header">
                    <div class="topic-name">
                      <span class="status-dot" :class="{ active: hasData(parsed.fullKey) }"></span>
                      <span class="name-text">{{ parsed.topicName }}</span>
                      <el-tag size="small" type="info" class="channel-tag">
                        CH{{ parsed.channel }}
                      </el-tag>
                      <span 
                        v-if="isRecentlyUpdated(parsed.fullKey)" 
                        class="update-indicator"
                        title="数据更新中"
                      >
                        <el-icon><VideoPlay /></el-icon>
                      </span>
                    </div>
                    <div class="topic-path">{{ parsed.fullKey }}</div>
                  </div>

                  <div v-if="hasData(parsed.fullKey)" class="topic-status">
                    <div class="status-item">
                      <el-icon class="status-icon"><VideoPlay /></el-icon>
                      <span class="status-text">Frame {{ getFrameId(parsed.fullKey) }}</span>
                    </div>
                    <div class="status-item">
                      <el-icon class="status-icon"><Clock /></el-icon>
                      <span class="status-text">{{ getTimestamp(parsed.fullKey) }}</span>
                    </div>
                    <div class="status-item update-time">
                      <span class="status-text">{{ getUpdateTime(parsed.fullKey) }}</span>
                    </div>
                  </div>

                  <div v-else class="topic-no-data">
                    <el-text type="info" size="small">等待数据...</el-text>
                  </div>
                </div>

                <div v-if="selectedTopic === parsed.fullKey" class="topic-arrow">
                  <el-icon><ArrowRight /></el-icon>
                </div>
              </div>
            </div>
          </el-collapse-transition>
        </div>

        <el-empty 
          v-if="filteredGroups.length === 0"
          description="无匹配的 topic"
          :image-size="60"
        />
      </div>
    </el-scrollbar>

    <div class="list-footer">
      <el-button
        size="small"
        @click="expandAll"
        :disabled="allExpanded"
      >
        全部展开
      </el-button>
      <el-button
        size="small"
        @click="collapseAll"
        :disabled="allCollapsed"
      >
        全部折叠
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useTopicsStore } from '@/stores/topics'
import { usePlaybackStore } from '@/stores/playback'
import { Search, VideoPlay, Clock, ArrowRight } from '@element-plus/icons-vue'
import { formatTimestamp } from '@/utils/time'
import { dataManager } from '@/core/data/DataManager'
import { useSelectedTopic } from '@/composables/useSelectedTopic'


const emit = defineEmits<{
  (e: 'select', topic: string): void
}>()

const topics = useTopicsStore()
const playback = usePlaybackStore()

// 🆕 使用全局选中状态
const { selectedTopic, selectTopic: setGlobalSelectedTopic } = useSelectedTopic()

const searchText = ref('')
const selectedPackFilter = ref<string>('')

// 记录最近更新的 topic (用于状态灯显示)
const recentlyUpdated = ref<Set<string>>(new Set())

// 展开/折叠状态
const expandedGroups = ref<Set<string>>(new Set())

// 解析后的 key 结构
interface ParsedKey {
  fullKey: string
  topicName: string
  packAbbrev: string
  groupId: number
  channel: number
}

// 分组结构
interface TopicGroup {
  packAbbrev: string
  topics: ParsedKey[]
  hasRecentData: boolean
}

// 可用的topics列表
const availableTopics = computed(() => playback.availableKeys)

/**
 * 解析 key 字符串
 * 格式: topic_name@pack_abbrev:group_id:channel
 */
function parseKey(key: string): ParsedKey {
  // 分离 @ 前后
  const atIndex = key.indexOf('@')
  if (atIndex === -1) {
    return {
      fullKey: key,
      topicName: key,
      packAbbrev: 'UNKNOWN',
      groupId: 0,
      channel: 0
    }
  }

  const topicName = key.substring(0, atIndex)
  const rest = key.substring(atIndex + 1)

  // 分离 pack_abbrev 和 group_id:channel
  const parts = rest.split(':')
  if (parts.length < 3) {
    return {
      fullKey: key,
      topicName,
      packAbbrev: parts[0] || 'UNKNOWN',
      groupId: 0,
      channel: 0
    }
  }

  return {
    fullKey: key,
    topicName,
    packAbbrev: parts[0],
    groupId: parseInt(parts[1]) || 0,
    channel: parseInt(parts[2]) || 0
  }
}

/**
 * 按 pack_abbrev 分组
 */
const packGroups = computed((): TopicGroup[] => {
  const groupMap = new Map<string, TopicGroup>()

  for (const key of availableTopics.value) {
    const parsed = parseKey(key)
    const packAbbrev = parsed.packAbbrev

    if (!groupMap.has(packAbbrev)) {
      groupMap.set(packAbbrev, {
        packAbbrev,
        topics: [],
        hasRecentData: false
      })
    }

    const group = groupMap.get(packAbbrev)!
    group.topics.push(parsed)

    // 检查是否有最近数据
    if (hasData(key)) {
      group.hasRecentData = true
    }
  }

  // 转换为数组并排序
  const groups = Array.from(groupMap.values())
  
  // 排序规则：
  // 1. 有数据的在前
  // 2. 字母序
  groups.sort((a, b) => {
    if (a.hasRecentData !== b.hasRecentData) {
      return a.hasRecentData ? -1 : 1
    }
    return a.packAbbrev.localeCompare(b.packAbbrev)
  })

  return groups
})

/**
 * 过滤后的分组
 */
const filteredGroups = computed((): TopicGroup[] => {
  let groups = packGroups.value

  // 按 pack filter 过滤 - 空字符串表示显示全部
  if (selectedPackFilter.value && selectedPackFilter.value !== '') {
    groups = groups.filter(g => g.packAbbrev === selectedPackFilter.value)
  }

  // 按搜索文本过滤
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    groups = groups.map(group => {
      const filteredTopics = group.topics.filter(parsed =>
        parsed.fullKey.toLowerCase().includes(search) ||
        parsed.topicName.toLowerCase().includes(search)
      )
      
      if (filteredTopics.length === 0) {
        return null
      }

      return {
        ...group,
        topics: filteredTopics
      }
    }).filter(g => g !== null) as TopicGroup[]
  }

  return groups
})

/**
 * 过滤后的 topic 总数
 */
const filteredTopicsCount = computed(() => {
  return filteredGroups.value.reduce((sum, group) => sum + group.topics.length, 0)
})

/**
 * 是否全部展开
 */
const allExpanded = computed(() => {
  return packGroups.value.length > 0 &&
    packGroups.value.every(g => expandedGroups.value.has(g.packAbbrev))
})

/**
 * 是否全部折叠
 */
const allCollapsed = computed(() => {
  return expandedGroups.value.size === 0
})

/**
 * 检查是否有数据
 */
function hasData(key: string): boolean {
  return topics.currentData.has(key)
}

/**
 * 检查是否最近更新
 */
function isRecentlyUpdated(key: string): boolean {
  return recentlyUpdated.value.has(key)
}

/**
 * 检查分组是否展开
 */
function isGroupExpanded(packAbbrev: string): boolean {
  return expandedGroups.value.has(packAbbrev)
}

/**
 * 获取帧号
 */
function getFrameId(key: string): string {
  const data = topics.getData(key)
  return data?.frame_id?.toLocaleString() || '0'
}

/**
 * 获取时间戳
 */
function getTimestamp(key: string): string {
  const data = topics.getData(key)
  if (!data?.timestamp) return '--:--:--'
  return formatTimestamp(data.timestamp)
}

/**
 * 获取更新时间提示
 */
function getUpdateTime(key: string): string {
  const sub = topics.subscriptions.get(key)
  if (!sub?.lastUpdate) return ''
  
  const now = Date.now()
  const diff = now - sub.lastUpdate
  
  if (diff < 1000) return '刚刚更新'
  if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  return `${Math.floor(diff / 3600000)}小时前`
}

/**
 * 切换分组展开/折叠
 */
function toggleGroup(packAbbrev: string) {
  if (expandedGroups.value.has(packAbbrev)) {
    expandedGroups.value.delete(packAbbrev)
  } else {
    expandedGroups.value.add(packAbbrev)
  }
}

function selectTopic(key: string) {
  console.log('🎯 Selecting topic:', key)
  
  if (selectedTopic.value === key) {
    // 取消选中
    setGlobalSelectedTopic('')
    emit('select', '')
  } else {
    const success = playback.subscribeTopic(key)
    if (success) {
      // 🆕 更新全局状态（这会同步到所有使用该状态的组件）
      setGlobalSelectedTopic(key)
      emit('select', key)
    }
  }
}

/**
 * 全部展开
 */
function expandAll() {
  packGroups.value.forEach(group => {
    expandedGroups.value.add(group.packAbbrev)
  })
}

/**
 * 全部折叠
 */
function collapseAll() {
  expandedGroups.value.clear()
}

/**
 * 处理数据更新事件
 */
function handleDataUpdate(event: any) {
  const topicKey = event.topicKey
  
  // 添加到最近更新集合，显示更新指示灯
  recentlyUpdated.value.add(topicKey)
  
  // 2秒后移除指示灯
  setTimeout(() => {
    recentlyUpdated.value.delete(topicKey)
  }, 2000)
}

// 监听搜索文本变化，自动展开有结果的分组
watch(searchText, (newValue) => {
  if (newValue) {
    // 搜索时自动展开所有有匹配结果的分组
    filteredGroups.value.forEach(group => {
      expandedGroups.value.add(group.packAbbrev)
    })
  }
})

// 初始化：默认展开有数据的分组
onMounted(() => {
  dataManager.on('data-updated', handleDataUpdate)
  
  // 默认展开前3个分组，或者有数据的分组
  packGroups.value.slice(0, 3).forEach(group => {
    expandedGroups.value.add(group.packAbbrev)
  })
  
  packGroups.value.forEach(group => {
    if (group.hasRecentData) {
      expandedGroups.value.add(group.packAbbrev)
    }
  })
})

onUnmounted(() => {
  dataManager.off('data-updated', handleDataUpdate)
})
</script>

<style scoped>
/* 引入外部样式文件 */
@import '@/assets/topic_list.css';
</style>