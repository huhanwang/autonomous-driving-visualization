// src/core/vis/SceneManager.ts

import { EventEmitter } from '@/core/EventEmitter'
import { VizDecoder, type DecodedObject } from '../protocol/VizDecoder'
import { layerManager } from './LayerManager'

export class SceneManager extends EventEmitter {
  private static instance: SceneManager
  
  // 🗑️ 移除：private objects: Map<string, DecodedObject> = new Map()
  // 我们不再在 SceneManager 里存全量状态，交给 LayerManager 管理

  private constructor() { super() }

  static getInstance() {
    if (!this.instance) this.instance = new SceneManager()
    return this.instance
  }

  handleBinaryMessage(buffer: ArrayBuffer) {
    try {
      const newObjects = VizDecoder.decode(buffer)
      
      // 🗑️ 移除：this.objects.clear() ...
      
      // ✅ 直接将增量/全量数据喂给 LayerManager，由它处理“按 Group 更新”逻辑
      layerManager.updateScene(newObjects)
      
      this.emit('scene-updated')
      
    } catch (e) {
      console.error('Failed to decode viz frame:', e)
    }
  }

  getAllObjects(): DecodedObject[] {
    // ✅ 统一从 LayerManager 获取渲染对象
    return layerManager.getRenderableObjects()
  }
}

export const sceneManager = SceneManager.getInstance()