<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="floating-window"
      :class="{ 'is-maximized': maximized }"
      :style="windowStyle"
      @mousedown="startDrag"
    >
      <div class="window-header" @dblclick="toggleMaximize">
        <span class="window-title">{{ title }}</span>
        <div class="window-controls">
          <el-button size="small" link @click="toggleMaximize" title="最大化/还原">
            <el-icon>
              <component :is="maximized ? CopyDocument : FullScreen" />
            </el-icon>
          </el-button>
          
          <el-button size="small" link @click="$emit('close')" title="关闭">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
      
      <div class="window-content" @mousedown.stop>
        <slot></slot>
      </div>
      
      <div v-if="!maximized" class="resize-handle" @mousedown.stop="startResize"></div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
// 引入图标组件对象
import { Close, FullScreen, CopyDocument } from '@element-plus/icons-vue'

const props = defineProps<{
  title: string
  visible: boolean
  maximized?: boolean // ✅ 修复：接收 maximized 属性
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:maximized', val: boolean): void
}>()

// 内部位置状态
const x = ref(100)
const y = ref(100)
const w = ref(600)
const h = ref(450)

// 样式计算
const windowStyle = computed(() => {
  if (props.maximized) {
    return {
      top: '0px',
      left: '0px',
      width: '100vw',
      height: '100vh',
      borderRadius: '0',
      border: 'none',
      zIndex: 2001 
    }
  }
  return {
    top: `${y.value}px`,
    left: `${x.value}px`,
    width: `${w.value}px`,
    height: `${h.value}px`
  }
})

// 切换最大化
function toggleMaximize() {
  emit('update:maximized', !props.maximized)
}

// ========== 拖拽逻辑 (无迟滞) ==========
function startDrag(e: MouseEvent) {
  if (props.maximized) return

  const startX = e.clientX
  const startY = e.clientY
  const initX = x.value
  const initY = y.value
  
  const move = (e: MouseEvent) => {
    x.value = initX + (e.clientX - startX)
    y.value = initY + (e.clientY - startY)
  }
  const up = () => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

// ========== 调整大小逻辑 ==========
function startResize(e: MouseEvent) {
  if (props.maximized) return

  const startX = e.clientX
  const startY = e.clientY
  const initW = w.value
  const initH = h.value
  
  const move = (e: MouseEvent) => {
    w.value = Math.max(200, initW + (e.clientX - startX))
    h.value = Math.max(150, initH + (e.clientY - startY))
  }
  const up = () => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}
</script>

<style scoped>
.floating-window {
  position: fixed;
  z-index: 2000;
  background: white;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* ⚠️ 这里的 transition 必须移除，否则拖拽会卡顿 */
}

.floating-window.is-maximized {
  box-shadow: none;
}

.window-header {
  height: 36px;
  padding: 0 12px;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
  user-select: none;
}

.window-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.window-controls {
  display: flex;
  gap: 4px;
}

.window-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: #fff;
}

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 15px;
  height: 15px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, #dcdfe6 50%);
  opacity: 0.5;
}
.resize-handle:hover {
  opacity: 1;
}
</style>