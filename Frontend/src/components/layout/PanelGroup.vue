<template>
  <div class="panel-group">
    <div class="group-toolbar">
      <el-radio-group 
        :model-value="config.splitMode" 
        size="small" 
        @change="mode => layout.setGroupSplitMode(groupId, mode as any)"
      >
        <el-radio-button label="tabs">标签页</el-radio-button>
        <el-radio-button label="grid">并列</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="config.splitMode === 'tabs'" class="group-content">
      <el-tabs 
        :model-value="config.activePanelId"
        type="border-card" 
        @tab-change="val => layout.setGroupActivePanel(groupId, val as string)"
        class="main-tabs"
      >
        <el-tab-pane 
          v-for="panelId in availablePanels" 
          :key="panelId" 
          :name="panelId"
        >
          <template #label>
            <span>{{ getPanelName(panelId) }}</span>
            <el-button 
              size="small" 
              link 
              class="tab-btn" 
              @click.stop="layout.togglePanelFloating(panelId)"
              title="独立窗口"
            >
              <el-icon><CopyDocument /></el-icon>
            </el-button>
          </template>
          <component :is="getPanelComponent(panelId)" :selectedTopic="selectedTopic" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <div v-else class="group-content grid-mode">
      <Splitpanes horizontal class="default-theme">
        <Pane v-for="panelId in availablePanels" :key="panelId" min-size="20">
          <div class="grid-panel-wrapper">
            <div class="grid-header">
              <span class="grid-title">{{ getPanelName(panelId) }}</span>
              <div class="grid-actions">
                 <el-button size="small" link @click="layout.togglePanelFloating(panelId)" title="独立窗口">
                    <el-icon><CopyDocument /></el-icon>
                 </el-button>
              </div>
            </div>
            <div class="grid-body">
               <component :is="getPanelComponent(panelId)" :selectedTopic="selectedTopic" />
            </div>
          </div>
        </Pane>
      </Splitpanes>
    </div>

    <FloatingWindow 
      v-for="panelId in floatingPanels" 
      :key="panelId"
      :visible="true"
      :title="getPanelName(panelId)"
      :maximized="layout.state.panelStates[panelId]?.isMaximized" 
      @update:maximized="(val) => layout.setPanelMaximized(panelId, val)"
      @close="layout.togglePanelFloating(panelId)"
    >
      <component :is="getPanelComponent(panelId)" :selectedTopic="selectedTopic" />
    </FloatingWindow>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLayoutStore } from '@/stores/layout'
import { panelRegistry } from '@/config/panelRegistry'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import FloatingWindow from './FloatingWindow.vue'
import { CopyDocument } from '@element-plus/icons-vue'

const props = defineProps<{
  groupId: 'data' | 'vis'
  selectedTopic: string
}>()

const layout = useLayoutStore()
// 如果这里报错，说明 layout.state.groups 数据结构不对，或者 props.groupId 传错了
const config = computed(() => layout.state.groups[props.groupId])

const availablePanels = computed(() => {
  if (!config.value) return []
  return config.value.panels.filter(pid => !layout.state.panelStates[pid]?.isFloating)
})

const floatingPanels = computed(() => {
  if (!config.value) return []
  return config.value.panels.filter(pid => layout.state.panelStates[pid]?.isFloating)
})

function getPanelName(id: string) {
  return panelRegistry.get(id)?.name || id
}

function getPanelComponent(id: string) {
  const panel = panelRegistry.get(id)
  return panel?.component || null
}
</script>

<style scoped>
/* 样式保持不变，确保有高度 */
.panel-group {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  min-width: 0;
}
.group-toolbar {
  padding: 4px 8px;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
.group-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.main-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: none !important;
}
:deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}
:deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
}
.tab-btn {
  margin-left: 8px;
  color: #909399;
  vertical-align: middle;
}
.tab-btn:hover {
  color: #409eff;
}
.grid-mode {
  background: #f0f2f5;
}
.grid-panel-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border: 1px solid #e4e7ed;
}
.grid-header {
  padding: 6px 10px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.grid-title {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
}
.grid-body {
  flex: 1;
  overflow: hidden;
}
</style>