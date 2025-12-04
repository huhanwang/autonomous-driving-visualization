// src/types/layout-config.ts

export interface PanelState {
    id: string
    visible: boolean
    isFloating: boolean
    isMaximized: boolean
  }
  
  export interface GroupConfig {
    id: 'data' | 'vis'
    width: number
    splitMode: 'tabs' | 'grid'
    activePanelId: string
    panels: string[]
  }
  
  export interface SidebarConfig {
    isOpen: boolean
    width: number
  }
  
  // 🆕 新增：2D 可视化配置
  export interface Vis2DSettings {
    coordinateMode: 'standard' | 'auto' | 'custom'
    showGrid: boolean
    showAxis: boolean
  }
  
  // 🌟 完整的布局配置对象
  export interface IDELayoutConfig {
    version: number
    updatedAt: number
    
    sidebars: {
      left: SidebarConfig
      right: SidebarConfig
    }
    
    groups: {
      data: GroupConfig
      vis: GroupConfig
    }
    
    panelStates: Record<string, PanelState>
    
    // 🆕 新增：2D 专属配置
    vis2d: Vis2DSettings
  }