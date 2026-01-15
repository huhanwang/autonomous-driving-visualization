// src/packages/vis-3d/core/renderers/PrimitiveRenderer.ts

import * as THREE from 'three'
import { BaseRenderer } from './BaseRenderer'
import { MaterialManager } from '../materials/MaterialManager'
import type { DecodedObject } from '@/core/protocol/VizDecoder'

/**
 * 基础图元渲染器
 * 负责渲染 Sphere、Cube 等简单几何体
 */
export class PrimitiveRenderer extends BaseRenderer {
  private materialManager: MaterialManager

  constructor(scene: THREE.Scene, materialManager: MaterialManager) {
    super(scene, 'Primitives')
    this.materialManager = materialManager
  }

  update(objects: DecodedObject[]): void {
    const activeIds = new Set<string>()

    for (const obj of objects) {
      activeIds.add(obj.id)
      
      let mesh = this.objects.get(obj.id) as THREE.Mesh | undefined
      
      if (!mesh) {
        mesh = this.createPrimitive(obj)
        if (mesh) {
          mesh.userData = { id: obj.id, ...obj.properties }
          mesh.matrixAutoUpdate = false
          mesh.updateMatrix()
          this.group.add(mesh)
          this.objects.set(obj.id, mesh)
        }
      } else {
        this.updateTransform(mesh, obj)
      }
    }

    this.cleanup(activeIds)
  }

  private createPrimitive(obj: DecodedObject): THREE.Mesh | null {
    const material = this.materialManager.getBasicMaterial(obj.color)
    let geometry: THREE.BufferGeometry | null = null
  
    if (obj.type === 6) { // SPHERE
      const r = obj.size?.x || 0.2
      geometry = new THREE.SphereGeometry(r, 12, 12)
    } else if (obj.type === 5) { // CUBE
      geometry = new THREE.BoxGeometry(
        obj.size?.x || 1,
        obj.size?.y || 1,
        obj.size?.z || 1
      )
    }
  
    if (!geometry) return null
  
    const mesh = new THREE.Mesh(geometry, material)
    
    // 🌟 [确保设置 position] Sphere 和 Cube 需要设置位置
    if (obj.position) {
      mesh.position.set(obj.position.x, obj.position.y, obj.position.z)
    }
    if (obj.rotation) {
      mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z)
    }
  
    return mesh
  }

  private updateTransform(mesh: THREE.Object3D, obj: DecodedObject) {
    let needsUpdate = false

    if (obj.position) {
      const pos = mesh.position
      if (
        pos.x !== obj.position.x ||
        pos.y !== obj.position.y ||
        pos.z !== obj.position.z
      ) {
        mesh.position.set(obj.position.x, obj.position.y, obj.position.z)
        needsUpdate = true
      }
    }

    if (obj.rotation) {
      const rot = mesh.rotation
      if (
        rot.x !== obj.rotation.x ||
        rot.y !== obj.rotation.y ||
        rot.z !== obj.rotation.z
      ) {
        mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z)
        needsUpdate = true
      }
    }

    if (needsUpdate) {
      mesh.updateMatrix()
    }
  }
}