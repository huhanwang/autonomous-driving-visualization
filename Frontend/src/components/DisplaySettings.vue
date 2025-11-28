<template>
    <div class="display-settings-panel">
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>显示设置</span>
          </div>
        </template>
        
        <div class="settings-content">
          <el-empty 
            description="显示设置面板 - 开发中"
            :image-size="100"
          >
            <template #description>
              <p>这里将提供：</p>
              <ul style="text-align: left; margin-top: 10px;">
                <li>2D/3D 显示配置</li>
                <li>颜色主题设置</li>
                <li>坐标轴显示控制</li>
                <li>图层显示开关</li>
                <li>视图参数调整</li>
              </ul>
            </template>
          </el-empty>
        </div>
      </el-card>
    </div>
  </template>
  
  <script setup lang="ts">
  import { Setting } from '@element-plus/icons-vue'
  
  interface Props {
    selectedTopic?: string
  }
  
  defineProps<Props>()
  </script>
  
  <style scoped>
  .display-settings-panel {
    height: 100%;
    padding: 16px;
    background: #f5f7fa;
  }
  
  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
  
  .settings-content {
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  </style>