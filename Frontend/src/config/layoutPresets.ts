// config/layoutPresets.ts - 预设布局配置

import type { LayoutPresets } from '@/types/layout'

/**
 * 预设布局配置集合
 */
export const layoutPresets: LayoutPresets = {
  // 三栏标准布局
  triple: {
    name: '三栏标准',
    description: 'Topic列表 + 数据详情 + 可视化',
    zones: [
      { 
        id: 1, 
        width: 25, 
        visible: true, 
        activePanelId: 'topicList', 
        panels: ['topicList'] 
      },
      { 
        id: 2, 
        width: 40, 
        visible: true, 
        activePanelId: 'data', 
        panels: ['data', 'info', 'timeline'] 
      },
      { 
        id: 3, 
        width: 35, 
        visible: true, 
        activePanelId: '2d', 
        panels: ['2d', '3d', 'images', 'settings'] 
      }
    ]
  },

  // 左右双栏布局
  leftRight: {
    name: '左右分栏',
    description: '数据 + 可视化',
    zones: [
      { 
        id: 1, 
        width: 0, 
        visible: false, 
        activePanelId: '', 
        panels: [] 
      },
      { 
        id: 2, 
        width: 50, 
        visible: true, 
        activePanelId: 'data', 
        panels: ['topicList', 'data', 'info', 'timeline'] 
      },
      { 
        id: 3, 
        width: 50, 
        visible: true, 
        activePanelId: '2d', 
        panels: ['2d', '3d', 'images', 'settings'] 
      }
    ]
  },

  // 单栏全屏布局
  single: {
    name: '单栏全屏',
    description: '单一面板全屏显示',
    zones: [
      { 
        id: 1, 
        width: 0, 
        visible: false, 
        activePanelId: '', 
        panels: [] 
      },
      { 
        id: 2, 
        width: 100, 
        visible: true, 
        activePanelId: 'data', 
        panels: ['topicList', 'data', 'info', '2d', '3d', 'images', 'timeline', 'settings'] 
      },
      { 
        id: 3, 
        width: 0, 
        visible: false, 
        activePanelId: '', 
        panels: [] 
      }
    ]
  },

  // 数据分析布局
  dataAnalysis: {
    name: '数据分析',
    description: '数据详情 + 时间曲线 + 图像',
    zones: [
      { 
        id: 1, 
        width: 30, 
        visible: true, 
        activePanelId: 'data', 
        panels: ['data', 'info', 'topicList'] 
      },
      { 
        id: 2, 
        width: 40, 
        visible: true, 
        activePanelId: 'timeline', 
        panels: ['timeline'] 
      },
      { 
        id: 3, 
        width: 30, 
        visible: true, 
        activePanelId: 'images', 
        panels: ['images', '2d', 'settings'] 
      }
    ]
  },

  // 3D视图布局
  view3D: {
    name: '3D视图',
    description: 'Topic + 3D大屏 + 数据',
    zones: [
      { 
        id: 1, 
        width: 20, 
        visible: true, 
        activePanelId: 'topicList', 
        panels: ['topicList'] 
      },
      { 
        id: 2, 
        width: 60, 
        visible: true, 
        activePanelId: '3d', 
        panels: ['3d', '2d', 'settings'] 
      },
      { 
        id: 3, 
        width: 20, 
        visible: true, 
        activePanelId: 'data', 
        panels: ['data', 'info', 'timeline'] 
      }
    ]
  },

  // 图像对比布局
  imageCompare: {
    name: '图像对比',
    description: 'Topic + 多图像视图',
    zones: [
      { 
        id: 1, 
        width: 25, 
        visible: true, 
        activePanelId: 'topicList', 
        panels: ['topicList'] 
      },
      { 
        id: 2, 
        width: 37.5, 
        visible: true, 
        activePanelId: 'images', 
        panels: ['images', '2d', 'settings'] 
      },
      { 
        id: 3, 
        width: 37.5, 
        visible: true, 
        activePanelId: 'data', 
        panels: ['data', 'info', 'timeline'] 
      }
    ]
  }
}

/**
 * 默认布局
 */
export const defaultLayout = layoutPresets.triple