<template>
    <div class="info-panel">
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><InfoFilled /></el-icon>
            <span>信息展示</span>
          </div>
        </template>
        
        <div class="info-content">
          <el-empty 
            description="信息展示面板 - 开发中"
            :image-size="100"
          >
            <template #description>
              <p>这里将显示：</p>
              <ul style="text-align: left; margin-top: 10px;">
                <li>数据统计信息</li>
                <li>系统状态信息</li>
                <li>关键指标展示</li>
                <li>运行时信息</li>
              </ul>
            </template>
          </el-empty>
        </div>
      </el-card>
    </div>
  </template>
  
  <script setup lang="ts">
  import { InfoFilled } from '@element-plus/icons-vue'
  
  interface Props {
    selectedTopic?: string
  }
  
  defineProps<Props>()
  </script>
  
  <style scoped>
  .info-panel {
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
  
  .info-content {
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  </style>