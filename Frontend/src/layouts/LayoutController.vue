<template>
    <div class="layout-controller">
      <!-- 工具栏 -->
      <div class="controller-toolbar">
        <!-- 左侧: 预设布局快速切换 -->
        <div class="toolbar-left">
          <span class="toolbar-label">布局:</span>
          <el-button-group size="small">
            <el-button
              v-for="(preset, key) in layoutPresets"
              :key="key"
              :type="layout.currentPresetName === key ? 'primary' : 'default'"
              @click="layout.switchToPreset(key)"
              :title="preset.description"
            >
              {{ preset.name }}
            </el-button>
          </el-button-group>
        </div>
  
        <!-- 右侧: 操作按钮 -->
        <div class="toolbar-right">
          <el-button 
            size="small" 
            :icon="Setting"
            @click="showConfigDialog = true"
          >
            配置
          </el-button>
          <el-button 
            size="small" 
            :icon="Refresh"
            @click="layout.resetLayout()"
          >
            重置
          </el-button>
        </div>
      </div>
  
      <!-- 配置对话框 -->
      <el-dialog
        v-model="showConfigDialog"
        title="布局配置"
        width="800px"
        :close-on-click-modal="false"
      >
        <div class="config-content">
          <!-- 分区配置 -->
          <div 
            v-for="zone in layout.zones"
            :key="zone.id"
            class="zone-config"
          >
            <div class="zone-header">
              <div class="zone-title">
                <el-checkbox
                  :model-value="zone.visible"
                  @change="layout.toggleZoneVisibility(zone.id)"
                >
                  <strong>分区 {{ zone.id }}</strong>
                </el-checkbox>
                <el-tag v-if="zone.visible" size="small" type="info">
                  宽度: {{ zone.width.toFixed(0) }}%
                </el-tag>
              </div>
            </div>
  
            <div v-if="zone.visible" class="zone-body">
              <!-- 宽度滑块 -->
              <div class="zone-width-control">
                <span class="control-label">宽度:</span>
                <el-slider
                  :model-value="zone.width"
                  @input="layout.updateZoneWidth(zone.id, $event)"
                  :min="10"
                  :max="80"
                  :show-tooltip="true"
                  :format-tooltip="(val: number) => `${val}%`"
                />
              </div>
  
              <!-- 面板列表 -->
              <div class="zone-panels">
                <span class="control-label">面板:</span>
                <div class="panel-tags">
                  <el-tag
                    v-for="panelId in zone.panels"
                    :key="panelId"
                    :type="zone.activePanelId === panelId ? 'primary' : 'info'"
                    closable
                    @close="layout.removePanelFromZone(zone.id, panelId)"
                    @click="layout.switchActivePanel(zone.id, panelId)"
                    class="panel-tag"
                  >
                    <el-icon><component :is="getPanelIcon(panelId)" /></el-icon>
                    {{ getPanelName(panelId) }}
                  </el-tag>
                  
                  <!-- 添加面板按钮 -->
                  <el-dropdown 
                    trigger="click"
                    @command="(cmd: string) => handleAddPanel(zone.id, cmd)"
                  >
                    <el-button size="small" :icon="Plus" circle />
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          v-for="panel in getAvailablePanels(zone)"
                          :key="panel.id"
                          :command="panel.id"
                          :disabled="zone.panels.includes(panel.id)"
                        >
                          <el-icon><component :is="panel.icon" /></el-icon>
                          {{ panel.name }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </div>
          </div>
  
          <!-- 导入导出 -->
          <el-divider />
          <div class="import-export">
            <el-button size="small" @click="handleExport">
              <el-icon><Download /></el-icon>
              导出配置
            </el-button>
            <el-button size="small" @click="showImportDialog = true">
              <el-icon><Upload /></el-icon>
              导入配置
            </el-button>
          </div>
        </div>
  
        <template #footer>
          <el-button @click="showConfigDialog = false">关闭</el-button>
        </template>
      </el-dialog>
  
      <!-- 导入配置对话框 -->
      <el-dialog
        v-model="showImportDialog"
        title="导入布局配置"
        width="600px"
      >
        <el-input
          v-model="importText"
          type="textarea"
          :rows="10"
          placeholder="粘贴布局配置 JSON..."
        />
        <template #footer>
          <el-button @click="showImportDialog = false">取消</el-button>
          <el-button type="primary" @click="handleImport">导入</el-button>
        </template>
      </el-dialog>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref } from 'vue'
  import { useLayoutStore } from '@/stores/layout'
  import { layoutPresets } from '@/config/layoutPresets'
  import { panelRegistry, getPanelsForZone } from '@/config/panelRegistry'
  import type { ZoneConfig } from '@/types/layout'
  import { 
    Setting, 
    Refresh, 
    Plus,
    Download,
    Upload
  } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  
  const layout = useLayoutStore()
  
  const showConfigDialog = ref(false)
  const showImportDialog = ref(false)
  const importText = ref('')
  
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
   * 获取分区可用的面板列表
   */
  function getAvailablePanels(zone: ZoneConfig) {
    return getPanelsForZone(zone.id)
  }
  
  /**
   * 添加面板到分区
   */
  function handleAddPanel(zoneId: number, panelId: string) {
    layout.addPanelToZone(zoneId, panelId)
  }
  
  /**
   * 导出配置
   */
  function handleExport() {
    const json = layout.exportLayout()
    
    // 创建下载
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `layout-config-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    
    ElMessage.success('配置已导出')
  }
  
  /**
   * 导入配置
   */
  function handleImport() {
    if (!importText.value.trim()) {
      ElMessage.warning('请输入配置内容')
      return
    }
    
    const success = layout.importLayout(importText.value)
    if (success) {
      showImportDialog.value = false
      importText.value = ''
    }
  }
  </script>
  
  <style scoped>
  .layout-controller {
    background: white;
    border-bottom: 1px solid #e4e7ed;
  }
  
  .controller-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    gap: 20px;
  }
  
  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }
  
  .toolbar-label {
    font-size: 14px;
    color: #606266;
    font-weight: 500;
    white-space: nowrap;
  }
  
  .toolbar-right {
    display: flex;
    gap: 8px;
  }
  
  /* 配置对话框 */
  .config-content {
    max-height: 600px;
    overflow-y: auto;
  }
  
  .zone-config {
    margin-bottom: 24px;
    padding: 16px;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    background: #fafafa;
  }
  
  .zone-header {
    margin-bottom: 16px;
  }
  
  .zone-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .zone-body {
    padding-left: 24px;
  }
  
  .zone-width-control {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  
  .control-label {
    font-size: 13px;
    color: #606266;
    min-width: 60px;
  }
  
  .zone-width-control .el-slider {
    flex: 1;
  }
  
  .zone-panels {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  
  .panel-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    flex: 1;
  }
  
  .panel-tag {
    cursor: pointer;
    transition: all 0.3s;
  }
  
  .panel-tag:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .panel-tag .el-icon {
    margin-right: 4px;
  }
  
  .import-export {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  
  /* 响应式 */
  @media (max-width: 1024px) {
    .controller-toolbar {
      flex-direction: column;
      align-items: stretch;
    }
    
    .toolbar-left,
    .toolbar-right {
      justify-content: center;
    }
  }
  </style>