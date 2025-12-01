<template>
    <div class="image-gallery">
      <el-empty description="图像列表面板开发中..." :image-size="100">
        <template #description>
          <div class="dev-info">
            <p>选中的Topic: <strong>{{ selectedTopic || '未选择' }}</strong></p>
            <p>此面板将用于显示图像数据列表</p>
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
  .image-gallery {
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