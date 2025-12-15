<template>
  <div class="vis-3d-wrapper">
    <div class="canvas-container" ref="containerRef"></div>
    
    <div class="hud-layer">
      <el-tag effect="dark" type="info" size="small">3D View (Z-Up)</el-tag>
      <div class="stats" v-if="objectCount > 0">
        Objs: {{ objectCount }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { World } from './core/World'
import { layerManager } from '@/core/vis/LayerManager'
import { ViewMask } from '@/core/protocol/VizDecoder'
const props = defineProps<{
  selectedTopic: string
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let world: World | null = null
const objectCount = ref(0)

// 响应容器大小变化
const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    if (world) {
      world.resize(entry.contentRect.width, entry.contentRect.height)
    }
  }
})

function onSceneUpdated() {
  if (!world) return
  const objects = layerManager.getRenderableObjects(ViewMask.VIEW_3D)
  objectCount.value = objects.length
  world.updateScene(objects)
}

onMounted(() => {
  if (containerRef.value) {
    // 1. 启动 3D 世界
    world = new World(containerRef.value)
    
    // 2. 监听 Resize
    resizeObserver.observe(containerRef.value)
    
    // 3. 监听数据流
    layerManager.on('scene-updated', onSceneUpdated)
    
    // 4. 初始尝试渲染
    onSceneUpdated()
  }
})

onUnmounted(() => {
  layerManager.off('scene-updated', onSceneUpdated)
  resizeObserver.disconnect()
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
  outline: none; /* 移除聚焦时的边框 */
}

.hud-layer {
  position: absolute;
  top: 12px;
  left: 12px;
  pointer-events: none; /* 鼠标穿透 */
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