// src/stores/layout.ts

import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import type { IDELayoutConfig } from '@/types/layout-config'
import { ElMessage } from 'element-plus'

const STORAGE_KEY = 'ide_layout_config_v1'
const CURRENT_VERSION = 1

const DEFAULT_LAYOUT: IDELayoutConfig = {
  version: CURRENT_VERSION,
  updatedAt: Date.now(),
  sidebars: {
    left: { isOpen: true, width: 300 },
    right: { isOpen: true, width: 300 }
  },
  groups: {
    data: {
      id: 'data',
      width: 40,
      splitMode: 'tabs',
      activePanelId: 'data',
      panels: ['data', 'info', 'timeline']
    },
    vis: {
      id: 'vis',
      width: 60,
      splitMode: 'tabs',
      activePanelId: '2d',
      panels: ['2d', '3d', 'images']
    }
  },
  panelStates: {
    'topicList': { id: 'topicList', visible: true, isFloating: false, isMaximized: false },
    'objectManager': { id: 'objectManager', visible: true, isFloating: false, isMaximized: false },
    'data': { id: 'data', visible: true, isFloating: false, isMaximized: false },
    'info': { id: 'info', visible: true, isFloating: false, isMaximized: false },
    'timeline': { id: 'timeline', visible: true, isFloating: false, isMaximized: false },
    '2d': { id: '2d', visible: true, isFloating: false, isMaximized: false },
    '3d': { id: '3d', visible: true, isFloating: false, isMaximized: false },
    'images': { id: 'images', visible: true, isFloating: false, isMaximized: false }
  },
  // 🆕 初始化 Vis2D 配置
  vis2d: {
    coordinateMode: 'standard', // 默认标准系
    showGrid: true,
    showAxis: true
  }
}

export const useLayoutStore = defineStore('layout', () => {
  // ========== 1. 状态初始化 ==========
  
  // 尝试从 LocalStorage 加载，失败则使用默认配置的深拷贝
  const state = reactive<IDELayoutConfig>(loadFromStorage() || JSON.parse(JSON.stringify(DEFAULT_LAYOUT)))

  // ========== 2. 持久化逻辑 ==========

  function loadFromStorage(): IDELayoutConfig | null {
    try {
      const json = localStorage.getItem(STORAGE_KEY)
      if (json) {
        const parsed = JSON.parse(json)
        // 简单版本检查，如果版本不对则丢弃旧配置
        if (parsed.version === CURRENT_VERSION) {
          return parsed
        }
        console.warn('[Layout] Version mismatch, resetting to default.')
      }
    } catch (e) {
      console.error('[Layout] Failed to load config:', e)
    }
    return null
  }

  // 简易防抖保存 (1秒内只保存一次)
  let saveTimer: number | null = null
  
  function saveToStorage() {
    if (saveTimer) clearTimeout(saveTimer)
    
    saveTimer = window.setTimeout(() => {
      // 🛑 错误写法 (会导致死循环):
      // state.updatedAt = Date.now() 
      // localStorage.setItem(STORAGE_KEY, JSON.stringify(state))

      // ✅ 正确写法:
      // 1. 深拷贝当前状态 (断开与响应式 state 的关联)
      const dataToSave = JSON.parse(JSON.stringify(state))
      
      // 2. 修改副本的时间戳
      dataToSave.updatedAt = Date.now()
      
      // 3. 保存副本
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
      
      console.log('💾 Layout auto-saved')
      saveTimer = null
    }, 1000)
  }

  // 3. 监听状态变化，自动触发保存
  watch(state, () => {
    saveToStorage()
  }, { deep: true })

  // ========== 3. Actions (操作方法) ==========

  /**
   * 重置布局为默认状态
   */
  function resetLayout() {
    Object.assign(state, JSON.parse(JSON.stringify(DEFAULT_LAYOUT)))
    // 强制立即保存
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    ElMessage.success('布局已恢复默认')
  }

  /**
   * 切换侧边栏折叠/展开
   */
  function toggleSidebar(side: 'left' | 'right') {
    state.sidebars[side].isOpen = !state.sidebars[side].isOpen
  }

  /**
   * 设置分组当前激活的面板 (Tab切换)
   */
  function setGroupActivePanel(groupId: 'data' | 'vis', panelId: string) {
    if (state.groups[groupId].panels.includes(panelId)) {
      state.groups[groupId].activePanelId = panelId
    }
  }

  /**
   * 切换分组显示模式 (Tabs vs Grid)
   */
  function setGroupSplitMode(groupId: 'data' | 'vis', mode: 'tabs' | 'grid') {
    state.groups[groupId].splitMode = mode
  }

  /**
   * 更新分组宽度 (Splitpanes回调)
   */
  function updateGroupSizes(sizes: number[]) {
    // splitpanes 返回的是数组 [size1, size2, ...]
    if (sizes.length >= 2) {
      state.groups.data.width = sizes[0]
      state.groups.vis.width = sizes[1]
    }
  }

  /**
   * 切换面板最大化状态 (互斥)
   */
  function togglePanelMaximize(panelId: string) {
    const pState = state.panelStates[panelId]
    if (pState) {
      // 如果当前不是最大化，则先把其他所有面板的最大化取消
      if (!pState.isMaximized) {
        Object.values(state.panelStates).forEach(s => s.isMaximized = false)
      }
      pState.isMaximized = !pState.isMaximized
      
      // 如果最大化了，取消浮动状态
      if (pState.isMaximized) {
        pState.isFloating = false
      }
    }
  }

  // ========== 4. 导入/导出功能 ==========

  function exportConfigToFile() {
    const dataStr = JSON.stringify(state, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ide-layout-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    ElMessage.success('配置已导出')
  }

  function importConfigFromFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string
        const config = JSON.parse(json)
        
        // 简单的结构校验
        if (config.version && config.groups && config.panelStates) {
          Object.assign(state, config)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) // 立即保存
          ElMessage.success('布局配置已导入')
        } else {
          throw new Error('Invalid format')
        }
      } catch (err) {
        console.error(err)
        ElMessage.error('导入失败：文件格式不正确')
      }
    }
    reader.readAsText(file)
  }

  /**
   * 更新侧边栏宽度
   */
  function updateSidebarWidth(side: 'left' | 'right', width: number) {
    // 限制最小/最大宽度
    const newWidth = Math.max(150, Math.min(800, width))
    state.sidebars[side].width = newWidth
  }

  /**
   * 🆕 设置面板的最大化状态 (用于浮动窗口)
   */
  function setPanelMaximized(panelId: string, isMaximized: boolean) {
    if (state.panelStates[panelId]) {
      state.panelStates[panelId].isMaximized = isMaximized
    }
  }

  /**
   * 切换面板浮动状态
   */
  function togglePanelFloating(panelId: string) {
    const pState = state.panelStates[panelId]
    if (pState) {
      pState.isFloating = !pState.isFloating
      
      // 如果切回组内（不再浮动），强制取消最大化，否则界面会乱
      if (!pState.isFloating) {
        pState.isMaximized = false
      }
    }
  }

  return {
    state,
    resetLayout,
    toggleSidebar,
    setGroupActivePanel,
    setGroupSplitMode,
    updateGroupSizes,
    setPanelMaximized,
    togglePanelFloating,
    togglePanelMaximize,
    exportConfigToFile,
    importConfigFromFile,
    updateSidebarWidth
  }
})