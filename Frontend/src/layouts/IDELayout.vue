<template>
    <div 
      class="ide-layout" 
      :class="{ 'is-resizing': isAnyResizing }"
      ref="layoutRef"
    >
      <div 
        class="sidebar left-sidebar"
        :class="{ collapsed: !layout.state.sidebars.left.isOpen }"
        :style="{ width: getSidebarWidth('left') }"
      >
        <div class="sidebar-header">
          <span v-if="layout.state.sidebars.left.isOpen" class="sidebar-title">数据列表</span>
          <el-button 
            size="small" 
            link 
            @click="layout.toggleSidebar('left')"
            class="toggle-btn"
            :title="layout.state.sidebars.left.isOpen ? '折叠' : '展开'"
          >
            <el-icon size="16">
              <Fold v-if="layout.state.sidebars.left.isOpen" />
              <Expand v-else />
            </el-icon>
          </el-button>
        </div>
        
        <div v-show="layout.state.sidebars.left.isOpen" class="sidebar-body">
          <TopicList @select="handleTopicSelect" />
        </div>
      </div>
  
      <div 
        v-if="layout.state.sidebars.left.isOpen"
        class="resize-handle left-handle"
        @mousedown.prevent="startSidebarResize('left', $event)"
      ></div>
  
      <div class="workspace-center" @mousedown="handleSplitterMouseDown">
        <Splitpanes 
          class="default-theme" 
          @resized="handleCenterResize"
        >
          <Pane :size="layout.state.groups.data.width" :min-size="10">
            <div class="group-container">
              <PanelGroup groupId="data" :selectedTopic="selectedTopic" />
            </div>
          </Pane>

          <Pane :size="layout.state.groups.vis.width" :min-size="10">
            <div class="group-container">
              <PanelGroup groupId="vis" :selectedTopic="selectedTopic" />
            </div>
          </Pane>
        </Splitpanes>
      </div>
  
      <div 
        v-if="layout.state.sidebars.right.isOpen"
        class="resize-handle right-handle"
        @mousedown.prevent="startSidebarResize('right', $event)"
      ></div>
  
      <div 
        class="sidebar right-sidebar"
        :class="{ collapsed: !layout.state.sidebars.right.isOpen }"
        :style="{ width: getSidebarWidth('right') }"
      >
        <div class="sidebar-header">
          <el-button 
            size="small" 
            link 
            @click="layout.toggleSidebar('right')"
            class="toggle-btn"
            :title="layout.state.sidebars.right.isOpen ? '折叠' : '展开'"
          >
            <el-icon size="16">
              <Expand v-if="layout.state.sidebars.right.isOpen" />
              <Fold v-else />
            </el-icon>
          </el-button>
          <span v-if="layout.state.sidebars.right.isOpen" class="sidebar-title">对象管理</span>
        </div>
        
        <div v-show="layout.state.sidebars.right.isOpen" class="sidebar-body">
          <ObjectManagerPanel />
        </div>
      </div>
  
      <div 
        v-show="isAnyResizing" 
        class="drag-overlay"
      ></div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted, onUnmounted, computed } from 'vue'
  import { useLayoutStore } from '@/stores/layout'
  import { useSelectedTopic } from '@/composables/useSelectedTopic'
  import { Splitpanes, Pane } from 'splitpanes'
  import 'splitpanes/dist/splitpanes.css'
  import { Fold, Expand } from '@element-plus/icons-vue' // ✅ 确保正确引入
  
  // 引入业务组件
  import TopicList from '@/packages/data-panel/components/TopicList.vue'
  import ObjectManagerPanel from '@/packages/data-panel/components/ObjectManagerPanel.vue'
  import PanelGroup from '@/components/layout/PanelGroup.vue'
  
  const layout = useLayoutStore()
  const { selectedTopic, selectTopic } = useSelectedTopic()
  
  // 状态管理
  const isSidebarResizing = ref(false)   // 侧边栏拖拽中
  const isSplitterDragging = ref(false)  // 中间分隔条拖拽中
  
  // 计算属性：是否有任何拖拽正在进行
  const isAnyResizing = computed(() => isSidebarResizing.value || isSplitterDragging.value)
  
  // 侧边栏拖拽临时变量
  let currentResizeSide: 'left' | 'right' | null = null
  let startX = 0
  let startWidth = 0
  
  // ========== 辅助函数 ==========
  
  function getSidebarWidth(side: 'left' | 'right') {
    return layout.state.sidebars[side].isOpen 
      ? `${layout.state.sidebars[side].width}px` 
      : '40px'
  }
  
  function handleTopicSelect(topic: string) {
    selectTopic(topic)
  }
  
  // ========== 1. 侧边栏拖拽逻辑 ==========
  
  function startSidebarResize(side: 'left' | 'right', e: MouseEvent) {
    isSidebarResizing.value = true
    currentResizeSide = side
    startX = e.clientX
    startWidth = layout.state.sidebars[side].width
    
    window.addEventListener('mousemove', onSidebarMouseMove)
    window.addEventListener('mouseup', onGlobalMouseUp)
  }
  
  function onSidebarMouseMove(e: MouseEvent) {
    if (!isSidebarResizing.value || !currentResizeSide) return
    
    const deltaX = e.clientX - startX
    // 左侧：往右拖(+dx)变宽；右侧：往左拖(-dx)变宽
    const newWidth = currentResizeSide === 'left' 
      ? startWidth + deltaX 
      : startWidth - deltaX
      
    layout.updateSidebarWidth(currentResizeSide, newWidth)
  }
  
  // ========== 2. 中间 Splitpanes 拖拽修复逻辑 ==========
  
  // 监听中间区域的 mousedown
  // 如果点击目标是 splitpanes 的分隔条，就标记“正在拖拽”并显示遮罩
  function handleSplitterMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement
    // 检查是否点击了分隔条 (splitpanes__splitter 是 splitpanes 库生成的类名)
    if (target.classList.contains('splitpanes__splitter')) {
      isSplitterDragging.value = true
      window.addEventListener('mouseup', onGlobalMouseUp)
    }
  }
  
  // 接收 splitpanes 的 resize 事件更新数据
  function handleCenterResize(event: any) {
    // console.log('Splitpanes resized event:', event) // 调试用

    let widthArray: number[] = []

    // 情况 1: 标准数组格式 [{ min, max, size }, { ... }]
    if (Array.isArray(event)) {
        widthArray = event.map(item => item.size)
    } 
    // 情况 2: 单个对象 (某些版本的 splitpanes 可能会这样)
    else if (typeof event === 'object' && event !== null) {
        // 尝试提取 size，或者如果是键值对
        if (event.size) {
        // 如果只是单一边界变动，这里很难推断整体，暂忽略
        return 
        }
        // 尝试遍历 values
        widthArray = Object.values(event).map((item: any) => item.size || 0)
    }

    // 只有当解析出两个宽度时才更新
    if (widthArray.length >= 2) {
        layout.updateGroupSizes(widthArray)
    }
  }
  
  // ========== 3. 全局鼠标释放逻辑 (通用) ==========
  
  function onGlobalMouseUp() {
    // 1. 清理侧边栏拖拽
    if (isSidebarResizing.value) {
        isSidebarResizing.value = false
        currentResizeSide = null
        window.removeEventListener('mousemove', onSidebarMouseMove)
    }
    
    // 2. 清理中间分隔条拖拽
    // 只要松开鼠标，无论是不是在 splitter 上，都强制认为拖拽结束
    if (isSplitterDragging.value) {
        isSplitterDragging.value = false
    }
    
    // 3. 移除遮罩
    // (这一步由 isAnyResizing 计算属性自动处理，只要上面两个变为 false，遮罩就会消失)
    
    window.removeEventListener('mouseup', onGlobalMouseUp)
    
    // 🌟 新增：强制移除 body 样式，防止卡在 col-resize 光标
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  
  // ========== 生命周期钩子 ==========
  
  onMounted(() => {
    // 添加一个全局的兜底 mouseup，防止极少数情况下的状态卡死
    window.addEventListener('mouseup', () => {
      if (isAnyResizing.value) onGlobalMouseUp()
    })
  })
  
  onUnmounted(() => {
    window.removeEventListener('mouseup', onGlobalMouseUp)
    window.removeEventListener('mousemove', onSidebarMouseMove)
  })
  </script>
  
  <style scoped>
  .ide-layout {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: #fff;
    position: relative;
  }
  
  /* ========== Sidebar ========== */
  .sidebar {
    background: white;
    display: flex;
    flex-direction: column;
    transition: width 0.15s ease-out; /* 稍微加快一点，让拖拽更跟手 */
    flex-shrink: 0;
    z-index: 20;
    overflow: hidden;
    position: relative;
    box-sizing: border-box;
  }
  
  .left-sidebar { border-right: 1px solid #dcdfe6; }
  .right-sidebar { border-left: 1px solid #dcdfe6; }
  
  /* 折叠状态 */
  .sidebar.collapsed {
    width: 40px !important;
    /* 折叠时隐藏内部内容，只留header按钮 */
  }
  
  .sidebar-header {
    height: 40px;
    min-height: 40px;
    border-bottom: 1px solid #ebeef5;
    display: flex;
    align-items: center;
    padding: 0 8px;
    justify-content: space-between;
    background: #f5f7fa;
    white-space: nowrap;
    overflow: hidden;
  }
  
  .sidebar-title {
    font-weight: 600;
    font-size: 13px;
    color: #606266;
    margin: 0 4px;
  }
  
  .toggle-btn { color: #909399; }
  .toggle-btn:hover { color: #409eff; }
  
  .sidebar-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  
  /* ========== Resize Handle ========== */
  .resize-handle {
    width: 6px; /* 增加感应区域宽度 */
    height: 100%;
    cursor: col-resize;
    background: transparent;
    z-index: 30;
    flex-shrink: 0;
    position: relative;
    transition: background 0.2s;
  }
  
  /* 视觉上的线只有 1px，但点击区域有 6px */
  .resize-handle::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: transparent; 
    transform: translateX(-50%);
    transition: background 0.2s;
  }
  
  .resize-handle:hover::after,
  .resize-handle:active::after {
    background: #409eff; /* 拖拽或悬停时高亮 */
  }
  
  /* 负边距调整，让手柄“骑”在边框上 */
  .left-handle { margin-right: -3px; margin-left: -3px; }
  .right-handle { margin-left: -3px; margin-right: -3px; }
  
  /* ========== Center ========== */
  .workspace-center {
    flex: 1;
    overflow: hidden;
    position: relative;
    background-color: #f0f2f5;
    padding: 4px;
    min-width: 0; 
  }
  
  .group-container {
    width: 100%;
    height: 100%;
    padding: 0 2px;
    /* 🌟 [关键修复] 添加以下三行 */
    overflow: hidden;      /* 强制裁剪溢出内容 */
    display: flex;         /* 使用 Flex 布局 */
    flex-direction: column;
    min-width: 0;          /* 允许 Flex 子项缩小到 0，忽略内容最小宽度 */
  }
  
  /* ========== Drag Overlay ========== */
  /* 关键：全屏透明遮罩
     z-index 必须非常高，确保覆盖所有 Splitpanes, Iframes, Canvas 
  */
  .drag-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    cursor: col-resize; /* 保持光标样式 */
    background: transparent; 
    user-select: none;
  }
  
  /* Splitpanes 自定义 */
  :deep(.splitpanes__splitter) {
    background-color: #e4e7ed;
    width: 8px;
    border: none;
    transition: background-color 0.2s;
  }
  :deep(.splitpanes__splitter:hover) {
    background-color: #409eff;
  }
  </style>