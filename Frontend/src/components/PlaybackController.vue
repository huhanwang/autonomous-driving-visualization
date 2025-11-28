<template>
  <div class="playback-controller">
    <!-- 第一行：播放信息 + 控制按钮 -->
    <div class="control-main">
      <!-- 左侧：播放信息 -->
      <div class="playback-info">
        <div class="info-item">
          <span class="info-label">帧:</span>
          <span class="info-value">{{ playback.currentFrameId }}</span>
          <span class="info-range">[{{ playback.frameRange.min }}-{{ playback.frameRange.max }}]</span>
        </div>
        <el-divider direction="vertical" />
        <div class="info-item">
          <span class="info-label">时间:</span>
          <span class="info-value">{{ playback.currentTimeFormatted }}</span>
        </div>
        <el-divider direction="vertical" />
        <div class="info-item">
          <span class="info-label">进度:</span>
          <span class="info-value">{{ formatProgress(playback.progress) }}</span>
        </div>
      </div>

      <!-- 右侧：控制按钮 -->
      <div class="control-buttons">
        <el-button-group size="default">
          <el-button 
            @click="playback.reset()" 
            :icon="RefreshLeft"
            :disabled="!playback.connected"
            title="重置"
          />
          <el-button 
            @click="playback.prevFrame()" 
            :icon="DArrowLeft"
            :disabled="!playback.connected || playback.isPlaying"
            title="上一帧"
          />
          <el-button 
            v-if="!playback.isPlaying"
            @click="playback.play()" 
            :icon="VideoPlay"
            type="primary"
            :disabled="!playback.connected"
            title="播放"
          />
          <el-button 
            v-else
            @click="playback.pause()" 
            :icon="VideoPause"
            type="warning"
            title="暂停"
          />
          <el-button 
            @click="playback.nextFrame()" 
            :icon="DArrowRight"
            :disabled="!playback.connected || playback.isPlaying"
            title="下一帧"
          />
          <el-button 
            @click="playback.stop()" 
            :icon="CircleClose"
            type="danger"
            :disabled="!playback.connected"
            title="停止"
          />
        </el-button-group>

        <el-select 
          v-model="selectedSpeed" 
          @change="onSpeedChange"
          :disabled="!playback.connected"
          style="width: 90px; margin-left: 12px"
          size="default"
        >
          <el-option label="0.25x" :value="0.25" />
          <el-option label="0.5x" :value="0.5" />
          <el-option label="1x" :value="1.0" />
          <el-option label="2x" :value="2.0" />
          <el-option label="5x" :value="5.0" />
          <el-option label="10x" :value="10.0" />
        </el-select>
      </div>
    </div>

    <!-- 第二行：进度条 -->
    <div class="timeline-slider">
      <el-slider
        v-model="progressValue"
        :min="0"
        :max="100"
        :show-tooltip="true"
        :format-tooltip="formatSliderTooltip"
        @change="onProgressChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePlaybackStore } from '@/stores/playback'
import { 
  VideoPlay, 
  VideoPause, 
  CircleClose,
  DArrowLeft, 
  DArrowRight, 
  RefreshLeft 
} from '@element-plus/icons-vue'
import { formatProgress } from '@/utils/time'

const playback = usePlaybackStore()

// 进度条值（双向绑定）
const progressValue = computed({
  get: () => playback.progressPercent,
  set: () => {
    // 由onProgressChange处理
  }
})

// 速度选择
const selectedSpeed = ref(1.0)

// 监听store中的速度变化
watch(() => playback.speedMultiplier, (val) => {
  selectedSpeed.value = val
})

/**
 * 进度条变化处理
 */
function onProgressChange(value: number) {
  playback.seekToProgress(value / 100)
}

/**
 * 速度变化处理
 */
function onSpeedChange(value: number) {
  playback.setSpeed(value)
}

/**
 * 进度条tooltip格式化
 */
function formatSliderTooltip(value: number) {
  const targetProgress = value / 100
  const targetFrame = Math.round(
    playback.frameRange.min + 
    (playback.frameRange.max - playback.frameRange.min) * targetProgress
  )
  return `帧: ${targetFrame}`
}
</script>

<style scoped>
.playback-controller {
  padding: 16px 20px;
  background: white;
}

/* 第一行：信息 + 按钮 */
.control-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 16px;
}

/* 播放信息 */
.playback-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-label {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
}

.info-value {
  font-size: 14px;
  color: #409eff;
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

.info-range {
  font-size: 11px;
  color: #909399;
  font-family: 'Courier New', monospace;
}

/* 控制按钮 */
.control-buttons {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* 进度条 */
.timeline-slider {
  padding: 0 8px;
}

/* 响应式 */
@media (max-width: 1024px) {
  .control-main {
    flex-direction: column;
    align-items: stretch;
  }
  
  .playback-info {
    justify-content: space-around;
  }
  
  .control-buttons {
    justify-content: center;
  }
}

@media (max-width: 768px) {
  .playback-info {
    flex-wrap: wrap;
  }
  
  .info-item {
    flex: 1 1 45%;
  }
  
  .control-buttons {
    flex-direction: column;
    gap: 12px;
  }
  
  .control-buttons .el-button-group {
    width: 100%;
  }
  
  .control-buttons .el-select {
    width: 100% !important;
    margin-left: 0 !important;
  }
}
</style>