<template>
    <div class="workspace-layout" @mouseup="handleGlobalMouseUp" @mouseleave="handleGlobalMouseUp">
      <!-- 使用 splitpanes 实现可调整宽度的分区 -->
      <Splitpanes
        ref="splitpanesRef"
        class="workspace-splitpanes"
        @resized="handleResize"
        @splitter-click="handleSplitterClick"
      >
        <Pane
          v-for="zone in layout.visibleZones"
          :key="zone.id"
          :size="zone.width"
          :min-size="getMinSize(zone)"
          class="workspace-pane"
        >
          <LayoutZone
            :config="zone"
            :selected-topic="selectedTopic"
            @add-panel="handleAddPanel(zone.id)"
          />
        </Pane>
      </Splitpanes>
  
      <!-- 如果没有可见分区 -->
      <div v-if="layout.visibleZoneCount === 0" class="no-zones">
        <el-empty
          description="请在布局配置中显示至少一个分区"
          :image-size="100"
        >
          <el-button type="primary" @click="layout.switchToPreset('triple')">
            使用默认布局
          </el-button>
        </el-empty>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted, onUnmounted } from 'vue'
  import { Splitpanes, Pane } from 'splitpanes'
  import 'splitpanes/dist/splitpanes.css'
  import { useLayoutStore } from '@/stores/layout'
  import { useSelectedTopic } from '@/composables/useSelectedTopic'
  import LayoutZone from './LayoutZone.vue'
  import type { ZoneConfig } from '@/types/layout'
  import { panelRegistry } from '@/config/panelRegistry'
  
  // 🆕 使用全局选中状态，不再需要props
  const { selectedTopic } = useSelectedTopic()
  
  const layout = useLayoutStore()
  const splitpanesRef = ref<any>(null)
  let dragCheckTimer: number | null = null
  
  /**
   * 启动拖拽状态检查定时器
   */
  function startDragCheck() {
    // 清除旧的定时器
    if (dragCheckTimer) {
      clearInterval(dragCheckTimer)
    }
    
    // 每100ms检查一次，如果检测到拖拽状态但鼠标没有按下，强制清除
    dragCheckTimer = window.setInterval(() => {
      const isDragging = document.body.classList.contains('splitpanes--dragging')
      const hasActiveClass = document.querySelector('.splitpanes__splitter--active')
      
      // 如果有拖拽状态，但鼠标没有按下，强制清除
      if ((isDragging || hasActiveClass)) {
        // 检查鼠标按键状态（通过监听mousemove事件）
        const checkMouseButton = (e: MouseEvent) => {
          if (e.buttons === 0) {
            // 鼠标没有按下任何按键，强制释放
            console.warn('⚠️ Detected stuck drag state, force releasing...')
            handleGlobalMouseUp()
          }
          document.removeEventListener('mousemove', checkMouseButton, true)
        }
        document.addEventListener('mousemove', checkMouseButton, true)
        
        // 500ms后如果还没有移除监听器，手动移除
        setTimeout(() => {
          document.removeEventListener('mousemove', checkMouseButton, true)
        }, 500)
      }
    }, 100)
  }
  
  /**
   * 处理分区大小调整
   */
  function handleResize(event: any) {
    // console.log('📐 Resize event:', event)
    
    // splitpanes 的 @resized 事件返回的是一个包含 {min, max, size} 的对象数组
    // 但有时可能是其他格式，需要兼容处理
    try {
      let widths: number[] = []
      
      if (Array.isArray(event)) {
        // 如果是数组，提取 size 属性
        widths = event.map(e => typeof e === 'object' && e.size !== undefined ? e.size : e)
      } else {
        // 如果不是数组，可能是单个值或者其他格式
        console.warn('⚠️ Unexpected resize event format:', event)
        return
      }
      
    //   console.log('📊 Updated widths:', widths)
      layout.updateAllZoneWidths(widths)
    } catch (error) {
      console.error('❌ Error in handleResize:', error)
    }
  }
  
  /**
   * 处理分隔线点击（防止意外拖动）
   */
  function handleSplitterClick(event: any) {
    // 阻止事件冒泡
    event?.stopPropagation?.()
  }
  
  /**
   * 全局鼠标释放处理（修复拖拽不释放的问题）
   */
  function handleGlobalMouseUp() {
    try {
      // 强制停止所有拖拽行为
      const splitters = document.querySelectorAll('.splitpanes__splitter')
      splitters.forEach(splitter => {
        splitter.classList.remove('splitpanes__splitter--active')
      })
      
      // 移除body上的拖拽相关类
      document.body.classList.remove('splitpanes--dragging')
      
      // 移除splitpanes容器上的拖拽类
      const splitpanesContainers = document.querySelectorAll('.splitpanes')
      splitpanesContainers.forEach(container => {
        container.classList.remove('splitpanes--dragging')
      })
      
      // 清除所有选择（防止文本被选中）
      if (window.getSelection) {
        const selection = window.getSelection()
        if (selection && selection.removeAllRanges) {
          selection.removeAllRanges()
        }
      }
      
      // 强制重置光标
      document.body.style.cursor = ''
      
    //   console.log('🖱️ Mouse released, drag state cleared')
    } catch (error) {
      console.error('❌ Error in handleGlobalMouseUp:', error)
    }
  }
  
  /**
   * 监听全局鼠标事件
   */
  onMounted(() => {
    // 添加全局mouseup监听
    document.addEventListener('mouseup', handleGlobalMouseUp, true)
    document.addEventListener('mousemove', handleMouseMove, true)
    
    // 添加鼠标离开窗口的监听
    window.addEventListener('blur', handleGlobalMouseUp)
    
    // 启动拖拽状态检查定时器
    startDragCheck()
  })
  
  onUnmounted(() => {
    document.removeEventListener('mouseup', handleGlobalMouseUp, true)
    document.removeEventListener('mousemove', handleMouseMove, true)
    window.removeEventListener('blur', handleGlobalMouseUp)
    
    // 清除定时器
    if (dragCheckTimer) {
      clearInterval(dragCheckTimer)
      dragCheckTimer = null
    }
  })
  
  /**
   * 处理鼠标移动（防止拖拽到窗口外）
   */
  function handleMouseMove(e: MouseEvent) {
    // 如果鼠标已经离开窗口边界，强制释放
    if (e.clientX <= 0 || e.clientX >= window.innerWidth ||
        e.clientY <= 0 || e.clientY >= window.innerHeight) {
      handleGlobalMouseUp()
    }
  }
  
  /**
   * 获取分区最小尺寸（根据面板的minWidth计算）
   */
  function getMinSize(zone: ZoneConfig): number {
    if (zone.panels.length === 0) return 10
    
    // 查找该分区所有面板中最大的minWidth
    let maxMinWidth = 300 // 默认最小宽度
    
    zone.panels.forEach(panelId => {
      const panel = panelRegistry.get(panelId)
      if (panel?.minWidth && panel.minWidth > maxMinWidth) {
        maxMinWidth = panel.minWidth
      }
    })
    
    // 转换为百分比（假设总宽度为1920px）
    const percentage = (maxMinWidth / 1920) * 100
    return Math.max(10, Math.min(30, percentage))
  }
  
  /**
   * 处理添加面板
   */
  function handleAddPanel(zoneId: number) {
    // console.log('Add panel to zone:', zoneId)
    // 这里可以打开一个对话框让用户选择要添加的面板
    // 或者直接调用 layout store 的方法
  }
  </script>
  
  <style scoped>
  .workspace-layout {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    user-select: none; /* 防止拖拽时选中文本 */
  }
  
  .workspace-splitpanes {
    flex: 1;
    overflow: hidden;
  }
  
  .workspace-pane {
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  
  .no-zones {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fafafa;
  }
  
  /* 自定义 splitpanes 样式 */
  :deep(.splitpanes__splitter) {
    background-color: #e4e7ed;
    position: relative;
    transition: background-color 0.3s;
    z-index: 10;
  }
  
  :deep(.splitpanes__splitter:hover) {
    background-color: #409eff;
  }
  
  /* 拖拽激活状态 */
  :deep(.splitpanes__splitter--active) {
    background-color: #409eff !important;
    cursor: col-resize !important;
  }
  
  :deep(.splitpanes__splitter::before) {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 30px;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 1px;
    pointer-events: none; /* 不阻挡鼠标事件 */
  }
  
  :deep(.splitpanes__splitter:hover::before) {
    background-color: rgba(255, 255, 255, 0.8);
  }
  
  /* 垂直分隔线 */
  :deep(.splitpanes--vertical > .splitpanes__splitter) {
    width: 6px;
    cursor: col-resize;
    /* 扩大点击区域 */
    min-width: 6px;
  }
  
  /* 拖拽时的视觉反馈 */
  :deep(.splitpanes--vertical > .splitpanes__splitter--active) {
    width: 6px;
    background-color: #409eff;
    box-shadow: 0 0 10px rgba(64, 158, 255, 0.3);
  }
  
  /* 水平分隔线（如果需要） */
  :deep(.splitpanes--horizontal > .splitpanes__splitter) {
    height: 6px;
    cursor: row-resize;
    min-height: 6px;
  }
  
  :deep(.splitpanes--horizontal > .splitpanes__splitter::before) {
    width: 30px;
    height: 2px;
  }
  
  :deep(.splitpanes--horizontal > .splitpanes__splitter--active) {
    height: 6px;
    background-color: #409eff;
    box-shadow: 0 0 10px rgba(64, 158, 255, 0.3);
  }
  
  /* 拖拽时禁用pane内容的pointer事件 */
  :deep(.splitpanes--dragging) .workspace-pane {
    pointer-events: none;
  }
  
  /* 拖拽时改变光标 */
  :global(body.splitpanes--dragging) {
    cursor: col-resize !important;
    user-select: none !important;
  }
  
  /* 强制光标样式 */
  :global(body.splitpanes--dragging *) {
    cursor: col-resize !important;
    user-select: none !important;
  }
  </style>