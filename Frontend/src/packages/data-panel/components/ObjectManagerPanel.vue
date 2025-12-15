<template>
  <div 
    class="object-manager-panel" 
    :class="{ 'is-resizing': isResizing }"
    ref="containerRef"
  >
    <div class="panel-toolbar">
      <el-input
        v-model="layerManager.state.filterText"
        placeholder="筛选对象..."
        :prefix-icon="Search"
        clearable
        size="small"
        class="search-input"
      />
      <div class="toolbar-actions">
        <el-tooltip content="全部展开" :show-after="800">
          <div class="icon-btn" @click="expandAll"><el-icon><Expand /></el-icon></div>
        </el-tooltip>
        <el-tooltip content="全部折叠" :show-after="800">
          <div class="icon-btn" @click="collapseAll"><el-icon><Fold /></el-icon></div>
        </el-tooltip>
        <div class="divider"></div>
        <el-tooltip content="全部显示" :show-after="800">
          <div class="icon-btn" @click="setAllVisibility(true)"><el-icon><View /></el-icon></div>
        </el-tooltip>
        <el-tooltip content="全部隐藏" :show-after="800">
          <div class="icon-btn" @click="setAllVisibility(false)"><el-icon><Hide /></el-icon></div>
        </el-tooltip>
      </div>
    </div>

    <div class="tree-wrapper">
      <el-scrollbar>
        <el-tree
          ref="treeRef"
          v-if="layerManager.tree.length > 0"
          :data="layerManager.tree"
          :props="treeProps"
          node-key="id"
          :expand-on-click-node="false"
          :highlight-current="true"
          :default-expand-all="true" 
          :filter-node-method="filterNode"
          @node-click="handleNodeClick"
          class="ide-tree"
          :indent="12"
        >
          <template #default="{ node, data }">
            <div 
              class="tree-node-row" 
              :class="{ 
                'is-dimmed': !data.visible,
                'is-selected': data.id === layerManager.state.selectedId 
              }"
            >
              <div class="vis-toggle" @click.stop="toggleVisibility(data)">
                <el-icon v-if="data.visible" class="vis-icon"><View /></el-icon>
                <el-icon v-else class="vis-icon hidden"><Hide /></el-icon>
              </div>

              <el-icon class="type-icon" :class="data.type">
                <component :is="getIconByType(data.type)" />
              </el-icon>

              <span class="node-text" :title="data.rawId">
                {{ data.name }}
                <span v-if="data.rawId !== data.name" class="raw-id-hint">({{ data.rawId }})</span>
              </span>

              <span v-if="data.children?.length" class="count-badge">
                {{ data.children.length }}
              </span>
            </div>
          </template>
        </el-tree>
        
        <div v-else class="empty-state">
          <el-empty description="暂无场景对象" :image-size="60" />
        </div>
      </el-scrollbar>
    </div>

    <div class="resize-handle" @mousedown="startResize">
      <div class="handle-bar"></div>
    </div>

    <div class="properties-panel" :style="{ height: propertiesHeight + 'px' }">
      <div class="props-header">
        <div class="header-left">
          <el-icon><InfoFilled /></el-icon>
          <span>属性检查器</span>
        </div>
        </div>
      
      <div v-if="selectedObject" class="props-content">
        <el-scrollbar>
          <div class="props-group">
            <div class="group-title">基础信息 (Basic)</div>
            <div class="prop-row">
              <span class="label">ID</span>
              <span class="value code highlight">{{ getRawId(layerManager.state.selectedId) }}</span>
            </div>
            <div class="prop-row">
              <span class="label">Path</span>
              <span class="value code tiny" :title="layerManager.state.selectedId">{{ layerManager.state.selectedId }}</span>
            </div>
            <div class="prop-row">
              <span class="label">Type</span>
              <span class="value">{{ getObjectType(selectedObject.type) }}</span>
            </div>
            <div class="prop-row" v-if="selectedObject.subType">
              <span class="label">SubType</span>
              <span class="value">{{ selectedObject.subType }}</span>
            </div>
          </div>

          <div class="props-group">
            <div class="group-title">变换 (Transform)</div>
            <div class="prop-row">
              <span class="label">Position</span>
              <span class="value code">{{ formatVector3(selectedObject.position) }}</span>
            </div>
            <div class="prop-row">
              <span class="label">Rotation</span>
              <span class="value code">{{ formatVector3(selectedObject.rotation) }}</span>
            </div>
            <div class="prop-row">
              <span class="label">Size</span>
              <span class="value code">{{ formatVector3(selectedObject.size) }}</span>
            </div>
          </div>

          <div class="props-group" v-if="selectedObject.properties && Object.keys(selectedObject.properties).length > 0">
            <div class="group-title">自定义属性 (Properties)</div>
            <div class="prop-row" v-for="(val, key) in selectedObject.properties" :key="key">
              <span class="label">{{ key }}</span>
              <span class="value">{{ val }}</span>
            </div>
          </div>
        </el-scrollbar>
      </div>
      
      <div v-else class="props-empty">
        <el-icon class="empty-icon"><Pointer /></el-icon>
        <p>选择对象以查看详情</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { layerManager } from '@/core/vis/LayerManager'
