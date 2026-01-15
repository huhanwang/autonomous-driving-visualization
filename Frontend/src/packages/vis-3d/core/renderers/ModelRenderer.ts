// src/packages/vis-3d/core/renderers/ModelRenderer.ts

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { BaseRenderer } from './BaseRenderer'
import type { DecodedObject } from '@/core/protocol/VizDecoder'

/**
 * 模型渲染器
 * 负责加载和渲染 GLB/GLTF 模型
 */
export class ModelRenderer extends BaseRenderer {
  private loader: GLTFLoader
  private modelCache: Map<string, THREE.Group> = new Map()
  private loadingPromises: Map<string, Promise<THREE.Group>> = new Map()

  constructor(scene: THREE.Scene) {
    super(scene, 'Models')
    this.loader = new GLTFLoader()
  }

  update(objects: DecodedObject[]): void {
    const activeIds = new Set<string>()

    for (const obj of objects) {
      activeIds.add(obj.id)
      this.updateModel(obj)
    }

    this.cleanup(activeIds)
  }

  private async updateModel(obj: DecodedObject) {
    let modelInstance = this.objects.get(obj.id)

    if (!modelInstance) {
      // 从 properties 中获取模型路径
      const modelPath = obj.properties?.model_path || this.getDefaultModelPath(obj)
      
      if (!modelPath) {
        console.warn(`[ModelRenderer] No model path for object ${obj.id}`)
        return
      }

      // 加载模型
      const modelTemplate = await this.loadModel(modelPath)
      
      if (modelTemplate) {
        // 克隆模型实例
        modelInstance = modelTemplate.clone()
        modelInstance.userData = { id: obj.id, ...obj.properties }
        this.group.add(modelInstance)
        this.objects.set(obj.id, modelInstance)
      }
    }

    // 更新变换
    if (modelInstance) {
      this.updateTransform(modelInstance, obj)
    }
  }

  private async loadModel(path: string): Promise<THREE.Group | null> {
    // 检查缓存
    if (this.modelCache.has(path)) {
      return this.modelCache.get(path)!
    }

    // 检查是否正在加载
    if (this.loadingPromises.has(path)) {
      return this.loadingPromises.get(path)!
    }

    // 开始加载
    const promise = new Promise<THREE.Group>((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => {
          const model = gltf.scene
          this.modelCache.set(path, model)
          this.loadingPromises.delete(path)
          resolve(model)
        },
        undefined,
        (error) => {
          console.error(`[ModelRenderer] Failed to load ${path}:`, error)
          this.loadingPromises.delete(path)
          reject(error)
        }
      )
    })

    this.loadingPromises.set(path, promise)
    return promise
  }

  private getDefaultModelPath(obj: DecodedObject): string | null {
    // 根据 SubType 返回默认模型路径
    switch (obj.subType) {
      case 100: // OBJ_CAR
        return '/models/car.glb'
      case 101: // OBJ_PEDESTRIAN
        return '/models/pedestrian.glb'
      case 102: // OBJ_CYCLIST
        return '/models/cyclist.glb'
      case 103: // OBJ_CONE
        return '/models/cone.glb'
      case 104: // OBJ_TRUCK
        return '/models/truck.glb'
      case 105: // OBJ_BUS
        return '/models/bus.glb'
      default:
        return null
    }
  }

  private updateTransform(model: THREE.Object3D, obj: DecodedObject) {
    if (obj.position) {
      model.position.set(obj.position.x, obj.position.y, obj.position.z)
    }
    if (obj.rotation) {
      model.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z)
    }
    if (obj.size) {
      // 根据 size 缩放模型
      model.scale.set(obj.size.x, obj.size.y, obj.size.z)
    }
  }

  dispose() {
    // 清理模型缓存
    for (const model of this.modelCache.values()) {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    }
    this.modelCache.clear()
    super.dispose()
  }
}