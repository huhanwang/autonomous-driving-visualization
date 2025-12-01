<template>
  <div class="topic-detail-panel">
    <div v-if="!selectedTopic" class="empty-state">
      <el-empty description="请从左侧选择一个 topic" :image-size="120" />
    </div>

    <div v-else-if="loading" class="loading-state">
      <el-loading
        :text="loadingText"
        background="rgba(255, 255, 255, 0.8)"
        :fullscreen="false"
      />
    </div>

    <div v-else class="detail-content">
      <div class="detail-header">
        <div class="header-row header-main">
          <div class="topic-info">
            <span class="topic-name" :title="selectedTopic">
              {{ getShortName(selectedTopic) }}
            </span>
            <el-tag v-if="schema" type="primary" size="small" effect="plain" class="proto-tag">
              {{ schema.proto_type }}
            </el-tag>
          </div>
          
          <div class="header-actions">
            <el-input
              v-model="searchText"
              placeholder="搜索字段..."
              :prefix-icon="Search"
              clearable
              size="small"
              class="search-input"
            />
            <el-button
              size="small"
              :icon="Refresh"
              @click="refreshData"
              :loading="refreshing"
              circle
              title="刷新"
            />
            <el-button
              size="small"
              :icon="expandAll ? Fold : Expand"
              @click="toggleExpandAll"
              circle
              :title="expandAll ? '折叠全部' : '展开全部'"
            />
          </div>
        </div>
        
        <div class="header-row header-meta">
          <div class="meta-tags">
            <el-tag v-if="headerInfo.frameId !== null" type="success" size="small" effect="light" class="compact-tag">
              <el-icon class="tag-icon"><VideoPlay /></el-icon>
              <span>{{ headerInfo.frameId }}</span>
            </el-tag>
            <el-tag v-if="headerInfo.timestamp !== null" type="info" size="small" effect="light" class="compact-tag">
              <el-icon class="tag-icon"><Clock /></el-icon>
              <span>{{ formatTimestamp(headerInfo.timestamp) }}</span>
            </el-tag>
            <span v-if="schema" class="meta-info">
              <el-icon><Grid /></el-icon>
              {{ schema.fields.length }} 字段
            </span>
            <span class="meta-info">
              <el-icon><Document /></el-icon>
              {{ dataSize }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="filteredFlatList.length > 0" class="data-tree">
        <RecycleScroller
          ref="scrollerRef"
          :items="filteredFlatList"
          :item-size="36"
          key-field="id"
          v-slot="{ item }"
          class="tree-scroller"
        >
          <div 
            class="tree-node" 
            :class="{ 
              'node-matched': item.isMatched,
              'node-has-children': item.hasChildren,
              'node-expanded': item.expanded,
              'node-null': item.value === null || item.value === undefined || item.formattedValue === 'null'
            }"
            :style="{ paddingLeft: (item.level * 20 + 16) + 'px' }"
            @click="handleNodeClick(item)"
          >
            <span v-if="item.hasChildren" class="expand-icon">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path v-if="item.expanded" d="M2 4 L6 8 L10 4 Z" />
                <path v-else d="M4 2 L8 6 L4 10 Z" />
              </svg>
            </span>
            <span v-else class="expand-placeholder"></span>
            
            <span class="node-icon" :class="getNodeIconClass(item)">
              <component :is="getNodeIcon(item)" />
            </span>
            
            <span class="node-name">{{ item.name }}</span>
            
            <span v-if="item.type && !item.hasChildren" class="node-type-badge">
              {{ getTypeDisplay(item.type) }}
            </span>
            
            <span v-if="item.formattedValue !== undefined" class="node-value">
              <span class="value-equals">=</span>
              <span class="value-content">{{ item.formattedValue }}</span>
            </span>
          </div>
        </RecycleScroller>
      </div>

      <div v-else class="no-data">
        <el-empty 
          :description="searchText ? '无匹配结果' : '暂无数据,等待播放...'" 
          :image-size="100"
        />
      </div>

      <div v-if="parsedData" class="raw-json">
        <el-collapse>
          <el-collapse-item name="json">
            <template #title>
              <div class="json-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 7h3a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-3"></path>
                  <path d="M20 7h-3a2 2 0 0 0 -2 2v6a2 2 0 0 0 2 2h3"></path>
                </svg>
                <span>原始 JSON</span>
              </div>
            </template>
            <div class="json-viewer">
              <pre>{{ JSON.stringify(parsedData, null, 2) }}</pre>
            </div>
            <div class="json-actions">
              <el-button size="small" @click="copyJson">
                复制 JSON
              </el-button>
              <el-button size="small" @click="downloadJson">
                下载 JSON
              </el-button>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, h, shallowRef } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useThrottleFn } from '@vueuse/core'
