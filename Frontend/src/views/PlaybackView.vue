<template>
  <div class="playback-view">
    <el-container>
      <el-header height="auto" class="main-header">
        <div class="header-content">
          <h1>Pack数据回放控制台</h1>
          <div class="header-actions">
            <el-button
              v-if="!playback.connected"
              type="primary"
              :loading="connecting"
              @click="handleConnect"
            >
              {{ connecting ? '连接中...' : '连接服务器' }}
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
        <el-card v-if="!playback.connected" class="connection-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>服务器配置</span>
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
                :loading="connecting"
                @click="handleConnect"
                style="width: 100%"
              >
                连接
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <div v-if="playback.connected" class="connected-workspace">
          <div class="playback-control-bar">
            <PlaybackController />
          </div>

          <LayoutController />

          <WorkspaceLayout />
        </div>
      </el-main>

      <el-footer height="auto">
        <div class="footer-content">
          <span>Pack Playback UI v2.0.0</span>
          <span>
            🚀 DataBus | 服务器: {{ fullUrl || '未连接' }}
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
import { ref, computed, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { usePlaybackStore } from '@/stores/playback'
import { useTopicsStore } from '@/stores/topics'
import { useDataBus } from '@/composables/useDataBus'

// ✅ 适配新目录结构
import PlaybackController from '@/components/PlaybackController.vue'
import LayoutController from '@/layouts/LayoutController.vue'
import WorkspaceLayout from '@/layouts/WorkspaceLayout.vue'

const playback = usePlaybackStore()
const topics = useTopicsStore()
const { connect: connectDataBus, disconnect: disconnectDataBus } = useDataBus()

const connecting = ref(false)
const connectionForm = ref({
  protocol: 'ws://',
  url: 'localhost:9002'
})

const fullUrl = computed(() => {
  if (!connectionForm.value.url) return ''
  const url = connectionForm.value.url.replace(/^(ws:\/\/|wss:\/\/)/, '')
  return `${connectionForm.value.protocol}${url}`
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

  connecting.value = true
  
  try {
    // 1. 连接 DataBus
    await connectDataBus(url)
    playback.connected = true
    
    // 2. 初始化 Playback Store (订阅消息)
    playback.initialize()
    
    // 3. 初始化 Topics Store (如有必要)
    // 注意：topics store 主要是被动接收消息，这里只是为了可能的重置操作
    if (typeof topics.initialize === 'function') {
      topics.initialize()
    }
    
    ElMessage.success('连接成功')
  } catch (error: any) {
    playback.connected = false
    ElMessage.error('连接失败: ' + (error.message || '无法连接到服务器'))
  } finally {
    connecting.value = false
  }
}

/**
 * 断开连接
 */
function handleDisconnect() {
  disconnectDataBus()
  playback.connected = false
  
  // 清理状态
  if (typeof topics.clear === 'function') {
    topics.clear()
  }
  
  ElMessage.info('已断开连接')
}

onUnmounted(() => {
  handleDisconnect()
})
</script>

<style scoped>
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
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.card-header {
  font-weight: 600;
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