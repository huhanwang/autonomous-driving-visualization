
// TopicDetailPanel.vue - 使用主动拉取实现前后端解耦
<template>
  <div class="topic-detail-panel">
    <!-- 空状态 -->
    <div v-if="!selectedTopic" class="empty-state">
      <el-empty description="请从左侧选择一个 topic" :image-size="120" />
    </div>

    <!-- 加载中状态 -->
    <div v-else-if="loading" class="loading-state">
      <el-loading
        :text="loadingText"
        background="rgba(255, 255, 255, 0.8)"
        :fullscreen="false"
      />
    </div>

    <!-- 内容区域 -->
    <div v-else class="detail-content">
      <!-- Header -->
      <div class="detail-header">
        <!-- 第一行：Topic名称和操作按钮 -->
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
        
        <!-- 第二行：数据状态信息 -->
        <div class="header-row header-meta">
          <div class="meta-tags">
            <el-tag v-if="currentData" type="success" size="small" effect="light" class="compact-tag">
              <el-icon class="tag-icon"><VideoPlay /></el-icon>
              <span>{{ currentData.frame_id }}</span>
            </el-tag>
            <el-tag v-if="currentData" type="info" size="small" effect="light" class="compact-tag">
              <el-icon class="tag-icon"><Clock /></el-icon>
              <span>{{ formatTimestamp(currentData.timestamp) }}</span>
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

      <!-- Data Tree -->
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
            <!-- 展开/折叠图标 -->
            <span v-if="item.hasChildren" class="expand-icon">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path v-if="item.expanded" d="M2 4 L6 8 L10 4 Z" />
                <path v-else d="M4 2 L8 6 L4 10 Z" />
              </svg>
            </span>
            <span v-else class="expand-placeholder"></span>
            
            <!-- 类型图标 -->
            <span class="node-icon" :class="getNodeIconClass(item)">
              <component :is="getNodeIcon(item)" />
            </span>
            
            <!-- 字段名 -->
            <span class="node-name">{{ item.name }}</span>
            
            <!-- 类型标签 -->
            <span v-if="item.type && !item.hasChildren" class="node-type-badge">
              {{ getTypeDisplay(item.type) }}
            </span>
            
            <!-- 值 -->
            <span v-if="item.formattedValue !== undefined" class="node-value">
              <span class="value-equals">=</span>
              <span class="value-content">{{ item.formattedValue }}</span>
            </span>
          </div>
        </RecycleScroller>
      </div>

      <!-- No Data -->
      <div v-else class="no-data">
        <el-empty 
          :description="searchText ? '无匹配结果' : '暂无数据,等待播放...'" 
          :image-size="100"
        />
      </div>

      <!-- Raw JSON -->
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick, h } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useTopicsStore } from '@/stores/topics'
import { usePlaybackStore } from '@/stores/playback'
import { VideoPlay, 
  Clock, 
  Grid, 
  Document,
  Refresh, Search, Fold, Expand } from '@element-plus/icons-vue'
import { formatTimestamp } from '@/utils/time'
import { ElMessage } from 'element-plus'

import { dataManager, type RenderedTreeNode } from '../managers/DataManager'
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

const expandedKeys = ref<Set<string>>(new Set())
const expandAll = ref(false)
const searchText = ref('')
const renderedTree = ref<RenderedTreeNode[]>([])

const headerInfo = ref<{
  frameId: number | null
  timestamp: number | null
}>({
  frameId: null,
  timestamp: null
})

interface FlatTreeNode extends RenderedTreeNode {
  level: number
  expanded: boolean
  hasChildren: boolean
  isMatched?: boolean
}

const schema = computed(() => {
  if (!props.selectedTopic) return null
  return topics.getSchema(props.selectedTopic)
})

