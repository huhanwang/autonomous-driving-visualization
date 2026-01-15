// src/packages/vis-3d/core/renderers/PointCloudRenderer.ts

import * as THREE from 'three'
import { BaseRenderer } from './BaseRenderer'
import type { DecodedObject } from '@/core/protocol/VizDecoder'

// 定义 Shader 材质
const pointCloudShaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    size: { value: 3.0 },
    minIntensity: { value: 0.0 },
    maxIntensity: { value: 255.0 }, // 根据你的数据调整强度范围
    colorLow: { value: new THREE.Color(0x00ffff) },
    colorHigh: { value: new THREE.Color(0xff0000) }
  },
  vertexShader: `
    attribute float intensity;
    varying float vIntensity;
    uniform float size;
    void main() {
      vIntensity = intensity;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 colorLow;
    uniform vec3 colorHigh;
    uniform float minIntensity;
    uniform float maxIntensity;
    varying float vIntensity;
    void main() {
      float t = (vIntensity - minIntensity) / (maxIntensity - minIntensity);
      t = clamp(t, 0.0, 1.0);
      vec3 color = mix(colorLow, colorHigh, t);
      if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  transparent: false,
  depthWrite: true
})

export class PointCloudRenderer extends BaseRenderer {
  private material: THREE.ShaderMaterial

  constructor(scene: THREE.Scene) {
    super(scene, 'PointClouds')
    this.material = pointCloudShaderMaterial.clone()
  }

  update(objects: DecodedObject[]): void {
    const activeIds = new Set<string>()

    for (const obj of objects) {
      // 检查 obj.points 是否有效
      if (!obj.points || obj.points.count === 0) continue
      
      activeIds.add(obj.id)
      
      let points = this.objects.get(obj.id) as THREE.Points | undefined
      
      if (!points) {
        points = this.createPointCloud()
        points.userData = { id: obj.id }
        this.group.add(points)
        this.objects.set(obj.id, points)
      } 
      
      this.updatePointCloud(points, obj)
    }

    this.cleanup(activeIds)
  }

  private createPointCloud(): THREE.Points {
    const geometry = new THREE.BufferGeometry()
    const points = new THREE.Points(geometry, this.material)
    points.frustumCulled = false 
    return points
  }

  private updatePointCloud(points: THREE.Points, obj: DecodedObject) {
    if (!obj.points) return

    const geometry = points.geometry as THREE.BufferGeometry
    const decodedData = obj.points.data // Worker 传来的 Float32Array
    const stride = obj.points.stride    // 例如 4 (XYZI)
    const count = obj.points.count

    // 🌟 [核心优化] 使用 InterleavedBuffer (零拷贝直接映射 GPU)
    const interleavedBuffer = new THREE.InterleavedBuffer(decodedData, stride)
    interleavedBuffer.setUsage(THREE.DynamicDrawUsage)

    // 绑定 Position (Offset 0)
    geometry.setAttribute('position', 
      new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 0)
    )

    // 绑定 Intensity (Offset 3, 仅当 stride >= 4 时)
    if (stride >= 4) {
      geometry.setAttribute('intensity', 
        new THREE.InterleavedBufferAttribute(interleavedBuffer, 1, 3)
      )
    } else {
      geometry.deleteAttribute('intensity')
    }

    geometry.setDrawRange(0, count)
  }

  dispose() {
    this.material.dispose()
    super.dispose()
  }
}