import { useTopicsStore } from '@/stores/topics'
import { usePlaybackStore } from '@/stores/playback'
import { useTopicTree, type FlatTreeNode } from '@/composables/useTopicTree' // ✅ 引入新逻辑
import { VideoPlay, Clock, Grid, Document, Refresh, Search, Fold, Expand } from '@element-plus/icons-vue'
import { formatTimestamp } from '@/utils/time'
import { ElMessage } from 'element-plus'

import { dataManager, type RenderedTreeNode, type DataUpdateEvent } from '../managers/DataManager'
import { schemaManager } from '../managers/SchemaManager'

const props = defineProps<{
  selectedTopic: string
}>()

const topics = useTopicsStore()
const playback = usePlaybackStore()
const scrollerRef = ref<any>(null)

const loading = ref(false)
const loadingText = ref('正在加载...')
const refreshing = ref(false)

// 渲染树数据源
const renderedTree = shallowRef<RenderedTreeNode[]>([])

// ✅ 使用 useTopicTree 接管树形逻辑
const {
  searchText,
  expandAll,
  filteredFlatList,
  toggleExpandAll,
  handleNodeClick,
  reset: resetTreeState
} = useTopicTree(renderedTree, scrollerRef)

const headerInfo = ref<{
  frameId: number | null
  timestamp: number | null
}>({
  frameId: null,
  timestamp: null
})

// ... (getShortName, getNodeIcon, getNodeIconClass, getTypeDisplay 函数代码与之前完全一致，保留) ...
// 请将这些渲染辅助函数保留在组件内，因为它们涉及 JSX/h 渲染，属于 View 层逻辑
function getShortName(fullKey: string): string {
  if (!fullKey) return ''
  const atIndex = fullKey.indexOf('@')
  if (atIndex !== -1) return fullKey.substring(0, atIndex)
  const lastSlash = fullKey.lastIndexOf('/')
  if (lastSlash !== -1) return fullKey.substring(lastSlash + 1)
  return fullKey
}

// ... 这里省略 getNodeIcon 等渲染函数，请直接复制上一版的相关代码 ...
// 如果觉得代码太长，建议将这些纯渲染函数提取到 `src/utils/treeRenderer.ts`

function getNodeIcon(node: FlatTreeNode) {
  if (node.hasChildren) {
    return h('svg', {
      width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2'
    }, [h('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' })])
  }
  return h('svg', {
    width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2'
  }, [h('circle', { cx: '12', cy: '12', r: '3' })])
}

function getNodeIconClass(node: FlatTreeNode): string {
  if (node.hasChildren) return 'icon-object'
  const type = node.type?.toLowerCase() || ''
  if (type.includes('int') || type.includes('float') || type.includes('double') || type === 'number') return 'icon-number'
  if (type === 'string') return 'icon-string'
  if (type === 'boolean' || type === 'bool') return 'icon-boolean'
  if (type === 'array') return 'icon-array'
  return 'icon-default'
}

function getTypeDisplay(type: string): string {
  const typeMap: Record<string, string> = {
    'int32': 'i32', 'int64': 'i64', 'uint32': 'u32', 'uint64': 'u64',
    'float': 'f32', 'double': 'f64', 'string': 'str', 'boolean': 'bool',
    'bytes': 'byte[]', 'array': '[]', 'object': '{}', 'null': '∅'
  }
  return typeMap[type.toLowerCase()] || type
}

// 计算属性
const schema = computed(() => {
  if (!props.selectedTopic) return null
  return topics.getSchema(props.selectedTopic)
})

