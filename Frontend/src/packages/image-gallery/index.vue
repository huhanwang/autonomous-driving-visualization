<template>
  <div class="image-gallery-container">
    <div class="gallery-toolbar">
      <div v-if="focusedTopic" class="left-tools">
        <el-button size="small" @click="exitFocus" :icon="Back" type="primary" plain>
          返回列表
        </el-button>
        <span class="focus-title">{{ getShortName(focusedTopic) }}</span>
        <span class="focus-hint">(双击图片还原)</span>
      </div>

      <div v-else class="left-tools">
        <span class="toolbar-title">图像列表</span>
      </div>
      
      <div class="right-tools">
        <el-tag type="info" size="small">{{ Object.keys(images).length }} 视频流</el-tag>
      </div>
    </div>

    <div v-if="Object.keys(images).length === 0" class="empty-gallery">
      <el-empty description="暂无图像数据" :image-size="100">
        <template #description>
          <p>等待图像流推送...</p>
          <p class="sub-text">Type 0x02 Binary Protocol</p>
        </template>
      </el-empty>
    </div>

    <div v-else class="gallery-body">
      
      <div v-if="focusedTopic" class="focus-view">
        <div class="focus-card" @dblclick="exitFocus">
          <img :src="getFocusedImageSrc()" draggable="false" />
        </div>
      </div>

      <div v-else class="grid-container">
        <div class="image-grid" :style="gridStyle">
          <div 
            v-for="(img, topic) in images" 
            :key="topic" 
            class="image-card"
            :class="{ 'is-selected': selectedTopic === topic }"
            @click="$emit('select', topic)"
            @dblclick="enterFocus(topic)"
          >
            <div class="image-header">
              <div class="header-left">
                <span class="camera-name" :title="topic">{{ getShortName(topic) }}</span>
              </div>
              <div class="header-right">
                <span class="res-tag">{{ img.width }}x{{ img.height }}</span>
                <el-button link size="small" class="maximize-btn" @click.stop="enterFocus(topic)">
                  <el-icon><FullScreen /></el-icon>
                </el-button>
              </div>
            </div>
            
            <div class="image-wrapper">
              <img :src="img.url" alt="Camera Feed" draggable="false" />
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { dataBus, type ImageDataEvent } from '@/core/DataBus'
import { Back, FullScreen } from '@element-plus/icons-vue'

const props = defineProps<{
  selectedTopic: string
}>()

const emit = defineEmits<{
  (e: 'select', topic: string): void
}>()

interface GalleryImage {
  topic: string
  url: string
  width: number
  height: number
  timestamp: number
}

// 核心数据源
const images = ref<Record<string, GalleryImage>>({})

// 状态：当前聚焦的 Topic
const focusedTopic = ref<string | null>(null)

// 动态网格布局：根据图片数量自动调整列数
const gridStyle = computed(() => {
  const count = Object.keys(images.value).length
  let cols = 1
  if (count >= 2) cols = 2
  if (count >= 5) cols = 3
  if (count >= 10) cols = 4
  return {
    gridTemplateColumns: `repeat(${cols}, 1fr)`
  }
})

// ========== 辅助函数 ==========

function getShortName(key: string) {
  // 去掉前缀，保留核心名称
  const at = key.indexOf(':')
  let name = at > 0 ? key.substring(0, at) : key
  name = name.replace(/^image_|^camera_/, '')
  return name
}

function getFocusedImageSrc() {
  if (!focusedTopic.value) return ''
  return images.value[focusedTopic.value]?.url || ''
}

// ========== 交互逻辑 ==========

function enterFocus(topic: string) {
  focusedTopic.value = topic
}

function exitFocus() {
  focusedTopic.value = null
}

// ========== 数据处理 ==========

function handleImage(event: ImageDataEvent) {
  const { topic, width, height, data } = event

  // 1. 释放旧 URL (避免内存泄漏)
  if (images.value[topic]) {
    URL.revokeObjectURL(images.value[topic].url)
  }

  // 2. 创建新 Blob URL
  const blob = new Blob([data], { type: 'image/jpeg' })
  const url = URL.createObjectURL(blob)

  // 3. 更新响应式数据
  images.value[topic] = {
    topic,
    url,
    width,
    height,
    timestamp: Date.now()
  }
}

// ========== 生命周期管理 ==========

onMounted(() => {
  dataBus.on('image-data', handleImage)
})

onUnmounted(() => {
  dataBus.off('image-data', handleImage)
  Object.values(images.value).forEach(img => URL.revokeObjectURL(img.url))
})
</script>

<style scoped>
.image-gallery-container {
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}

/* 工具栏 */
.gallery-toolbar, .focus-toolbar {
  height: 36px;
  background: #252525;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  flex-shrink: 0;
}

.focus-toolbar {
  justify-content: flex-start;
  gap: 12px;
  background: #1a1a1a;
}

.toolbar-title {
  font-size: 13px;
  color: #ccc;
  font-weight: 600;
}

.focus-title {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}

.focus-hint {
  color: #666;
  font-size: 12px;
}

.left-tools, .right-tools {
  display: flex;
  align-items: center;
}

/* 核心内容区 */
.gallery-body {
  flex: 1;
  position: relative;
  overflow: hidden; /* 内部滚动 */
}

.empty-gallery {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #666;
}

.sub-text {
  font-size: 12px;
  color: #444;
  margin-top: 4px;
}

/* --- 聚焦模式样式 --- */
.focus-view {
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px; /* 留一点微小的边距 */
}

.focus-card {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.focus-card img {
  /* 🌟 核心：强制撑满容器，但保持比例 */
  width: 100%;
  height: 100%;
  object-fit: contain; 
  display: block;
}

/* --- 列表模式样式 --- */
.grid-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 8px; /* 列表模式下保留内边距 */
}

.image-grid {
  display: grid;
  gap: 8px;
  align-content: start;
}

.image-card {
  background: #2b2b2b;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #333;
  display: flex;
  flex-direction: column;
  transition: border-color 0.1s;
  cursor: pointer;
}

.image-card:hover {
  border-color: #666;
}

.image-card.is-selected {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff;
}

.image-header {
  padding: 4px 8px;
  background: rgba(0,0,0,0.3);
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 28px;
}

.camera-name {
  color: #eee;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.res-tag {
  font-size: 10px;
  color: #888;
  font-family: monospace;
}

.maximize-btn {
  color: #888;
  padding: 0;
}
.maximize-btn:hover {
  color: #fff;
}

.image-wrapper {
  position: relative;
  /* 列表缩略图保持 16:9 比例 */
  aspect-ratio: 16 / 9; 
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
</style>