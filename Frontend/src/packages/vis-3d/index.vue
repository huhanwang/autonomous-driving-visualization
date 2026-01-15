<template>
  <div class="vis-3d-wrapper">
    <div class="canvas-container" ref="containerRef"></div>
    
    <div class="hud-layer">
      <el-tag effect="dark" type="info" size="small">3D View (Z-Up)</el-tag>
      <div class="stats" v-if="stats.objectCount > 0">
        Objs: {{ stats.objectCount }} | FPS: {{ stats.fps }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { World } from './core/World'
import { layerManager } from '@/core/vis/LayerManager'
import { ViewMask, type DecodedObject } from '@/core/protocol/VizDecoder'

const props = defineProps<{
  selectedTopic: string
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let world: World | null = null

// 状态统计
const stats = reactive({
  objectCount: 0,
  fps: 0
})

// 渲染循环控制
let rafId: number | null = null
let lastFrameTime = 0
let frameCount = 0
let lastFpsTime = 0

// 待处理的数据缓冲 (Dirty Flag Pattern)
let pendingObjects: DecodedObject[] | null = null
let hasNewData = false

// 响应容器大小变化
const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    if (world) {
      world.resize(entry.contentRect.width, entry.contentRect.height)
    }
  }
})

// 数据回调：只负责接数据，不负责调渲染，极快返回
function onSceneUpdated() {
  // 获取最新数据引用
  pendingObjects = layerManager.getRenderableObjects(ViewMask.VIEW_3D)
  hasNewData = true
}

// 独立的渲染循环 (Game Loop)
function animate(timestamp: number) {
  if (!world) return

  // 1. 处理数据更新 (如果这一帧有新数据)
  if (hasNewData && pendingObjects) {
    world.updateScene(pendingObjects)
    stats.objectCount = pendingObjects.length
    
    // 清除标记，等待下一波数据
    hasNewData = false
    // pendingObjects = null // 可选：如果不置空，World 可能会在无数据时维持上一帧状态
  }

  // 2. 驱动渲染 (如果 World 内部有动画或控制器阻尼，需要每帧调用 render)
  // 假设 world.updateScene 只是更新数据，world 内部可能没有自动 render loop
  // 如果 World 类是按需渲染的，这里可以省略，但在高频数据下建议统一 RAF
  // world.render() 

  // 3. 计算 FPS
  frameCount++
  if (timestamp - lastFpsTime >= 1000) {
    stats.fps = frameCount
    frameCount = 0
    lastFpsTime = timestamp
  }

  rafId = requestAnimationFrame(animate)
}

onMounted(() => {
  if (containerRef.value) {
    // 1. 启动 3D 世界
    world = new World(containerRef.value)
    
    // 2. 监听 Resize
    resizeObserver.observe(containerRef.value)
    
    // 3. 监听数据流
    layerManager.on('scene-updated', onSceneUpdated)
    
    // 4. 启动渲染循环
    lastFpsTime = performance.now()
    rafId = requestAnimationFrame(animate)
  }
})

onUnmounted(() => {
  layerManager.off('scene-updated', onSceneUpdated)
  resizeObserver.disconnect()
  
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  
  if (world) {
    world.dispose()
    world = null
  }
})
</script>

<style scoped>
.vis-3d-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000;
  overflow: hidden;
}

.canvas-container {
  width: 100%;
  height: 100%;
  outline: none;
}

.hud-layer {
  position: absolute;
  top: 12px;
  left: 12px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats {
  color: #888;
  font-size: 12px;
  font-family: monospace;
  background: rgba(0,0,0,0.5);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>