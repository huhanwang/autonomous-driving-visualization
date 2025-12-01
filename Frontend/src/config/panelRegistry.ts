// Frontend/src/config/panelRegistry.ts

import type { PanelDefinition } from '@/types/layout'
import {
  List,
  Document,
  Grid,
  Box,
  Picture,
  TrendCharts,
  InfoFilled,
  Setting
} from '@element-plus/icons-vue'

// 🌟 [关键修正] 更新引用路径到新的 packages 目录
// 注意：如果你的组件改名为 index.vue，这里要写清楚
import TopicList from '@/packages/data-panel/components/TopicList.vue'
import TopicDetailPanel from '@/packages/data-panel/components/TopicDetailPanel.vue'

import Visualization2D from '@/packages/vis-2d/index.vue' // 原 Visualization2D.vue
import Visualization3D from '@/packages/vis-3d/index.vue' // 原 Visualization3D.vue
import ImageGallery from '@/packages/image-gallery/index.vue' // 原 ImageGallery.vue
import TimelineChart from '@/packages/timeline/index.vue' // 原 TimelineChart.vue

// 这些通用组件依然在 components 下
import InfoPanel from '@/components/InfoPanel.vue'
import DisplaySettings from '@/components/DisplaySettings.vue'

export const panelDefinitions: PanelDefinition[] = [
  {
    id: 'topicList',
    name: 'Topic列表',
    icon: List,
    component: TopicList, // 确保这里不是 undefined
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
  // ... InfoPanel 和 DisplaySettings 保持不变
  {
    id: 'info',
    name: '信息面板',
    icon: InfoFilled,
    component: InfoPanel,
    minWidth: 300,
    allowedZones: [1, 2, 3],
    description: '显示系统信息和统计数据'
  },
  {
    id: 'settings',
    name: '显示设置',
    icon: Setting,
    component: DisplaySettings,
    minWidth: 300,
    allowedZones: [3],
    description: '可视化显示设置'
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