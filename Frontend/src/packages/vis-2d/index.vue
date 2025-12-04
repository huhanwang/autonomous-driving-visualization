<template>
  <div class="visualization-2d" ref="containerRef">
    <!-- 1. 顶部工具栏 -->
    <div class="toolbar">
      <!-- 模式切换 -->
      <el-radio-group v-model="currentTool" size="small" @change="handleToolChange">
        <el-radio-button label="pan">
          <el-icon><Pointer /></el-icon> 漫游
        </el-radio-button>
        <el-radio-button label="measure">
          <el-icon><EditPen /></el-icon> 测距
        </el-radio-button>
      </el-radio-group>

      <el-divider direction="vertical" />

      <!-- 视图操作 -->
      <el-button-group size="small">
        <el-tooltip content="重置视角">
          <el-button :icon="Aim" @click="resetView" />
        </el-tooltip>
      </el-button-group>

      <!-- 坐标系选择 -->
      <el-dropdown size="small" @command="handleCoordModeChange">
        <el-button size="small">
          {{ getCoordModeLabel(layout.state.vis2d.coordinateMode) }}
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="standard">标准 (X右 Y上)</el-dropdown-item>
            <el-dropdown-item command="auto">自驾 (X上 Y左)</el-dropdown-item>
            <el-dropdown-item command="custom">自定义 (X上 Y右)</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 2. 画布 -->
    <canvas 
      ref="canvasRef"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @wheel.prevent="handleWheel"
    ></canvas>
    
    <!-- 3. 详细测量信息面板 (左上角) -->
    <div v-if="currentTool === 'measure' && measureState.step > 0" class="measure-panel">
      <div class="panel-title">📏 测量工具</div>
      <div class="panel-row">
        <span class="label">起点:</span>
        <span class="value">({{ measureState.start.x.toFixed(2) }}, {{ measureState.start.y.toFixed(2) }})</span>
      </div>
      <div class="panel-row">
        <span class="label">终点:</span>
        <span class="value">({{ measureState.end.x.toFixed(2) }}, {{ measureState.end.y.toFixed(2) }})</span>
      </div>
      <div class="panel-row highlight">
        <span class="label">距离:</span>
        <span class="value">{{ measureState.distance.toFixed(3) }} m</span>
      </div>
      <div class="panel-row">
        <span class="label">ΔX/ΔY:</span>
        <span class="value">{{ (measureState.end.x - measureState.start.x).toFixed(2) }}, {{ (measureState.end.y - measureState.start.y).toFixed(2) }}</span>
      </div>
      <div class="panel-hint" v-if="measureState.step === 1">
        单击确定终点
      </div>
      <div class="panel-hint" v-if="measureState.step === 2">
        单击开始新测量
      </div>
    </div>

    <!-- 4. 底部简单状态栏 -->
    <div class="status-bar">
      <div class="status-item">
        🖱️ {{ (mouseWorldPos.x).toFixed(2) }}, {{ (mouseWorldPos.y).toFixed(2) }}
      </div>
      <div class="status-item">
        🔍 {{ viewport.scale.toFixed(1) }}x
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive, watch } from 'vue'
import { sceneManager } from '@/core/vis/SceneManager'
import { Canvas2DRenderer, type Viewport, type Point2D } from './core/Canvas2DRenderer'
import { useLayoutStore } from '@/stores/layout'
import { Aim, Pointer, EditPen, ArrowDown } from '@element-plus/icons-vue'

interface Props {
  selectedTopic: string
}
defineProps<Props>()

const layout = useLayoutStore()
const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let renderer: Canvas2DRenderer | null = null
let animationFrameId: number | null = null
let resizeObserver: ResizeObserver | null = null

// ========== 状态管理 ==========
const currentTool = ref<'pan' | 'measure'>('pan')
const mouseWorldPos = reactive<Point2D>({ x: 0, y: 0 })

// 🌟 升级后的测量状态机
const measureState = reactive({
  step: 0, // 0: Idle, 1: Drawing, 2: Finished
  start: { x: 0, y: 0 },
  end: { x: 0, y: 0 },
  distance: 0
})

// 视图状态
const viewport = reactive<Viewport>({
  x: 0, y: 0, scale: 20, rotation: 0, flipY: false
})

// 漫游交互状态
const panInteraction = {
  isDragging: false,
  lastX: 0,
  lastY: 0
}

// ========== 核心逻辑更新 ==========

function handleToolChange(val: string) {
  // 切换工具时，重置测量状态
  if (val !== 'measure') {
    measureState.step = 0
    measureState.distance = 0
  }
}

