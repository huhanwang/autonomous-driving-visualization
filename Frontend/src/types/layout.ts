// types/layout.ts - 布局系统类型定义

import type { Component } from 'vue'

/**
 * 面板定义 - 描述一个可视化面板的元信息
 */
export interface PanelDefinition {
  id: string                    // 唯一标识: 'topicList' | 'data' | '2d' | '3d' | 'images' | 'timeline'
  name: string                  // 显示名称
  icon: any                     // Element Plus 图标组件
  component: Component          // Vue 组件
  minWidth?: number            // 最小宽度（像素）
  allowedZones?: number[]      // 允许放置的区域 [1, 2, 3]
  description?: string         // 描述
}

/**
 * 分区配置
 */
export interface ZoneConfig {
  id: number                   // 分区ID: 1, 2, 3
  width: number                // 宽度百分比: 0-100
  visible: boolean             // 是否显示
  activePanelId: string        // 当前激活的面板ID
  panels: string[]             // 该区域包含的面板ID列表（tab顺序）
}

/**
 * 布局配置
 */
export interface LayoutConfig {
  name: string                 // 布局名称
  description?: string         // 布局描述
  zones: ZoneConfig[]          // 3个分区的配置
}

/**
 * 预设布局集合
 */
export interface LayoutPresets {
  [key: string]: LayoutConfig
}