// stores/layout.ts - 布局管理 Store

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LayoutConfig, ZoneConfig } from '@/types/layout'
import { layoutPresets, defaultLayout } from '@/config/layoutPresets'
import { ElMessage } from 'element-plus'

const LAYOUT_STORAGE_KEY = 'playback_layout_config'
const LAYOUT_VERSION = 2 // 版本2：添加了info和settings面板

export const useLayoutStore = defineStore('layout', () => {
  // ========== 状态 ==========
  
  const currentLayout = ref<LayoutConfig>(loadLayoutFromStorage() || defaultLayout)
  const currentPresetName = ref<string>('triple')
  
  // ========== 计算属性 ==========
  
  const zones = computed(() => currentLayout.value.zones)
  
  const visibleZones = computed(() => 
    zones.value.filter(zone => zone.visible)
  )
  
  const visibleZoneCount = computed(() => visibleZones.value.length)
  
  // ========== 方法 ==========
  
  /**
   * 切换到预设布局
   */
  function switchToPreset(presetName: string) {
    const preset = layoutPresets[presetName]
    if (!preset) {
      console.error(`Layout preset "${presetName}" not found`)
      return false
    }
    
    currentLayout.value = JSON.parse(JSON.stringify(preset))
    currentPresetName.value = presetName
    saveLayoutToStorage()
    
    ElMessage.success(`已切换到 ${preset.name} 布局`)
    console.log('📐 Switched to layout:', presetName)
    return true
  }
  
  /**
   * 更新分区宽度
   */
  function updateZoneWidth(zoneId: number, width: number) {
    const zone = zones.value.find(z => z.id === zoneId)
    if (zone) {
      zone.width = Math.max(0, Math.min(100, width))
      saveLayoutToStorage()
      console.log(`📏 Zone ${zoneId} width updated to ${width}%`)
    }
  }
  
  /**
   * 更新所有分区宽度（用于splitpanes的resize事件）
   */
  function updateAllZoneWidths(widths: number[]) {
    const visibleZoneIds = visibleZones.value.map(z => z.id)
    
    widths.forEach((width, index) => {
      if (index < visibleZoneIds.length) {
        const zoneId = visibleZoneIds[index]
        updateZoneWidth(zoneId, width)
      }
    })
  }
  
  /**
   * 切换分区可见性
   */
  function toggleZoneVisibility(zoneId: number) {
    const zone = zones.value.find(z => z.id === zoneId)
    if (zone) {
      zone.visible = !zone.visible
      
      // 如果隐藏了分区，需要重新分配宽度
      if (!zone.visible) {
        redistributeWidths()
      }
      
      saveLayoutToStorage()
      console.log(`👁️ Zone ${zoneId} visibility: ${zone.visible}`)
    }
  }
  
  /**
   * 重新分配可见分区的宽度（平均分配）
   */
  function redistributeWidths() {
    const visible = visibleZones.value
    if (visible.length === 0) return
    
    const averageWidth = 100 / visible.length
    visible.forEach(zone => {
      zone.width = averageWidth
    })
  }
  
  /**
   * 切换分区的激活面板
   */
  function switchActivePanel(zoneId: number, panelId: string) {
    const zone = zones.value.find(z => z.id === zoneId)
    if (zone && zone.panels.includes(panelId)) {
      zone.activePanelId = panelId
      saveLayoutToStorage()
      console.log(`🔄 Zone ${zoneId} active panel: ${panelId}`)
    }
  }
  
  /**
   * 添加面板到分区
   */
  function addPanelToZone(zoneId: number, panelId: string) {
    const zone = zones.value.find(z => z.id === zoneId)
    if (!zone) return false
    
    // 检查面板是否已存在
    if (zone.panels.includes(panelId)) {
      ElMessage.warning('该面板已存在于此区域')
      return false
    }
    
    // 添加面板
    zone.panels.push(panelId)
    
    // 如果是第一个面板，设为激活
    if (zone.panels.length === 1) {
      zone.activePanelId = panelId
    }
    
    saveLayoutToStorage()
    ElMessage.success('面板已添加')
    console.log(`➕ Added panel ${panelId} to zone ${zoneId}`)
    return true
  }
  
  /**
   * 从分区移除面板
   */
  function removePanelFromZone(zoneId: number, panelId: string) {
    const zone = zones.value.find(z => z.id === zoneId)
    if (!zone) return false
    
    const index = zone.panels.indexOf(panelId)
    if (index === -1) return false
    
    // 移除面板
    zone.panels.splice(index, 1)
    
    // 如果移除的是当前激活面板，切换到第一个面板
    if (zone.activePanelId === panelId && zone.panels.length > 0) {
      zone.activePanelId = zone.panels[0]
    } else if (zone.panels.length === 0) {
      zone.activePanelId = ''
    }
    
    saveLayoutToStorage()
    ElMessage.success('面板已移除')
    console.log(`➖ Removed panel ${panelId} from zone ${zoneId}`)
    return true
  }
  
  /**
   * 移动面板到另一个分区
   */
  function movePanelToZone(
    fromZoneId: number, 
    toZoneId: number, 
    panelId: string
  ) {
    if (fromZoneId === toZoneId) return false
    
    // 从源分区移除
    const removed = removePanelFromZone(fromZoneId, panelId)
    if (!removed) return false
    
    // 添加到目标分区
    return addPanelToZone(toZoneId, panelId)
  }
  
  /**
   * 重置为默认布局
   */
  function resetLayout() {
    currentLayout.value = JSON.parse(JSON.stringify(defaultLayout))
    currentPresetName.value = 'triple'
    saveLayoutToStorage()
    ElMessage.success('已重置为默认布局')
    console.log('🔄 Layout reset to default')
  }
  
  /**
   * 保存当前布局到 localStorage
   */
  function saveLayoutToStorage() {
    try {
      const data = {
        version: LAYOUT_VERSION,
        layout: currentLayout.value,
        presetName: currentPresetName.value,
        timestamp: Date.now()
      }
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(data))
      console.log('💾 Layout saved to storage (version', LAYOUT_VERSION, ')')
    } catch (error) {
      console.error('Failed to save layout:', error)
    }
  }
  
  /**
   * 从 localStorage 加载布局
   */
  function loadLayoutFromStorage(): LayoutConfig | null {
    try {
      const stored = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (!stored) return null
      
      const data = JSON.parse(stored)
      
      // 检查版本号
      if (!data.version || data.version < LAYOUT_VERSION) {
        console.warn(`⚠️ 检测到旧版本布局 (v${data.version || 1})，将使用默认布局 (v${LAYOUT_VERSION})`)
        // 清除旧的存储
        localStorage.removeItem(LAYOUT_STORAGE_KEY)
        return null
      }
      
      const layout = data.layout as LayoutConfig
      
      console.log(`📂 Layout loaded from storage (v${data.version})`)
      return layout
    } catch (error) {
      console.error('Failed to load layout:', error)
      return null
    }
  }
  
  /**
   * 导出布局配置
   */
  function exportLayout(): string {
    return JSON.stringify(currentLayout.value, null, 2)
  }
  
  /**
   * 导入布局配置
   */
  function importLayout(jsonString: string): boolean {
    try {
      const layout = JSON.parse(jsonString) as LayoutConfig
      
      // 简单验证
      if (!layout.zones || layout.zones.length !== 3) {
        throw new Error('Invalid layout format')
      }
      
      currentLayout.value = layout
      currentPresetName.value = 'custom'
      saveLayoutToStorage()
      
      ElMessage.success('布局已导入')
      console.log('📥 Layout imported')
      return true
    } catch (error) {
      console.error('Failed to import layout:', error)
      ElMessage.error('导入失败: 无效的布局配置')
      return false
    }
  }
  
  return {
    // 状态
    currentLayout,
    currentPresetName,
    zones,
    visibleZones,
    visibleZoneCount,
    
    // 方法
    switchToPreset,
    updateZoneWidth,
    updateAllZoneWidths,
    toggleZoneVisibility,
    switchActivePanel,
    addPanelToZone,
    removePanelFromZone,
    movePanelToZone,
    resetLayout,
    saveLayoutToStorage,
    exportLayout,
    importLayout
  }
})