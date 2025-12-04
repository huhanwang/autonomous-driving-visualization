// src/config/panelRegistry.ts

import type { PanelDefinition } from '@/types/layout'
import {
  List,
  Document,
  Grid,
  Box,
  Picture,
  TrendCharts,
  InfoFilled,
  Setting,
  FolderOpened // 🌟 [新增] 引入文件夹图标
} from '@element-plus/icons-vue'

// 业务组件
import TopicList from '@/packages/data-panel/components/TopicList.vue'
import TopicDetailPanel from '@/packages/data-panel/components/TopicDetailPanel.vue'

import Visualization2D from '@/packages/vis-2d/index.vue'
import Visualization3D from '@/packages/vis-3d/index.vue'
import ImageGallery from '@/packages/image-gallery/index.vue'
import TimelineChart from '@/packages/timeline/index.vue'

// 🌟 [新增] 引入对象管理器组件
// (请确保你已在上一步创建了此文件，路径需匹配)
import ObjectManagerPanel from '@/packages/data-panel/components/ObjectManagerPanel.vue'

// 通用组件
import InfoPanel from '@/components/InfoPanel.vue'
// import DisplaySettings from '@/components/DisplaySettings.vue' // ❌ [移除] 原有的设置面板

export const panelDefinitions: PanelDefinition[] = [
  {
    id: 'topicList',
    name: 'Topic列表',
    icon: List,
    component: TopicList,
    minWidth: 300,
    allowedZones: [1],
    description: '显示所有可用的数据主题'
  },
  {
    id: 'data',
    name: '数据结构',
    icon: Document,
    component: TopicDetailPanel,
    minWidth: 400,
    allowedZones: [1, 2],
    description: '显示选中Topic的数据结构'
  },
  {
    id: '2d',
    name: '2D可视化',
    icon: Grid,
    component: Visualization2D,
    minWidth: 600,
    allowedZones: [2, 3],
    description: '2D平面可视化显示'
  },
  {
    id: '3d',
    name: '3D可视化',
    icon: Box,
    component: Visualization3D,
    minWidth: 600,
    allowedZones: [2, 3],
    description: '3D立体可视化显示'
  },
  {
    id: 'images',
    name: '图像列表',
    icon: Picture,
    component: ImageGallery,
    minWidth: 400,
    allowedZones: [2, 3],
    description: '显示图像数据'
  },
  {
    id: 'timeline',
    name: '时间曲线',
    icon: TrendCharts,
    component: TimelineChart,
    minWidth: 500,
    allowedZones: [2, 3],
    description: '显示数据随时间变化的曲线'
  },
  {
    id: 'info',
    name: '信息面板',
    icon: InfoFilled,
    component: InfoPanel,
    minWidth: 300,
    allowedZones: [1, 2, 3],
    description: '显示系统信息和统计数据'
  },
  // 🌟 [修改] 将原来的 settings 替换为 对象管理器
  {
    id: 'settings',       // 保持 ID 不变，这样现有的布局配置(layoutPresets)依然有效
    name: '对象管理',     // 修改显示名称
    icon: FolderOpened,   // 修改图标 (如果不喜欢，可以换回 Setting)
    component: ObjectManagerPanel, // 🌟 核心：替换为对象管理器组件
    minWidth: 300,
    allowedZones: [1, 2, 3], // 扩展允许的区域，方便在左侧或右侧显示
    description: '图层与对象属性管理'
  }
]

export const panelRegistry = new Map<string, PanelDefinition>(
  panelDefinitions.map(panel => [panel.id, panel])
)

export function getPanelsForZone(zoneId: number): PanelDefinition[] {
  return panelDefinitions.filter(
    panel => !panel.allowedZones || panel.allowedZones.includes(zoneId)
  )
}