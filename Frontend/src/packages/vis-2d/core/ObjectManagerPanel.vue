<template>
    <div class="object-manager">
      <div class="toolbar">
        <el-input
          v-model="layerManager.state.filterText"
          placeholder="搜索 ID..."
          prefix-icon="Search"
          clearable
          size="small"
          class="search-input"
        />
        <div class="tool-actions">
          <el-tooltip content="全部显示">
            <el-button size="small" circle text @click="setAllVisibility(true)">
              <el-icon><View /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="全部隐藏">
            <el-button size="small" circle text @click="setAllVisibility(false)">
              <el-icon><Hide /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>
  
      <div class="tree-container">
        <el-scrollbar>
          <el-tree
            v-if="layerManager.tree.length > 0"
            :data="layerManager.tree"
            :props="defaultProps"
            node-key="id"
            default-expand-all
            :expand-on-click-node="false"
            :highlight-current="true"
            @node-click="handleNodeClick"
            class="custom-tree"
          >
            <template #default="{ node, data }">
              <div 
                class="tree-node-content" 
                :class="{ 'is-hidden': !data.visible, 'is-selected': data.id === layerManager.state.selectedId }"
              >
                <span class="visibility-toggle" @click.stop="toggleVisibility(data)">
                  <el-icon v-if="data.visible"><View /></el-icon>
                  <el-icon v-else class="icon-hidden"><Hide /></el-icon>
                </span>
  
                <el-icon class="type-icon">
                  <component :is="getIconByType(data.type)" />
                </el-icon>
  
                <span class="node-label" :title="node.label">{{ node.label }}</span>
  
                <span v-if="data.type === 'group'" class="count-badge">
                  {{ data.children?.length || 0 }}
                </span>
              </div>
            </template>
          </el-tree>
          
          <el-empty v-else description="暂无图层数据" :image-size="60" />
        </el-scrollbar>
      </div>
  
      <div class="property-panel">
        <div class="prop-header">
          <el-icon><InfoFilled /></el-icon>
          <span>属性信息</span>
        </div>
        
        <div v-if="selectedObject" class="prop-content">
          <el-scrollbar>
            <div class="prop-group">
              <div class="prop-row header">基础信息</div>
              <div class="prop-row">
                <span class="label">ID</span>
                <span class="value" :title="selectedObject.id">{{ selectedObject.id }}</span>
              </div>
               <div class="prop-row">
                <span class="label">Type</span>
                <span class="value">{{ getObjectType(selectedObject.type) }}</span>
              </div>
            </div>
  
            <div class="prop-group">
              <div class="prop-row header">变换 (Transform)</div>
              <div class="prop-row">
                <span class="label">Position</span>
                <span class="value">
                  {{ formatVector3(selectedObject.position) }}
                </span>
              </div>
              <div class="prop-row">
                <span class="label">Rotation</span>
                <span class="value">
                  {{ formatVector3(selectedObject.rotation) }}
                </span>
              </div>
              <div class="prop-row">
                <span class="label">Size</span>
                <span class="value">
                  {{ formatVector3(selectedObject.size) }}
                </span>
              </div>
            </div>
  
            <div v-if="selectedObject.properties && Object.keys(selectedObject.properties).length > 0" class="prop-group">
              <div class="prop-row header">自定义属性</div>
              <div 
                v-for="(val, key) in selectedObject.properties" 
                :key="key"
                class="prop-row"
              >
                <span class="label">{{ key }}</span>
                <span class="value">{{ val }}</span>
              </div>
            </div>
          </el-scrollbar>
        </div>
        
        <div v-else class="prop-empty">
          请选择一个对象查看属性
        </div>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { computed } from 'vue'
  import { layerManager, type LayerNode, type GroupNode } from '@/core/vis/LayerManager'
  import { 
    Search, View, Hide, Folder, FolderOpened, Box, InfoFilled 
  } from '@element-plus/icons-vue'
  import { ObjectType } from '@/core/protocol/VizDecoder'
  
  const defaultProps = {
    children: 'children',
    label: 'name'
  }
  
  // 获取当前选中对象详情
  const selectedObject = computed(() => {
    const id = layerManager.state.selectedId
    if (!id) return null
    // 注意：你需要确保在 LayerManager 中实现了 getObjectById
    return layerManager.getObjectById(id)
  })
  
  // 图标映射
  function getIconByType(type: string) {
    if (type === 'layer') return Folder
    if (type === 'group') return FolderOpened
    return Box // Object
  }
  
  function getObjectType(typeEnum: number) {
    return ObjectType[typeEnum] || 'UNKNOWN'
  }
  
  function formatVector3(vec: {x:number, y:number, z:number}) {
    return `${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)}`
  }
  
  function handleNodeClick(data: any) {
    // 只有点击的是对象(叶子节点)时才选中
    // 在你的 LayerManager 树结构中，第三层是对象
    // 简单判断：没有 children 或者是特定 type
    if (data.type !== 'layer' && data.type !== 'group') {
      layerManager.selectObject(data.id)
    }
  }
  
  function toggleVisibility(data: LayerNode | GroupNode | any) {
    data.visible = !data.visible
    // 这里如果是 layer 或 group，可能需要递归设置子节点的 visible
    // 或者 renderer 会自动处理（如果父节点不可见，子节点就不渲染）
    // 建议 renderer 逻辑：if (!layer.visible) continue; 这样性能最好
  }
  
  function setAllVisibility(visible: boolean) {
    layerManager.tree.forEach(layer => {
      layer.visible = visible
      layer.children.forEach(group => group.visible = visible)
    })
  }
  </script>
  
  <style scoped>
  .object-manager {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #fff;
    border-right: 1px solid #e5e7eb;
  }
  
  /* 1. 工具栏 */
  .toolbar {
    padding: 8px 12px;
    display: flex;
    gap: 8px;
    border-bottom: 1px solid #f0f2f5;
    background: #f8fafc;
  }
  
  .search-input {
    flex: 1;
  }
  
  .tool-actions {
    display: flex;
    gap: 2px;
  }
  
  /* 2. 树形列表 */
  .tree-container {
    flex: 1;
    overflow: hidden;
    background: #fff;
  }
  
  .custom-tree {
    /* 覆盖 Element Tree 默认样式以更紧凑 */
    background: transparent;
  }
  
  .tree-node-content {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    padding-right: 8px;
    height: 28px;
    overflow: hidden;
  }
  
  .tree-node-content.is-selected {
    color: #409eff;
    font-weight: 500;
  }
  
  .tree-node-content.is-hidden {
    opacity: 0.5;
    color: #909399;
  }
  
  .visibility-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    cursor: pointer;
    color: #909399;
  }
  
  .visibility-toggle:hover {
    background: #f0f2f5;
    color: #606266;
  }
  
  .type-icon {
    font-size: 14px;
    color: #ffca28; /* 文件夹颜色 */
  }
  
  .tree-node-content.is-selected .type-icon {
    color: #409eff;
  }
  
  .node-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .count-badge {
    font-size: 10px;
    background: #f0f2f5;
    color: #909399;
    padding: 1px 5px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }
  
  /* 3. 属性面板 */
  .property-panel {
    height: 35%; /* 固定占比，或者使用 splitpanes 嵌套 */
    border-top: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    background: #fcfcfc;
  }
  
  .prop-header {
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: #303133;
    background: #f8fafc;
    border-bottom: 1px solid #f0f2f5;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .prop-content {
    flex: 1;
    overflow: hidden;
    padding: 0;
  }
  
  .prop-group {
    margin-bottom: 12px;
  }
  
  .prop-row {
    display: flex;
    padding: 6px 12px;
    font-size: 12px;
    border-bottom: 1px solid #f9fafb;
  }
  
  .prop-row.header {
    background: #f3f4f6;
    color: #606266;
    font-weight: 500;
    padding: 4px 12px;
  }
  
  .prop-row .label {
    width: 80px;
    color: #909399;
    flex-shrink: 0;
  }
  
  .prop-row .value {
    color: #303133;
    flex: 1;
    word-break: break-all;
    font-family: 'Courier New', monospace;
  }
  
  .prop-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 12px;
  }
  </style>