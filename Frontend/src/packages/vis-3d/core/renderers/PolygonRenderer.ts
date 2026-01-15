// src/packages/vis-3d/core/renderers/PolygonRenderer.ts (完整修复版)

import * as THREE from 'three'
import { BaseRenderer } from './BaseRenderer'
import { MaterialManager } from '../materials/MaterialManager'
import type { DecodedObject } from '@/core/protocol/VizDecoder'

export class PolygonRenderer extends BaseRenderer {
  private materialManager: MaterialManager
  
  // 🌟 [新增] 缓存每个多边形的数据指纹，用于检测变化
  private dataFingerprints: Map<string, string> = new Map()

  constructor(scene: THREE.Scene, materialManager: MaterialManager) {
    super(scene, 'Polygons')
    this.materialManager = materialManager
  }

  update(objects: DecodedObject[]): void {
    const activeIds = new Set<string>()

    for (const obj of objects) {
      if (!obj.points || obj.points.count < 3) continue
      
      activeIds.add(obj.id)
      
      // 🌟 [新增] 计算数据指纹
      const fingerprint = this.getDataFingerprint(obj)
      const oldFingerprint = this.dataFingerprints.get(obj.id)
      
      let mesh = this.objects.get(obj.id) as THREE.Mesh | undefined
      
      // 🌟 [关键] 如果数据变化了，重新创建
      if (!mesh || fingerprint !== oldFingerprint) {
        // 删除旧对象
        if (mesh) {
          this.group.remove(mesh)
          this.disposeObject(mesh)
        }
        
        // 创建新对象
        mesh = this.createPolygonMesh(obj)
        if (mesh) {
          mesh.userData = { id: obj.id, ...obj.properties }
          this.group.add(mesh)
          this.objects.set(obj.id, mesh)
          this.dataFingerprints.set(obj.id, fingerprint)
        }
      }
    }

    this.cleanup(activeIds)
  }

  /**
   * 🌟 [新增] 生成数据指纹，用于快速检测数据是否变化
   */
  private getDataFingerprint(obj: DecodedObject): string {
    if (!obj.points) return ''
    
    const p = obj.points.data
    const count = obj.points.count
    const stride = obj.points.stride
    
    // 只取前3个点和最后1个点作为指纹（性能优化）
    const samples: number[] = []
    
    for (let i = 0; i < Math.min(3, count); i++) {
      samples.push(p[i * stride], p[i * stride + 1])
      if (stride >= 3) samples.push(p[i * stride + 2])
    }
    
    if (count > 3) {
      const last = (count - 1) * stride
      samples.push(p[last], p[last + 1])
      if (stride >= 3) samples.push(p[last + 2])
    }
    
    // 包含点数信息
    return `${count}_${samples.join(',')}`
  }

  private createPolygonMesh(obj: DecodedObject): THREE.Mesh | null {
    const p = obj.points!.data
    const stride = obj.points!.stride
    let count = obj.points!.count

    // 检查首尾点是否重合
    const epsilon = 0.0001
    const firstX = p[0]
    const firstY = p[1]
    const firstZ = stride >= 3 ? p[2] : 0
    const lastX = p[(count - 1) * stride]
    const lastY = p[(count - 1) * stride + 1]
    const lastZ = stride >= 3 ? p[(count - 1) * stride + 2] : 0

    const isClosedLoop =
      Math.abs(firstX - lastX) < epsilon &&
      Math.abs(firstY - lastY) < epsilon &&
      Math.abs(firstZ - lastZ) < epsilon

    const actualCount = isClosedLoop ? count - 1 : count
    if (actualCount < 3) return null

    // 扇形三角剖分
    const positions: number[] = []

    for (let i = 1; i < actualCount - 1; i++) {
      positions.push(p[0], p[1], stride >= 3 ? p[2] : 0)
      positions.push(
        p[i * stride],
        p[i * stride + 1],
        stride >= 3 ? p[i * stride + 2] : 0
      )
      positions.push(
        p[(i + 1) * stride],
        p[(i + 1) * stride + 1],
        stride >= 3 ? p[(i + 1) * stride + 2] : 0
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )
    geometry.computeVertexNormals()

    const material = this.materialManager.getBasicMaterial(obj.color)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = 2

    return mesh
  }

  // 🌟 [重写] cleanup 方法，同时清理指纹缓存
  protected cleanup(activeIds: Set<string>) {
    for (const [id, obj] of this.objects) {
      if (!activeIds.has(id)) {
        this.group.remove(obj)
        this.disposeObject(obj)
        this.objects.delete(id)
        this.dataFingerprints.delete(id) // 清理指纹
      }
    }
  }

  // 🌟 [重写] dispose 方法
  dispose() {
    this.dataFingerprints.clear()
    super.dispose()
  }
}