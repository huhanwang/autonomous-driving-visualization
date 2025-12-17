<template>
  <div class="visualization-2d" ref="containerRef">
    <div class="toolbar">
      <el-radio-group v-model="currentTool" size="small" @change="measureState.step = 0">
        <el-radio-button label="pan"><el-icon><Pointer /></el-icon> 漫游</el-radio-button>
        <el-radio-button label="measure"><el-icon><EditPen /></el-icon> 测距</el-radio-button>
      </el-radio-group>
      <el-divider direction="vertical" />
      <el-button-group size="small">
        <el-tooltip content="重置视角">
          <el-button :icon="Aim" @click="resetView" />
        </el-tooltip>
      </el-button-group>
      <div class="coord-info">
        <el-tag size="small" type="info" effect="plain" class="coord-tag">
          <el-icon><Compass /></el-icon>{{ coordLabel }}
        </el-tag>
      </div>
    </div>

    <canvas 
      ref="canvasRef"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @wheel.prevent="handleWheel"
    ></canvas>
    
    <div v-if="currentTool === 'measure' && measureState.step > 0" class="measure-panel">
      <div class="panel-title">📏 测量工具</div>
      <div class="panel-row"><span>距离:</span><span class="value">{{ measureState.distance.toFixed(3) }} m</span></div>
      </div>

    <div class="status-bar">
      <div class="status-item">🖱️ {{ mouseWorldPos.x.toFixed(2) }}, {{ mouseWorldPos.y.toFixed(2) }}</div>
      <div class="status-item">🔍 {{ viewport.scale.toFixed(1) }}x</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { layerManager } from '@/core/vis/LayerManager'
import { ViewMask, CoordinateSystem } from '@/core/protocol/VizDecoder'
import { Canvas2DRenderer } from './core/Canvas2DRenderer'
import { useCanvasInteraction } from './composables/useCanvasInteraction'
import { Aim, Pointer, EditPen, Compass } from '@element-plus/icons-vue'

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const rendererRef = ref<Canvas2DRenderer | null>(null) // 传给 hook 用

// 1. 初始化交互 Hook
const { 
  viewport, currentTool, mouseWorldPos, measureState,
  handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, resetView
} = useCanvasInteraction(rendererRef, canvasRef)

// 2. 坐标系适配
const coordLabel = computed(() => {
  const map: Record<number, string> = {
    [CoordinateSystem.RIGHT_HANDED_Z_UP_X_FWD]: 'ROS (X前 Y左)',
    // ... 其他映射
  }
  return map[layerManager.currentCoordinateSystem] || 'Unknown'
})

watch(() => layerManager.currentCoordinateSystem, (sys) => {
  // 应用坐标系策略 (X右 Y上)
  // ROS: Rot 90, FlipY false
  switch(sys) {
    case CoordinateSystem.RIGHT_HANDED_Z_UP_X_FWD: 
      viewport.rotation = Math.PI / 2; viewport.flipY = false; break;
    default: 
      viewport.rotation = 0; viewport.flipY = false; break;
  }
}, { immediate: true })

// 3. 渲染循环
let animationFrameId: number
function loop() {
  if (rendererRef.value) {
    const objects = layerManager.getRenderableObjects(ViewMask.VIEW_2D)
    rendererRef.value.render(objects, viewport)
    
    if (measureState.step > 0) {
      rendererRef.value.drawMeasureLine(measureState.start, measureState.end, viewport)
    }
  }
  animationFrameId = requestAnimationFrame(loop)
}

// 4. 生命周期
onMounted(() => {
  if (canvasRef.value && containerRef.value) {
    rendererRef.value = new Canvas2DRenderer(canvasRef.value)
    
    const resizeObserver = new ResizeObserver(() => {
      if(containerRef.value && rendererRef.value) 
        rendererRef.value.resize(containerRef.value.clientWidth, containerRef.value.clientHeight)
    })
    resizeObserver.observe(containerRef.value)
    
    loop()
  }
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId)
})
</script>

<style scoped>
.visualization-2d {
  width: 100%;
  height: 100%;
  position: relative;
  background: #1e1e1e;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.toolbar {
  height: 40px;
  background: #2b2b2b;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 12px;
  flex-shrink: 0;
}

/* 坐标系信息标签 */
.coord-info {
  margin-left: auto; /* 推到最右侧 */
  font-family: monospace;
}

canvas {
  flex: 1;
  display: block;
  cursor: crosshair;
  width: 100% !important;
  height: 100% !important;
}

.status-bar {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  color: #eee;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'SF Mono', monospace;
  font-size: 11px;
  pointer-events: none;
  display: flex;
  gap: 12px;
  border: 1px solid rgba(255,255,255,0.1);
}

.measure-panel {
  position: absolute;
  top: 50px;
  left: 10px;
  width: 220px;
  background: rgba(30, 30, 30, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 10px;
  color: #ddd;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  pointer-events: none;
  font-family: 'SF Mono', monospace;
  font-size: 12px;
}

.panel-title {
  font-weight: 600;
  color: #409eff;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 4px;
}

.panel-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.panel-row.highlight {
  color: #e6a23c;
  font-weight: bold;
  margin: 6px 0;
  font-size: 13px;
}

.label { color: #909399; }
.panel-hint {
  margin-top: 8px;
  font-size: 11px;
  color: #606266;
  text-align: center;
  font-style: italic;
}
</style>