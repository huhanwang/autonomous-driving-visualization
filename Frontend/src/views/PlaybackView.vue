<template>
  <div class="playback-view">
    <el-container>
      <el-header height="auto" class="main-header">
        <div class="header-content">
          <div class="brand">
            <h1>Pack数据回放控制台</h1>
            <el-tag size="small" effect="plain" type="info">IDE Mode</el-tag>
          </div>
          
          <div class="header-actions">
            <el-button
              v-if="!playback.connected"
              type="primary"
              :loading="connecting"
              @click="handleConnect"
              size="small"
            >
              {{ connecting ? '连接中...' : '连接服务器' }}
            </el-button>
            <el-button
              v-else
              type="danger"
              @click="handleDisconnect"
              size="small"
              plain
            >
              断开
            </el-button>
            
            <el-button size="small" @click="layout.resetLayout" :icon="Refresh">
              重置布局
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

          <div class="ide-layout-container">
            <IDELayout />
          </div>
        </div>
      </el-main>

      <el-footer height="auto">
        <div class="footer-content">
          <span>Pack Playback UI v2.1.0 (IDE Layout)</span>
          <span>
            🚀 DataBus | 服务器: {{ fullUrl || '未连接' }}
          </span>
          <span v-if="playback.connected" style="color: #67c23a">
            ● 已连接
          </span>
        </div>
      </el-footer>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { usePlaybackStore } from '@/stores/playback'
import { useTopicsStore } from '@/stores/topics'
import { useLayoutStore } from '@/stores/layout' // 引入新 Store
import { useDataBus } from '@/composables/useDataBus'

// 组件引入
import PlaybackController from '@/components/PlaybackController.vue'
import IDELayout from '@/layouts/IDELayout.vue' // ✅ 引入新布局

const playback = usePlaybackStore()
const topics = useTopicsStore()
const layout = useLayoutStore() // ✅ 使用新 Store
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

async function handleConnect() {
  const url = fullUrl.value
  if (!url) {
    ElMessage.error('请输入WebSocket地址')
    return
  }
  connecting.value = true
  try {
    await connectDataBus(url)
    playback.connected = true
    playback.initialize()
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

function handleDisconnect() {
  disconnectDataBus()
  playback.connected = false
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
  background: #f0f2f5;
}

.el-container {
  height: 100%;
}

.main-header {
  background: white;
  border-bottom: 1px solid #dcdfe6;
  padding: 10px 20px;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand h1 {
  margin: 0;
  font-size: 20px;
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
  margin: 40px auto;
  max-width: 500px;
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
  z-index: 20;
}

.ide-layout-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.el-footer {
  background: #fafafa;
  border-top: 1px solid #e4e7ed;
  padding: 8px 20px;
  flex-shrink: 0;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
}
</style>