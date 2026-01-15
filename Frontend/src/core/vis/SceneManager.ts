// src/core/vis/SceneManager.ts

import { EventEmitter } from '@/core/EventEmitter'
import { VizDecoder, type DecodeResult } from '../protocol/VizDecoder'
import { layerManager } from './LayerManager'

export class SceneManager extends EventEmitter {
  private static instance: SceneManager
  
  private constructor() { super() }

  static getInstance() {
    if (!this.instance) this.instance = new SceneManager()
    return this.instance
  }

  /**
   * 处理二进制原始数据 (同步解析)
   * 注意：在高并发场景下尽量不要使用此方法，应走 DataBus 的 Worker 通道
   */
  handleBinaryMessage(buffer: ArrayBuffer) {
    try {
      // 1. 解析数据
      const result = VizDecoder.decode(buffer)
      
      // 2. 复用更新逻辑
      this.handleDecodedFrame(result)
      
    } catch (e) {
      console.error('Failed to decode viz frame:', e)
    }
  }

  /**
   * ✅ 新增：处理已解码的帧数据
   * 供 DataBus Worker 调用
   */
  handleDecodedFrame(result: DecodeResult) {
    // 更新场景 (传入包含坐标系的完整结果)
    layerManager.updateScene(result)
    
    this.emit('scene-updated')
  }

  getAllObjects() {
    return layerManager.getRenderableObjects()
  }
}

export const sceneManager = SceneManager.getInstance()