import type { UINode } from '@/core/vis/LayerManager'
import { ObjectType } from '@/core/protocol/VizDecoder'
import { 
  Search, View, Hide, Folder, Box, InfoFilled,
  Expand, Fold, Files, Operation, Pointer
} from '@element-plus/icons-vue'

// ========== 拖拽调整高度逻辑 ==========
const propertiesHeight = ref(280) // 默认高度
const isResizing = ref(false)
let startY = 0
let startHeight = 0

function startResize(e: MouseEvent) {
  isResizing.value = true
  startY = e.clientY
  startHeight = propertiesHeight.value
  
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

function handleMouseMove(e: MouseEvent) {
  if (!isResizing.value) return
  // 向上拖拽是减小 clientY，但我们希望增加高度，所以是 (startY - e.clientY)
  const deltaY = startY - e.clientY 
  const newHeight = startHeight + deltaY
  
  // 限制最小和最大高度
  // 最小 100px，最大 600px (或者视口高度的 80%)
  propertiesHeight.value = Math.max(40, Math.min(window.innerHeight - 200, newHeight))
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// ========== 业务逻辑 (保持原有功能) ==========

const treeProps = {
  children: 'children',
  label: 'name'
}

const treeRef = ref<any>(null)

watch(() => layerManager.state.filterText, (val) => {
  treeRef.value?.filter(val)
})

const filterNode = (value: string, data: UINode) => {
  if (!value) return true
  const search = value.toLowerCase()
  return data.name.toLowerCase().includes(search) || 
         data.id.toLowerCase().includes(search) ||
         (data.rawId && data.rawId.toString().toLowerCase().includes(search))
}

const selectedObject = computed(() => {
  const id = layerManager.state.selectedId
  if (!id) return null
  return layerManager.getObjectById(id)
})

function getRawId(fullPath: string | null): string {
  if (!fullPath) return ''
  return (layerManager as any).pathToRawId?.get(fullPath) || fullPath.split('/').pop() || fullPath
}

function getIconByType(type: string) {
  if (type === 'layer') return Files
  if (type === 'topic') return Operation
  if (type === 'group') return Folder
  return Box
}

function getObjectType(typeEnum: number) {
  return ObjectType[typeEnum] || 'UNKNOWN'
}

function formatVector3(vec: {x:number, y:number, z:number}) {
  if (!vec) return '-'
  return `${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)}`
}

function formatColor(c: {r:number, g:number, b:number, a:number}) {
  return `R${c.r} G${c.g} B${c.b}`
}

function getColorStyle(c: {r:number, g:number, b:number, a:number}) {
  return {
    backgroundColor: `rgba(${c.r},${c.g},${c.b},${c.a/255})`
  }
}

function handleNodeClick(data: UINode) {
  if (data.type === 'object') {
    layerManager.selectObject(data.id)
  }
}

function toggleVisibility(data: UINode) {
  data.visible = !data.visible
}

function setAllVisibility(visible: boolean) {
  const traverse = (nodes: UINode[]) => {
    nodes.forEach(n => {
      n.visible = visible
      if(n.children) traverse(n.children)
    })
  }
  traverse(layerManager.tree)
}

function expandAll() {
  const nodes = treeRef.value?.store?.nodesMap
  for (const key in nodes) nodes[key].expanded = true
}

function collapseAll() {
  const nodes = treeRef.value?.store?.nodesMap
  for (const key in nodes) nodes[key].expanded = false
}

// 清理事件监听
onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.object-manager-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  user-select: none;
  position: relative;
  overflow: hidden;
}

/* 1. Toolbar */
.panel-toolbar {
  padding: 8px 10px;
  background: #f8f9fc;
  border-bottom: 1px solid #ebedf0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.divider {
  width: 1px;
  height: 14px;
  background: #dcdfe6;
  margin: 0 4px;
}

.icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #606266;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: #e6e8eb;
  color: #409eff;
}