const parsedData = computed(() => {
  if (!props.selectedTopic) return null
  return dataManager.getParsedData(props.selectedTopic)
})

const dataSize = computed(() => {
  if (!parsedData.value) return '0 B'
  const jsonStr = JSON.stringify(parsedData.value)
  const bytes = new Blob([jsonStr]).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
})

// 数据同步逻辑
function syncDataFromManager() {
  if (!props.selectedTopic) return
  
  const tree = dataManager.getRenderedTree(props.selectedTopic)
  if (tree) {
    const isNewTopic = renderedTree.value.length === 0 || 
      (tree.length > 0 && renderedTree.value[0]?.id !== tree[0]?.id)
    
    if (isNewTopic) {
      resetTreeState() // ✅ 使用 Hook 的 reset 方法
    }
    
    renderedTree.value = tree
  } else {
    renderedTree.value = []
  }
  
  const rawData = dataManager.getRawData(props.selectedTopic)
  if (rawData) {
    headerInfo.value = {
      frameId: rawData.frame_id,
      timestamp: rawData.timestamp
    }
  }
}

const throttledUpdate = useThrottleFn(() => {
  syncDataFromManager()
}, 100)

function handleDataUpdate(event: DataUpdateEvent) {
  if (event.topicKey !== props.selectedTopic) return
  throttledUpdate()
}

// 加载逻辑
async function loadTopicContent() {
  if (!props.selectedTopic) return
  
  // 1. 开启加载状态，但我们不打算让它转很久
  loading.value = true
  
  // 2. 立即发起 Schema 请求 (不使用 await 阻塞主流程)
  if (!schemaManager.hasSchema(props.selectedTopic)) {
    playback.requestTopicSchema(props.selectedTopic)
      .then(schema => {
        if (schema) schemaManager.setSchema(props.selectedTopic, schema)
      })
      .catch(() => {
        // 忽略超时，反正我们已经订阅了，Schema 会通过推送送达
        console.log('Schema request skipped, waiting for push...')
      })
  }

  // 3. 立即发起数据请求 (同样不阻塞)
  playback.requestTopicData(props.selectedTopic)
    .then(response => {
      if (response && response.data !== null) {
        dataManager.updateData(props.selectedTopic, {
          frame_id: response.frame_id!,
          timestamp: response.timestamp!,
          data: response.data
        })
        syncDataFromManager()
      }
    })
    .catch(() => { /* ignore */ })

  // 4. 关键点：不等请求结果，直接结束 loading 状态
  // 因为我们已经订阅了 Topic，数据很快就会通过 WebSocket 推送过来
  // 让 UI 处于"准备就绪"状态，一旦推送到达，throttledUpdate 会自动刷新界面
  setTimeout(() => {
    loading.value = false
  }, 300) // 给一个极短的视觉缓冲即可
}

async function refreshData() {
  // ... 保持不变
  if (!props.selectedTopic) return
  refreshing.value = true
  try {
    const response = await playback.requestTopicData(props.selectedTopic)
    if (response.data !== null) {
      dataManager.updateData(props.selectedTopic, {
        frame_id: response.frame_id!,
        timestamp: response.timestamp!,
        data: response.data
      })
      syncDataFromManager()
      ElMessage.success('刷新成功')
    }
  } catch (error) {
    ElMessage.warning('刷新请求超时，等待推送')
  } finally {
    refreshing.value = false
  }
}

function copyJson() {
  if (!parsedData.value) return
  navigator.clipboard.writeText(JSON.stringify(parsedData.value, null, 2))
    .then(() => ElMessage.success('已复制'))
}

function downloadJson() {
  // ... 保持不变
}

watch(() => props.selectedTopic, async (newTopic, oldTopic) => {
  if (newTopic && newTopic !== oldTopic) {
    resetTreeState() // ✅
    headerInfo.value = { frameId: null, timestamp: null }
    playback.subscribeTopic(newTopic)
    await loadTopicContent()
  }
}, { immediate: true })

onMounted(() => {
  dataManager.on('data-updated', handleDataUpdate)
})

onUnmounted(() => {
  dataManager.off('data-updated', handleDataUpdate)
})
</script>

<style scoped>
@import '@/assets/topic_detail_panel.css';
</style>