const currentData = computed(() => {
  if (!props.selectedTopic) return null
  if (headerInfo.value.frameId === null) return null
  
  return {
    frame_id: headerInfo.value.frameId,
    timestamp: headerInfo.value.timestamp
  }
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

function getShortName(fullPath: string): string {
  const parts = fullPath.split('/')
  return parts[parts.length - 1] || fullPath
}

// 获取节点图标组件
function getNodeIcon(node: FlatTreeNode) {
  if (node.hasChildren) {
    return h('svg', {
      width: '14',
      height: '14',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' })
    ])
  }
  
  const type = node.type?.toLowerCase() || ''
  
  if (type.includes('int') || type.includes('float') || type.includes('double') || type === 'number') {
    return h('svg', {
      width: '14',
      height: '14',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('text', { x: '50%', y: '50%', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': '14', 'font-weight': 'bold' }, '#')
    ])
  }
  
  if (type === 'string') {
    return h('svg', {
      width: '14',
      height: '14',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('path', { d: 'M3 7 L3 17 M21 7 L21 17 M7 12 L17 12' })
    ])
  }
  
  if (type === 'boolean' || type === 'bool') {
    return h('svg', {
      width: '14',
      height: '14',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('circle', { cx: '12', cy: '12', r: '8' }),
      h('path', { d: 'M9 12 L11 14 L15 10' })
    ])
  }
  
  if (type === 'array') {
    return h('svg', {
      width: '14',
      height: '14',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('rect', { x: '5', y: '5', width: '4', height: '4' }),
      h('rect', { x: '5', y: '13', width: '4', height: '4' }),
      h('rect', { x: '13', y: '5', width: '4', height: '4' }),
      h('rect', { x: '13', y: '13', width: '4', height: '4' })
    ])
  }
  
  return h('svg', {
    width: '14',
    height: '14',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2'
  }, [
    h('circle', { cx: '12', cy: '12', r: '3' })
  ])
}

function getNodeIconClass(node: FlatTreeNode): string {
  if (node.hasChildren) return 'icon-object'
  
  const type = node.type?.toLowerCase() || ''
  
  if (type.includes('int') || type.includes('float') || type.includes('double') || type === 'number') {
    return 'icon-number'
  }
  if (type === 'string') return 'icon-string'
  if (type === 'boolean' || type === 'bool') return 'icon-boolean'
  if (type === 'array') return 'icon-array'
  
  return 'icon-default'
}

function getTypeDisplay(type: string): string {
  const typeMap: Record<string, string> = {
    'int32': 'i32',
    'int64': 'i64',
    'uint32': 'u32',
    'uint64': 'u64',
    'float': 'f32',
    'double': 'f64',
    'string': 'str',
    'boolean': 'bool',
    'bytes': 'byte[]',
    'array': '[]',
    'object': '{}',
    'null': '∅'
  }
  
  return typeMap[type.toLowerCase()] || type
}

function flattenTree(
  nodes: RenderedTreeNode[], 
  level: number,
  expandedSet: Set<string>
): FlatTreeNode[] {
  const result: FlatTreeNode[] = []
  
  for (const node of nodes) {
    const hasChildren = !!(node.children?.length)
    const isExpanded = expandedSet.has(node.id)
    
    result.push({
      ...node,
      level,
      expanded: isExpanded,
      hasChildren
    })
    
    if (isExpanded && hasChildren) {
      result.push(...flattenTree(node.children!, level + 1, expandedSet))
    }
  }
  
  return result
}

function filterTreeBySearch(
  flatList: FlatTreeNode[],
  search: string
): FlatTreeNode[] {
  if (!search) return flatList
  
  const lowerSearch = search.toLowerCase()
  const matchedIds = new Set<string>()
  
  for (const node of flatList) {
    const nodeMatches = 
      node.name.toLowerCase().includes(lowerSearch) ||
      node.formattedValue?.toLowerCase().includes(lowerSearch)
    
    if (nodeMatches) {
      matchedIds.add(node.id)
      
      const parts = node.id.split('.')
      for (let i = 1; i < parts.length; i++) {
        const ancestorId = parts.slice(0, i).join('.')
        matchedIds.add(ancestorId)
      }
    }
  }
  
  const expandedForSearch = new Set(expandedKeys.value)
  matchedIds.forEach(id => expandedForSearch.add(id))
  
  const expandedList = flattenTree(renderedTree.value, 0, expandedForSearch)
  
  return expandedList
    .filter(node => matchedIds.has(node.id))
    .map(node => ({
      ...node,
      expanded: true,
      isMatched: node.name.toLowerCase().includes(lowerSearch) ||
                node.formattedValue?.toLowerCase().includes(lowerSearch)
    }))
}

const flatList = computed(() => {
  return flattenTree(renderedTree.value, 0, expandedKeys.value)
})

const filteredFlatList = computed(() => {
  const search = searchText.value.trim()
  if (!search) {
    return flatList.value
  }
  return filterTreeBySearch(flatList.value, search)
})

function handleNodeClick(node: FlatTreeNode) {
  if (!node.hasChildren || searchText.value) return
  
  toggleNode(node.id)
  
  nextTick(() => {
    const newIndex = filteredFlatList.value.findIndex(item => item.id === node.id)
    if (scrollerRef.value && newIndex !== -1) {
      scrollerRef.value.scrollToItem(newIndex)
    }
  })
}

function toggleNode(nodeId: string) {
  if (expandedKeys.value.has(nodeId)) {
    collapseNode(nodeId)
  } else {
    expandedKeys.value.add(nodeId)
  }
}

function collapseNode(nodeId: string) {
  expandedKeys.value.delete(nodeId)
  
  const node = findNodeById(renderedTree.value, nodeId)
  if (node?.children) {
    removeDescendantsFromExpanded(node.children)
  }
}

function findNodeById(nodes: RenderedTreeNode[], id: string): RenderedTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

function removeDescendantsFromExpanded(nodes: RenderedTreeNode[]) {
  for (const node of nodes) {
    expandedKeys.value.delete(node.id)
    if (node.children) {
      removeDescendantsFromExpanded(node.children)
    }
  }
}

function toggleExpandAll() {
  expandAll.value = !expandAll.value
  
  if (expandAll.value) {
    collectAllIds(renderedTree.value).forEach(id => expandedKeys.value.add(id))
  } else {
    expandedKeys.value.clear()
  }
  
  nextTick(() => {
    if (scrollerRef.value) {
      scrollerRef.value.scrollToItem(0)
    }
  })
}

function collectAllIds(nodes: RenderedTreeNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.children?.length) {
      ids.push(node.id)
      ids.push(...collectAllIds(node.children))
    }
  }
  return ids
}

/**
 * 🆕 主动加载topic的schema和数据
 */
async function loadTopicContent() {
  if (!props.selectedTopic) return

  loading.value = true
  loadingText.value = '正在加载schema...'

  try {
    // 1. 检查是否已有schema,没有则请求
    if (!schemaManager.hasSchema(props.selectedTopic)) {
      console.log('📡 Requesting schema for:', props.selectedTopic)
      
      const schema = await playback.requestTopicSchema(props.selectedTopic)
      schemaManager.setSchema(props.selectedTopic, schema)
      
      console.log('✅ Schema loaded')
    } else {
      console.log('♻️ Schema already cached')
    }

    loadingText.value = '正在加载数据...'

    // 2. 请求当前帧的数据
    console.log('📡 Requesting current data for:', props.selectedTopic)
    
    const response = await playback.requestTopicData(props.selectedTopic)
    
    if (response.data !== null) {
      // 有数据,更新到DataManager
      dataManager.updateData(props.selectedTopic, {
        frame_id: response.frame_id!,
        timestamp: response.timestamp!,
        data: response.data
      })
      
      // 加载渲染树
      loadRenderedTree()
      
      console.log('✅ Data loaded, frame:', response.frame_id)
    } else {
      // 暂时没有数据(可能还没开始播放)
      console.log('⏳ No data yet, waiting for playback...')
      renderedTree.value = []
      headerInfo.value = { frameId: null, timestamp: null }
    }

  } catch (error) {
    console.error('❌ Failed to load topic content:', error)
    ElMessage.error('加载数据失败: ' + (error as Error).message)
  } finally {
    loading.value = false
  }
}

/**
 * 🆕 刷新数据(重新请求当前数据)
 */
async function refreshData() {
  if (!props.selectedTopic) return
  
  refreshing.value = true
  
  try {
    console.log('🔄 Refreshing data for:', props.selectedTopic)
    
    const response = await playback.requestTopicData(props.selectedTopic)
    
    if (response.data !== null) {
      dataManager.updateData(props.selectedTopic, {
        frame_id: response.frame_id!,
        timestamp: response.timestamp!,
        data: response.data
      })
      
      loadRenderedTree()
      
      ElMessage.success('数据已刷新')
      console.log('✅ Data refreshed, frame:', response.frame_id)
    } else {
      ElMessage.info('当前无数据')
    }
    
  } catch (error) {
    console.error('❌ Failed to refresh data:', error)
    ElMessage.error('刷新失败: ' + (error as Error).message)
  } finally {
    refreshing.value = false
  }
}

function loadRenderedTree() {
  if (!props.selectedTopic) {
    renderedTree.value = []
    headerInfo.value = { frameId: null, timestamp: null }
    return
  }
  
  const tree = dataManager.getRenderedTree(props.selectedTopic)
  if (tree) {
    const isNewTopic = renderedTree.value.length === 0 || 
      (tree.length > 0 && renderedTree.value[0]?.id !== tree[0]?.id)
    
    if (isNewTopic) {
      expandedKeys.value.clear()
      expandAll.value = false
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

/**
 * 处理实时推送的数据更新
 */
function handleDataUpdate(event: any) {
  if (event.topicKey !== props.selectedTopic) return
  
  if (event.renderedTree) {
    renderedTree.value = event.renderedTree
  }
  
  if (event.frameId !== undefined && event.timestamp !== undefined) {
    headerInfo.value = {
      frameId: event.frameId,
      timestamp: event.timestamp
    }
  }
}

function copyJson() {
  if (!parsedData.value) return
  
  const jsonStr = JSON.stringify(parsedData.value, null, 2)
  navigator.clipboard.writeText(jsonStr).then(() => {
    ElMessage.success('JSON已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

function downloadJson() {
  if (!parsedData.value) return
  
  const jsonStr = JSON.stringify(parsedData.value, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.selectedTopic.replace(/\//g, '_')}_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  
  ElMessage.success('JSON已下载')
}

// 🆕 监听topic变化,主动加载内容
watch(() => props.selectedTopic, async (newTopic, oldTopic) => {
  if (newTopic && newTopic !== oldTopic) {
    // 重置状态
    expandedKeys.value.clear()
    expandAll.value = false
    searchText.value = ''
    headerInfo.value = { frameId: null, timestamp: null }
    
    // 订阅(用于后续的实时推送)
    playback.subscribeTopic(newTopic)
    
    // 立即主动拉取当前状态
    await loadTopicContent()
  }
}, { immediate: true })

onMounted(() => {
  // 监听实时推送的数据更新(播放时)
  dataManager.on('data-updated', handleDataUpdate)
})

onUnmounted(() => {
  dataManager.off('data-updated', handleDataUpdate)
})
</script>

<style scoped>
/* 引入外部样式文件 */
@import '@/assets/topic_detail_panel.css';
</style>