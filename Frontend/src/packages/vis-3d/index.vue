<template>
    <div class="visualization-3d">
      <el-empty description="3D可视化面板开发中..." :image-size="100">
        <template #description>
          <div class="dev-info">
            <p>选中的Topic: <strong>{{ selectedTopic || '未选择' }}</strong></p>
            <p>此面板将用于显示3D场景可视化</p>
          </div>
        </template>
      </el-empty>
    </div>
  </template>
  
  <script setup lang="ts">
  interface Props {
    selectedTopic: string
  }
  
  defineProps<Props>()
  </script>
  
  <style scoped>
  .visualization-3d {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f7fa;
  }
  
  .dev-info {
    margin-top: 16px;
    font-size: 14px;
    color: #606266;
  }
  
  .dev-info p {
    margin: 8px 0;
  }
  
  .dev-info strong {
    color: #409eff;
  }
  </style>