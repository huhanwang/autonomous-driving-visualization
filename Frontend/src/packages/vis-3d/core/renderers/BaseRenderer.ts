// src/packages/vis-3d/core/renderers/BaseRenderer.ts

import * as THREE from 'three'
import type { DecodedObject } from '@/core/protocol/VizDecoder'

/**
 * 渲染器基类
 * 所有专用渲染器都继承自这个基类
 */
export abstract class BaseRenderer {
  protected scene: THREE.Scene
  protected group: THREE.Group
  protected objects: Map<string, THREE.Object3D> = new Map()

  constructor(scene: THREE.Scene, groupName: string) {
    this.scene = scene
    this.group = new THREE.Group()
    this.group.name = groupName
    this.scene.add(this.group)
  }

  /**
   * 更新渲染对象
   * @param objects 需要渲染的对象列表
   */
  abstract update(objects: DecodedObject[]): void

  /**
   * 清理不再存在的对象
   * @param activeIds 当前活跃的对象ID集合
   */
  protected cleanup(activeIds: Set<string>) {
    for (const [id, obj] of this.objects) {
      if (!activeIds.has(id)) {
        this.group.remove(obj)
        this.disposeObject(obj)
        this.objects.delete(id)
      }
    }
  }

  /**
   * 销毁对象资源
   */
  protected disposeObject(obj: THREE.Object3D) {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose())
      } else {
        obj.material.dispose()
      }
    }
  }

  /**
   * 销毁渲染器
   */
  dispose() {
    for (const obj of this.objects.values()) {
      this.disposeObject(obj)
    }
    this.objects.clear()
    this.scene.remove(this.group)
  }

  /**
   * 获取渲染组
   */
  getGroup(): THREE.Group {
    return this.group
  }
}