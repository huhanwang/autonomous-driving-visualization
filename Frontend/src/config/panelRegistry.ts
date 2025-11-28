// config/panelRegistry.ts - 面板注册表

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

// 🆕 从包导入组件（不要指定 components 子目录）
import { TopicList, TopicDetailPanel } from '@/packages/data-panel'
import Visualization2D from '@/components/Visualization2D.vue'
import Visualization3D from '@/components/Visualization3D.vue'
import ImageGallery from '@/components/ImageGallery.vue'
import TimelineChart from '@/components/TimelineChart.vue'
import InfoPanel from '@/components/InfoPanel.vue'
import DisplaySettings from '@/components/DisplaySettings.vue'

/**
 * 面板注册表
 * 所有可用的面板都在这里注册
 */
export const panelDefinitions: PanelDefinition[] = [
  {
    id: 'topicList',
    name: 'Topic列表',
    icon: List,
    component: TopicList,
    minWidth: 300,
    allowedZones: [1], // 只能在左侧区域
    description: '显示所有可用的数据主题'
  },
  {
    id: 'data',
    name: '数据结构',
    icon: Document,
    component: TopicDetailPanel,
    minWidth: 400,
    allowedZones: [1, 2], // 可以在左侧或中间
    description: '显示选中Topic的数据结构'
  },
  {
    id: '2d',
    name: '2D可视化',
    icon: Grid,
    component: Visualization2D,
    minWidth: 600,
    allowedZones: [2, 3], // 可以在中间或右侧
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

/**
 * 面板注册表 Map（用于快速查找）
 */
export const panelRegistry = new Map<string, PanelDefinition>(
  panelDefinitions.map(panel => [panel.id, panel])
)

/**
 * 根据区域ID获取允许的面板列表
 */
export function getPanelsForZone(zoneId: number): PanelDefinition[] {
  return panelDefinitions.filter(
    panel => !panel.allowedZones || panel.allowedZones.includes(zoneId)
  )
}