// src/core/vis/SceneManager.ts

import { EventEmitter } from '@/core/EventEmitter'
import { VizDecoder } from '../protocol/VizDecoder'
import { layerManager } from './LayerManager'

export class SceneManager extends EventEmitter {
  private static instance: SceneManager
  
  private constructor() { super() }

  static getInstance() {
    if (!this.instance) this.instance = new SceneManager()
    return this.instance
  }

  handleBinaryMessage(buffer: ArrayBuffer) {
    try {
      // 1. 解析数据 (返回 { layers, coordinateSystem })
      const result = VizDecoder.decode(buffer)
      
      // 2. 更新场景 (传入包含坐标系的完整结果)
      layerManager.updateScene(result)
      
      this.emit('scene-updated')
      
    } catch (e) {
      console.error('Failed to decode viz frame:', e)
    }
  }

  getAllObjects() {
    return layerManager.getRenderableObjects()
  }
}

export const sceneManager = SceneManager.getInstance()