/* 2. Tree Wrapper */
.tree-wrapper {
  flex: 1;
  overflow: hidden;
  background: #fff;
  /* 确保树不会被挤压到消失 */
  min-height: 100px; 
}

.ide-tree {
  --el-tree-node-content-height: 28px;
  --el-tree-node-hover-bg-color: #f0f7ff;
  padding: 6px 0;
}

.tree-node-row {
  flex: 1;
  display: flex;
  align-items: center;
  font-size: 13px;
  padding-right: 8px;
  gap: 6px;
  border-radius: 3px;
  overflow: hidden;
  color: #303133;
}

/* Tree Node States */
.is-dimmed { opacity: 0.5; }
.is-selected { color: #409eff; font-weight: 500; }

.vis-toggle {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
}
.vis-toggle:hover { color: #409eff; }
.vis-icon.hidden { color: #c0c4cc; }

.type-icon { font-size: 14px; }
.type-icon.layer { color: #409eff; }
.type-icon.topic { color: #8e44ad; }
.type-icon.group { color: #e6a23c; }
.type-icon.object { color: #67c23a; }

.node-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.raw-id-hint {
  color: #909399;
  font-size: 11px;
  margin-left: 4px;
}

.count-badge {
  font-size: 10px;
  background: #f2f3f5;
  color: #909399;
  padding: 0 5px;
  border-radius: 4px;
  height: 16px;
  line-height: 16px;
}

/* 3. Resize Handle */
.resize-handle {
  height: 6px; /* 感应区域 */
  background: #f8f9fc;
  border-top: 1px solid #ebedf0;
  border-bottom: 1px solid #ebedf0;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  flex-shrink: 0;
  z-index: 10;
}

.resize-handle:hover,
.is-resizing .resize-handle {
  background: #e6e8eb;
}

.handle-bar {
  width: 32px;
  height: 2px;
  background: #c0c4cc;
  border-radius: 1px;
}

/* 4. Properties Panel */
.properties-panel {
  /* height 由 style 动态控制 */
  display: flex;
  flex-direction: column;
  background: #fcfcfc;
  flex-shrink: 0;
}

.props-header {
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  border-bottom: 1px solid #ebedf0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.props-content {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

.props-group {
  padding: 8px 0;
  border-bottom: 1px solid #ebedf0;
}

.group-title {
  padding: 4px 12px;
  font-size: 11px;
  color: #909399;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.prop-row {
  display: flex;
  padding: 4px 12px;
  font-size: 12px;
  line-height: 1.5;
  gap: 12px;
}

.prop-row:hover {
  background: #f0f2f5;
}

.label {
  width: 80px;
  color: #606266;
  flex-shrink: 0;
  font-weight: 500;
}

.value {
  color: #303133;
  word-break: break-all;
  flex: 1;
}

.value.code {
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  font-size: 11px;
}

.value.highlight {
  color: #409eff;
  font-weight: 600;
}

.value.tiny {
  font-size: 10px;
  color: #909399;
}

.props-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  font-size: 12px;
  gap: 8px;
  background: #fcfcfc;
}

.empty-icon {
  font-size: 28px;
  color: #dcdfe6;
}
</style>