// src/packages/vis-3d/core/renderers/LaneLineRenderer.ts

import * as THREE from 'three'
import { BaseRenderer } from './BaseRenderer'
import { LaneMeshGenerator } from '../geometry/LaneMeshGenerator'
import { MaterialManager } from '../materials/MaterialManager'
import { SubType, type DecodedObject } from '@/core/protocol/VizDecoder'

enum ShaderType {
  SOLID = 0,
  DASHED = 1,
  DOUBLE_SOLID = 2,
  DOUBLE_DASHED = 3,
  LEFT_SOLID_RIGHT_DASHED = 4,
  RIGHT_SOLID_LEFT_DASHED = 5,
}

/**
 * 车道线渲染器
 * 负责渲染所有 POLYLINE 类型的车道线
 */
export class LaneLineRenderer extends BaseRenderer {
  private materialManager: MaterialManager

  constructor(scene: THREE.Scene, materialManager: MaterialManager) {
    super(scene, 'LaneLines')
    this.materialManager = materialManager
  }

  update(objects: DecodedObject[]): void {
    const activeIds = new Set<string>()

    for (const obj of objects) {
      if (!obj.points || obj.points.count < 2) continue
      
      activeIds.add(obj.id)
      this.updateLaneLine(obj)
    }

    this.cleanup(activeIds)
  }

  private updateLaneLine(obj: DecodedObject) {
    // 1. 解析样式
    const style = this.parseStyle(obj)
    
    // 2. 获取材质
    const material = this.materialManager.getLaneMaterial(style.shaderType, style.color)
    
    // 3. 获取或创建 Mesh
    let mesh = this.objects.get(obj.id) as THREE.Mesh | undefined
    
    if (!mesh) {
      const geometry = LaneMeshGenerator.createReusableGeometry()
      mesh = new THREE.Mesh(geometry, material)
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      mesh.renderOrder = 1
      mesh.name = obj.id
      this.group.add(mesh)
      this.objects.set(obj.id, mesh)
    } else {
      if (mesh.material !== material) {
        mesh.material = material
      }
    }

    // 4. 更新几何体
    if (obj.points) {
      LaneMeshGenerator.updateGeometry(
        mesh.geometry as THREE.BufferGeometry,
        obj.points.data,
        obj.points.stride,
        obj.points.count,
        style.width
      )
    }
    
    mesh.visible = true
  }

  private parseStyle(obj: DecodedObject) {
    let width = obj.size?.x || 0.15
    let shaderType = ShaderType.SOLID
    const color = (obj.color.r << 16) | (obj.color.g << 8) | obj.color.b

    switch (obj.subType) {
      case SubType.LINE_DASHED:
      case SubType.LINE_SHORT_DASHED:
      case SubType.LINE_VIRTUAL:
        shaderType = ShaderType.DASHED
        break
      case SubType.LINE_DOUBLE_SOLID:
        shaderType = ShaderType.DOUBLE_SOLID
        width *= 3.0
        break
      case SubType.LINE_DOUBLE_DASHED:
        shaderType = ShaderType.DOUBLE_DASHED
        width *= 3.0
        break
      case SubType.LINE_LEFT_SOLID_RIGHT_DASHED:
        shaderType = ShaderType.LEFT_SOLID_RIGHT_DASHED
        width *= 3.0
        break
      case SubType.LINE_RIGHT_SOLID_LEFT_DASHED:
        shaderType = ShaderType.RIGHT_SOLID_LEFT_DASHED
        width *= 3.0
        break
      case SubType.LINE_SHADED_AREA:
        shaderType = ShaderType.SOLID
        break
      case SubType.LINE_CURB:
        width = Math.max(width, 0.3)
        break
    }

    return { shaderType, width, color }
  }
}