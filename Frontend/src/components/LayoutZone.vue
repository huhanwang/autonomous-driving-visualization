<template>
    <div class="layout-zone">
      <!-- 标签页 -->
      <el-tabs
        v-if="config.panels.length > 0"
        :model-value="config.activePanelId"
        @tab-change="handleTabChange"
        type="border-card"
        class="zone-tabs"
      >
        <el-tab-pane
          v-for="panelId in config.panels"
          :key="panelId"
          :name="panelId"
        >
          <template #label>
            <span class="tab-label">
              <el-icon><component :is="getPanelIcon(panelId)" /></el-icon>
              {{ getPanelName(panelId) }}
            </span>
          </template>
  
          <!-- 动态渲染面板组件 -->
          <div class="panel-container">
            <component
              :is="getPanelComponent(panelId)"
              v-bind="panelProps"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
  
      <!-- 空状态 -->
      <div v-else class="empty-zone">
        <el-empty
          description="此区域暂无面板"
          :image-size="80"
        >
          <el-button type="primary" size="small" @click="emit('add-panel')">
            添加面板
          </el-button>
        </el-empty>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { computed } from 'vue'
  import { useLayoutStore } from '@/stores/layout'
  import { panelRegistry } from '@/config/panelRegistry'
  import type { ZoneConfig } from '@/types/layout'
  
  interface Props {
    config: ZoneConfig
    selectedTopic: string
  }
  
  const props = defineProps<Props>()
  
  const emit = defineEmits<{
    (e: 'add-panel'): void
  }>()
  
  const layout = useLayoutStore()
  
  /**
   * 面板通用props
   */
  const panelProps = computed(() => ({
    selectedTopic: props.selectedTopic
  }))
  
  /**
   * 获取面板名称
   */
  function getPanelName(panelId: string): string {
    return panelRegistry.get(panelId)?.name || panelId
  }
  
  /**
   * 获取面板图标
   */
  function getPanelIcon(panelId: string) {
    return panelRegistry.get(panelId)?.icon
  }
  
  /**
   * 获取面板组件
   */
   function getPanelComponent(panelId: string) {
    const panel = panelRegistry.get(panelId)
    
    // 如果找不到面板定义，或者组件未定义，返回一个简单的错误提示组件
    if (!panel || !panel.component) {
      console.warn(`[LayoutZone] Panel component not found for ID: ${panelId}`)
      // 返回一个内联的错误提示组件
      return {
        template: `<div style="padding: 20px; color: red;">⚠️ Unknown Panel: {{ id }}</div>`,
        setup() { return { id: panelId } }
      }
    }
    
    return panel.component
  }
  
  /**
   * 处理标签页切换
   */
  function handleTabChange(panelId: any) {
    layout.switchActivePanel(props.config.id, panelId as string)
  }
  </script>
  
  <style scoped>
  .layout-zone {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .zone-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .zone-tabs :deep(.el-tabs__content) {
    flex: 1;
    overflow: hidden;
    padding: 0;
  }
  
  .zone-tabs :deep(.el-tab-pane) {
    height: 100%;
    overflow: hidden;
  }
  
  .tab-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  
  .tab-label .el-icon {
    font-size: 14px;
  }
  
  .panel-container {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  
  .empty-zone {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fafafa;
  }
  </style>