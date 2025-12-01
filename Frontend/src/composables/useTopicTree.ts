// Frontend/src/composables/useTopicTree.ts - 树形结构逻辑封装

import { ref, computed, nextTick, type Ref, type ShallowRef } from 'vue'
import type { RenderedTreeNode } from '@/packages/data-panel/managers/DataManager'

export interface FlatTreeNode extends RenderedTreeNode {
  level: number
  expanded: boolean
  hasChildren: boolean
  isMatched?: boolean
}

/**
 * 树形结构操作 Hook
 * @param sourceTree 源树数据 (Ref/ShallowRef)
 * @param scrollerRef 虚拟滚动组件的引用 (可选，用于自动滚动)
 */
export function useTopicTree(
  sourceTree: Ref<RenderedTreeNode[]> | ShallowRef<RenderedTreeNode[]>,
  scrollerRef?: Ref<any>
) {
  // 状态
  const expandedKeys = ref<Set<string>>(new Set())
  const expandAll = ref(false)
  const searchText = ref('')

  // ========== 核心算法 ==========

  // 1. 扁平化树 (Flatten)
  function flattenTree(
    nodes: RenderedTreeNode[], 
    level: number,
    expandedSet: Set<string>
  ): FlatTreeNode[] {
    const result: FlatTreeNode[] = []
    
    for (const node of nodes) {
      const hasChildren = !!(node.children?.length)
      const isExpanded = expandedSet.has(node.id)
      
      result.push({
        ...node,
        level,
        expanded: isExpanded,
        hasChildren
      })
      
      if (isExpanded && hasChildren) {
        result.push(...flattenTree(node.children!, level + 1, expandedSet))
      }
    }
    return result
  }

  // 2. 搜索过滤
  function filterTreeBySearch(
    flatList: FlatTreeNode[],
    search: string
  ): FlatTreeNode[] {
    if (!search) return flatList
    
    const lowerSearch = search.toLowerCase()
    const matchedIds = new Set<string>()
    
    // 第一遍：找出所有匹配节点及其父级路径
    for (const node of flatList) {
      const nodeMatches = 
        node.name.toLowerCase().includes(lowerSearch) ||
        node.formattedValue?.toLowerCase().includes(lowerSearch)
      
      if (nodeMatches) {
        matchedIds.add(node.id)
        
        // 添加所有祖先节点 ID
        const parts = node.id.split('.')
        for (let i = 1; i < parts.length; i++) {
          const ancestorId = parts.slice(0, i).join('.')
          matchedIds.add(ancestorId)
        }
      }
    }
    
    // 为了显示匹配项，临时展开所有相关路径
    const expandedForSearch = new Set(expandedKeys.value)
    matchedIds.forEach(id => expandedForSearch.add(id))
    
    // 基于新的展开状态重新扁平化
    const expandedList = flattenTree(sourceTree.value, 0, expandedForSearch)
    
    // 过滤出路径上的节点，并标记匹配项
    return expandedList
      .filter(node => matchedIds.has(node.id))
      .map(node => ({
        ...node,
        expanded: true, // 搜索模式下强制展开
        isMatched: node.name.toLowerCase().includes(lowerSearch) ||
                  node.formattedValue?.toLowerCase().includes(lowerSearch)
      }))
  }

  // ========== 计算属性 ==========

  const flatList = computed(() => {
    return flattenTree(sourceTree.value, 0, expandedKeys.value)
  })

  const filteredFlatList = computed(() => {
    const search = searchText.value.trim()
    if (!search) {
      return flatList.value
    }
    return filterTreeBySearch(flatList.value, search)
  })

  // ========== 操作方法 ==========

  function toggleNode(nodeId: string) {
    if (expandedKeys.value.has(nodeId)) {
      collapseNode(nodeId)
    } else {
      expandedKeys.value.add(nodeId)
    }
  }

  function collapseNode(nodeId: string) {
    expandedKeys.value.delete(nodeId)
    
    // 递归移除子节点的展开状态
    const node = findNodeById(sourceTree.value, nodeId)
    if (node?.children) {
      removeDescendantsFromExpanded(node.children)
    }
  }

  function toggleExpandAll() {
    expandAll.value = !expandAll.value
    
    if (expandAll.value) {
      collectAllIds(sourceTree.value).forEach(id => expandedKeys.value.add(id))
    } else {
      expandedKeys.value.clear()
    }
    
    // 如果绑定了滚动条，回到顶部
    if (scrollerRef?.value) {
      nextTick(() => {
        scrollerRef.value.scrollToItem(0)
      })
    }
  }

  function handleNodeClick(node: FlatTreeNode) {
    if (!node.hasChildren || searchText.value) return
    
    toggleNode(node.id)
    
    // 自动滚动到点击位置（可选体验优化）
    /*
    nextTick(() => {
      const newIndex = filteredFlatList.value.findIndex(item => item.id === node.id)
      if (scrollerRef?.value && newIndex !== -1) {
        scrollerRef.value.scrollToItem(newIndex)
      }
    })
    */
  }

  function reset() {
    expandedKeys.value.clear()
    expandAll.value = false
    searchText.value = ''
  }

  // ========== 辅助函数 ==========

  function findNodeById(nodes: RenderedTreeNode[], id: string): RenderedTreeNode | null {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = findNodeById(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  function removeDescendantsFromExpanded(nodes: RenderedTreeNode[]) {
    for (const node of nodes) {
      expandedKeys.value.delete(node.id)
      if (node.children) {
        removeDescendantsFromExpanded(node.children)
      }
    }
  }

  function collectAllIds(nodes: RenderedTreeNode[]): string[] {
    const ids: string[] = []
    for (const node of nodes) {
      if (node.children?.length) {
        ids.push(node.id)
        ids.push(...collectAllIds(node.children))
      }
    }
    return ids
  }

  return {
    // 状态
    expandedKeys,
    expandAll,
    searchText,
    
    // 计算属性
    flatList,
    filteredFlatList,
    
    // 方法
    toggleNode,
    toggleExpandAll,
    handleNodeClick,
    reset
  }
}