// src/packages/vis-3d/core/materials/MaterialManager.ts

import * as THREE from 'three'
import { LaneShaders } from './LaneShaders'

/**
 * 材质管理器
 * 统一管理和缓存所有材质，避免重复创建
 */
export class MaterialManager {
  private laneMaterials: Map<string, THREE.ShaderMaterial> = new Map()
  private basicMaterials: Map<string, THREE.MeshLambertMaterial> = new Map()
  private globalUniforms: Record<string, THREE.IUniform>

  constructor(globalUniforms: Record<string, THREE.IUniform>) {
    this.globalUniforms = globalUniforms
  }

  /**
   * 获取车道线材质
   */
  getLaneMaterial(shaderType: number, colorHex: number): THREE.ShaderMaterial {
    const key = `lane_${shaderType}_${colorHex}`
    
    if (this.laneMaterials.has(key)) {
      return this.laneMaterials.get(key)!
    }

    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...this.globalUniforms,
        color: { value: new THREE.Color(colorHex) },
        uType: { value: shaderType },
        dashSize: { value: 6.0 },
        ratio: { value: 0.5 }
      },
      vertexShader: LaneShaders.vertexShader,
      fragmentShader: LaneShaders.fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    })

    this.laneMaterials.set(key, material)
    return material
  }

  /**
   * 获取基础材质（用于多边形、图元等）
   */
  getBasicMaterial(color: { r: number; g: number; b: number; a: number }): THREE.MeshLambertMaterial {
    const key = `basic_${color.r}_${color.g}_${color.b}_${color.a}`
    
    if (this.basicMaterials.has(key)) {
      return this.basicMaterials.get(key)!
    }

    const colorHex = (color.r << 16) | (color.g << 8) | color.b
    const opacity = color.a / 255

    const material = new THREE.MeshLambertMaterial({
      color: colorHex,
      transparent: opacity < 0.95,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: true
    })

    this.basicMaterials.set(key, material)
    return material
  }

  /**
   * 清理所有材质
   */
  dispose() {
    this.laneMaterials.forEach(mat => mat.dispose())
    this.laneMaterials.clear()
    
    this.basicMaterials.forEach(mat => mat.dispose())
    this.basicMaterials.clear()
  }
}