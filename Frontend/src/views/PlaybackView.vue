<template>
  <div class="playback-view">
    <el-container>
      <!-- 顶部固定区域 -->
      <el-header height="auto" class="main-header">
        <div class="header-content">
          <h1>Pack数据回放控制台</h1>
          <div class="header-actions">
            <el-tag v-if="useDataBusMode" type="success" size="small">
              🚀 DataBus 模式
            </el-tag>
            <el-button
              v-if="!playback.connected"
              type="primary"
              :loading="wsConnecting"
              @click="handleConnect"
            >
              {{ wsConnecting ? '连接中...' : '连接服务器' }}
            </el-button>
            <el-button
              v-else
              type="danger"
              @click="handleDisconnect"
            >
              断开连接
            </el-button>
          </div>
        </div>
      </el-header>

      <el-main class="main-container">
        <!-- WebSocket连接配置 -->
        <el-card v-if="!playback.connected" class="connection-card" shadow="hover">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>服务器配置</span>
              <el-switch
                v-model="useDataBusMode"
                active-text="DataBus"
                inactive-text="旧模式"
                @change="handleModeChange"
              />
            </div>
          </template>
          <el-form :model="connectionForm" label-width="120px">
            <el-form-item label="WebSocket URL">
              <el-input
                v-model="connectionForm.url"
                placeholder="localhost:9002"
              >
                <template #prepend>
                  <el-select v-model="connectionForm.protocol" style="width: 80px">
                    <el-option label="ws://" value="ws://" />
                    <el-option label="wss://" value="wss://" />
                  </el-select>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                :loading="wsConnecting"
                @click="handleConnect"
              >
                连接
              </el-button>
            </el-form-item>
          </el-form>

          <el-alert
            v-if="wsError"
            :title="wsError"
            type="error"
            :closable="false"
            show-icon
            style="margin-top: 20px"
          />
        </el-card>

        <!-- 已连接状态：显示完整的布局系统 -->
        <div v-if="playback.connected" class="connected-workspace">
          <!-- 播放控制栏（固定顶部） -->
          <div class="playback-control-bar">
            <PlaybackController />
          </div>

          <!-- 布局控制器 -->
          <LayoutController />

          <!-- 工作区布局 -->
          <WorkspaceLayout />
        </div>
      </el-main>

      <el-footer height="auto">
        <div class="footer-content">
          <span>Pack Playback UI v2.0.0</span>
          <span>
            {{ useDataBusMode ? '🚀 DataBus' : '📡 WebSocket' }} | 
            服务器: {{ fullUrl || '未连接' }}
          </span>
          <span v-if="playback.connected" style="color: #67c23a">
            ● 已连接 ({{ playback.availableKeys.length }} keys)
          </span>
        </div>
      </el-footer>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { usePlaybackStore } from '@/stores/playback'
import { useTopicsStore } from '@/stores/topics'
import { useWebSocket } from '@/composables/useWebSocket'
import { useDataBus } from '@/composables/useDataBus'
import PlaybackController from '@/components/PlaybackController.vue'
import LayoutController from '@/components/LayoutController.vue'
import WorkspaceLayout from '@/components/WorkspaceLayout.vue'

const playback = usePlaybackStore()
const topics = useTopicsStore()

// 🆕 模式切换：DataBus 或 旧模式
const useDataBusMode = ref(true) // 默认使用 DataBus

// WebSocket连接配置
const connectionForm = ref({
  protocol: 'ws://',
  url: 'localhost:9002'
})

const fullUrl = computed(() => {
  if (!connectionForm.value.url) return ''
  const url = connectionForm.value.url.replace(/^(ws:\/\/|wss:\/\/)/, '')
  return `${connectionForm.value.protocol}${url}`
})

// 🆕 DataBus 实例
const { connect: connectDataBus, disconnect: disconnectDataBus, isConnected: isDataBusConnected } = useDataBus()

// 旧的 WebSocket 实例
let ws: ReturnType<typeof useWebSocket> | null = null

const wsConnecting = computed(() => {
  if (useDataBusMode.value) {
    return false // DataBus 的连接状态由 playback store 管理
  }
  return ws?.connecting.value || false
})

const wsError = computed(() => {
  if (useDataBusMode.value) {
    return null
  }
  return ws?.error.value || null
})

/**
 * 连接服务器
 */
async function handleConnect() {
  const url = fullUrl.value
  
  if (!url) {
    ElMessage.error('请输入WebSocket地址')
    return
  }

  console.log('🔌 Connecting to:', url, 'Mode:', useDataBusMode.value ? 'DataBus' : 'Old')
  
  if (useDataBusMode.value) {
    // 🆕 使用 DataBus 模式
    try {
      await connectDataBus(url)
      playback.connected = true
      ElMessage.success('连接成功 (DataBus)')
      
      // 初始化 stores（订阅消息）
      playback.initialize()
      topics.initialize()
    } catch (error: any) {
      ElMessage.error('连接失败: ' + error.message)
    }
  } else {
    // 旧模式
    ws = useWebSocket(url)
    playback.setWebSocket(ws)
    ws.connect()
    
    const checkConnection = setInterval(() => {
      if (ws?.connected.value) {
        ElMessage.success('连接成功 (旧模式)')
        clearInterval(checkConnection)
      } else if (ws?.error.value) {
        clearInterval(checkConnection)
      }
    }, 100)
  }
}

/**
 * 断开连接
 */
function handleDisconnect() {
  if (useDataBusMode.value) {
    disconnectDataBus()
    playback.connected = false
  } else if (ws) {
    ws.disconnect()
  }
  ElMessage.info('已断开连接')
}

/**
 * 切换模式
 */
function handleModeChange(newMode: boolean) {
  console.log('🔄 Mode changed to:', newMode ? 'DataBus' : 'Old')
  
  // 如果已连接，先断开
  if (playback.connected) {
    handleDisconnect()
  }
}

onMounted(() => {
  console.log('🚀 PlaybackView mounted, mode:', useDataBusMode.value ? 'DataBus' : 'Old')
})

onUnmounted(() => {
  handleDisconnect()
})
</script>

<style scoped>
/* 样式保持不变 */
.playback-view {
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.el-container {
  height: 100%;
}

.main-header {
  background: white;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 20px;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.header-content h1 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.main-container {
  padding: 0;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.connection-card {
  margin: 20px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

.connected-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: white;
}

.playback-control-bar {
  flex-shrink: 0;
  border-bottom: 1px solid #e4e7ed;
}

.el-footer {
  background: white;
  box-shadow: 0 -2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 15px 20px;
  flex-shrink: 0;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #909399;
  gap: 20px;
}
</style>