function handleMouseDown(e: MouseEvent) {
  if (!renderer) return
  const rect = canvasRef.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  
  // 1. 漫游模式
  if (currentTool.value === 'pan') {
    panInteraction.isDragging = true
    panInteraction.lastX = e.clientX
    panInteraction.lastY = e.clientY
  } 
  // 2. 测量模式
  else if (currentTool.value === 'measure') {
    const worldPos = renderer.screenToWorld(mx, my, viewport)
    
    if (measureState.step !== 1) {
      // 🟢 状态 0 或 2 -> 状态 1 (开始新测量)
      // 无论是刚开始，还是上一次测量已完成，点击都意味着"重新开始"
      measureState.start = worldPos
      measureState.end = worldPos
      measureState.distance = 0
      measureState.step = 1
    } else {
      // 🔴 状态 1 -> 状态 2 (结束测量，定格)
      measureState.end = worldPos
      measureState.distance = calcDistance(measureState.start, measureState.end)
      measureState.step = 2
      // 注意：这里不重置 step，保持为 2，让线留在屏幕上
    }
  }
}

function handleMouseMove(e: MouseEvent) {
  if (!renderer) return
  const rect = canvasRef.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  
  // 实时计算鼠标世界坐标
  const worldPos = renderer.screenToWorld(mx, my, viewport)
  mouseWorldPos.x = worldPos.x
  mouseWorldPos.y = worldPos.y
  
  // 1. 漫游处理
  if (currentTool.value === 'pan' && panInteraction.isDragging) {
    const deltaX = e.clientX - panInteraction.lastX
    const deltaY = e.clientY - panInteraction.lastY
    
    const s = viewport.scale
    const r = viewport.rotation
    const flipFactor = viewport.flipY ? 1 : -1
    
    const cos = Math.cos(-r)
    const sin = Math.sin(-r)
    const dxWorld = (deltaX * cos - deltaY * sin) / s
    const dyWorld = (deltaX * sin + deltaY * cos) / (s * flipFactor)
    
    viewport.x -= dxWorld
    viewport.y -= dyWorld
    
    panInteraction.lastX = e.clientX
    panInteraction.lastY = e.clientY
  }
  
  // 2. 测量处理 (仅在 Drawing 阶段更新)
  if (currentTool.value === 'measure' && measureState.step === 1) {
    measureState.end = worldPos
    measureState.distance = calcDistance(measureState.start, measureState.end)
  }
}

function handleMouseUp() {
  if (currentTool.value === 'pan') {
    panInteraction.isDragging = false
  }
}

// 辅助计算距离
function calcDistance(p1: Point2D, p2: Point2D) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx*dx + dy*dy)
}

// ========== 渲染循环 ==========

function startRenderLoop() {
  const loop = () => {
    if (renderer) {
      const objects = sceneManager.getAllObjects()
      
      // 1. 绘制场景
      renderer.render(objects, viewport)
      
      // 2. 绘制测量线 (只要不是 Idle 状态就绘制)
      // step=1: 动态跟随鼠标
      // step=2: 定格显示结果
      if (measureState.step > 0) {
         renderer.drawMeasureLine(measureState.start, measureState.end, viewport)
      }
    }
    animationFrameId = requestAnimationFrame(loop)
  }
  loop()
}

// ... (以下是 Resize, Wheel, 坐标模式切换逻辑，与之前保持一致) ...

watch(() => layout.state.vis2d.coordinateMode, (mode) => {
  applyCoordMode(mode)
}, { immediate: true })

function applyCoordMode(mode: string) {
  viewport.x = 0; viewport.y = 0;
  switch (mode) {
    case 'standard': viewport.rotation = 0; viewport.flipY = false; break;
    case 'auto': viewport.rotation = Math.PI / 2; viewport.flipY = false; break;
    case 'custom': viewport.rotation = -Math.PI / 2; viewport.flipY = true; break;
  }
}

function handleCoordModeChange(mode: any) {
  layout.state.vis2d.coordinateMode = mode
}

function getCoordModeLabel(mode: string) {
  const map: Record<string, string> = { standard: '标准', auto: '自驾', custom: '自定义' }
  return map[mode] || mode
}

function resetView() {
  viewport.x = 0; viewport.y = 0; viewport.scale = 20;
}

function handleWheel(e: WheelEvent) {
  const zoomFactor = 1.1
  const direction = e.deltaY > 0 ? -1 : 1
  let newScale = viewport.scale * (direction > 0 ? zoomFactor : 1 / zoomFactor)
  newScale = Math.max(0.1, Math.min(newScale, 500))
  viewport.scale = newScale
}

// 生命周期
onMounted(() => {
  if (containerRef.value && canvasRef.value) {
    renderer = new Canvas2DRenderer(canvasRef.value)
    handleResize()
    resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(containerRef.value)
    startRenderLoop()
  }
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
})

function handleResize() {
  if (containerRef.value && renderer) {
    renderer.resize(containerRef.value.clientWidth, containerRef.value.clientHeight)
  }
}
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

canvas {
  flex: 1;
  display: block;
  cursor: crosshair;
}

/* 底部状态栏 */
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

/* 🌟 左上角测量信息面板 */
.measure-panel {
  position: absolute;
  top: 50px; /* 避开 Toolbar */
  left: 10px;
  width: 220px;
  background: rgba(30, 30, 30, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 10px;
  color: #ddd;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  pointer-events: none; /* 让鼠标事件穿透 */
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

.label {
  color: #909399;
}

.panel-hint {
  margin-top: 8px;
  font-size: 11px;
  color: #606266;
  text-align: center;
  font-style: italic;
}
</style>