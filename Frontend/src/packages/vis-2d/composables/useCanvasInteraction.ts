// src/packages/vis-2d/composables/useCanvasInteraction.ts
import { reactive, ref } from 'vue'
import type { Canvas2DRenderer, Viewport, Point2D } from '../core/Canvas2DRenderer'

export function useCanvasInteraction(
  rendererRef: { value: Canvas2DRenderer | null }, 
  canvasRef: { value: HTMLCanvasElement | null }
) {
  // 视图状态
  const viewport = reactive<Viewport>({
    x: 0, y: 0, scale: 20, rotation: 0, flipY: false
  })

  // 工具状态
  const currentTool = ref<'pan' | 'measure'>('pan')
  const mouseWorldPos = reactive<Point2D>({ x: 0, y: 0 })

  // 测量状态
  const measureState = reactive({
    step: 0,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    distance: 0
  })

  // 内部拖拽状态
  const panState = { isDragging: false, lastX: 0, lastY: 0 }

  // 辅助：计算距离
  const calcDist = (p1: Point2D, p2: Point2D) => {
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    return Math.sqrt(dx*dx + dy*dy)
  }

  // --- Event Handlers ---

  const handleMouseDown = (e: MouseEvent) => {
    if (!rendererRef.value || !canvasRef.value) return
    
    if (currentTool.value === 'pan') {
      panState.isDragging = true
      panState.lastX = e.clientX
      panState.lastY = e.clientY
    } else if (currentTool.value === 'measure') {
      const rect = canvasRef.value.getBoundingClientRect()
      const worldPos = rendererRef.value.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, viewport)
      
      if (measureState.step !== 1) {
        measureState.start = worldPos
        measureState.end = worldPos
        measureState.distance = 0
        measureState.step = 1
      } else {
        measureState.end = worldPos
        measureState.distance = calcDist(measureState.start, measureState.end)
        measureState.step = 2
      }
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!rendererRef.value || !canvasRef.value) return
    const rect = canvasRef.value.getBoundingClientRect()
    const worldPos = rendererRef.value.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, viewport)
    
    mouseWorldPos.x = worldPos.x
    mouseWorldPos.y = worldPos.y

    if (currentTool.value === 'pan' && panState.isDragging) {
      const deltaX = e.clientX - panState.lastX
      const deltaY = e.clientY - panState.lastY
      
      // 逆向计算视图移动
      const s = viewport.scale
      const r = viewport.rotation
      const flipFactor = viewport.flipY ? 1 : -1
      const cos = Math.cos(-r), sin = Math.sin(-r)
      
      const dxWorld = (deltaX * cos - deltaY * sin) / s
      const dyWorld = (deltaX * sin + deltaY * cos) / (s * flipFactor)
      
      viewport.x -= dxWorld
      viewport.y -= dyWorld
      panState.lastX = e.clientX
      panState.lastY = e.clientY
    }

    if (currentTool.value === 'measure' && measureState.step === 1) {
      measureState.end = worldPos
      measureState.distance = calcDist(measureState.start, measureState.end)
    }
  }

  const handleMouseUp = () => {
    panState.isDragging = false
  }

  const handleWheel = (e: WheelEvent) => {
    const zoomFactor = 1.1
    const direction = e.deltaY > 0 ? -1 : 1
    let newScale = viewport.scale * (direction > 0 ? zoomFactor : 1 / zoomFactor)
    newScale = Math.max(0.1, Math.min(newScale, 500))
    viewport.scale = newScale
  }

  const resetView = () => {
    viewport.x = 0; viewport.y = 0; viewport.scale = 20;
  }

  return {
    viewport,
    currentTool,
    mouseWorldPos,
    measureState,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    resetView
  }
}