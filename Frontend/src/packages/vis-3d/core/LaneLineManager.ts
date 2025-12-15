// src/packages/vis-3d/core/LaneLineManager.ts

import * as THREE from 'three'
import { LaneMeshGenerator } from './LaneMeshGenerator'
import { ObjectType, SubType, type DecodedObject } from '@/core/protocol/VizDecoder'

// 内部使用的 Shader 类型映射
enum ShaderType {
  SOLID = 0,
  DASHED = 1,
  DOUBLE_SOLID = 2,
  DOUBLE_DASHED = 3,
  LEFT_SOLID_RIGHT_DASHED = 4,
  RIGHT_SOLID_LEFT_DASHED = 5,
  // SHADED_AREA 已移除，改用 SOLID + 灰色
}

export class LaneLineManager {
  private group: THREE.Group
  
  // 对象池：ID -> Mesh
  private lines: Map<string, THREE.Mesh> = new Map()
  
  // 材质缓存池：Key -> Material
  // Key 格式: "${shaderType}_${colorHex}" (例如 "1_16776960" 表示黄色虚线)
  private materials: Map<string, THREE.ShaderMaterial> = new Map()

  constructor(root: THREE.Group) {
    this.group = new THREE.Group()
    this.group.name = 'LaneLines'
    root.add(this.group)
  }

  /**
   * 核心更新循环
   */
  public update(renderables: DecodedObject[]) {
    const currentFrameIds = new Set<string>()

    for (const obj of renderables) {
      // 只处理 POLYLINE 类型的车道线
      if (obj.type !== ObjectType.POLYLINE || !obj.points) continue
      
      currentFrameIds.add(obj.id)
      
      // 1. 准备数据
      const points: THREE.Vector3[] = []
      const raw = obj.points.data
      const stride = obj.points.stride
      const count = obj.points.count
      
      for (let i = 0; i < count; i++) {
        points.push(new THREE.Vector3(raw[i * stride], raw[i * stride + 1], raw[i * stride + 2]))
      }

      // 2. 确定样式 (Shader类型、宽度、颜色)
      const style = this.parseStyle(obj)

      // 3. 获取/创建 Mesh
      let mesh = this.lines.get(obj.id)
      
      // 获取对应的材质 (带颜色缓存)
      const targetMat = this.getMaterial(style.shaderType, style.color)

      if (!mesh) {
        // 创建新 Mesh
        const geometry = LaneMeshGenerator.createReusableGeometry()
        mesh = new THREE.Mesh(geometry, targetMat)
        
        // 性能设置
        mesh.frustumCulled = false 
        mesh.matrixAutoUpdate = false 
        mesh.updateMatrix()
        mesh.name = obj.id
        
        this.group.add(mesh)
        this.lines.set(obj.id, mesh)
      } else {
        // 只有当材质发生变化时才重新赋值 (例如从白色变黄色，或从虚线变实线)
        if (mesh.material !== targetMat) {
           mesh.material = targetMat
        }
      }

      // 4. 更新几何体
      LaneMeshGenerator.updateGeometry(mesh.geometry as THREE.BufferGeometry, points, style.width)
      mesh.visible = true
    }

    // 5. 清理残留
    this.cleanup(currentFrameIds)
  }

  private cleanup(activeIds: Set<string>) {
    for (const [id, line] of this.lines) {
      if (!activeIds.has(id)) {
        this.group.remove(line)
        line.geometry.dispose()
        this.lines.delete(id)
      }
    }
  }

  /**
   * 解析对象的渲染样式
   */
  private parseStyle(obj: DecodedObject) {
    let width = obj.size?.x || 0.15
    let shaderType = ShaderType.SOLID
    // 默认使用对象自带颜色，如果是 SHADED_AREA 则强制灰色
    let color = (obj.color.r << 16) | (obj.color.g << 8) | obj.color.b

    switch (obj.subType) {
      case SubType.LINE_DASHED:
      case SubType.LINE_SHORT_DASHED:
      case SubType.LINE_VIRTUAL:
        shaderType = ShaderType.DASHED; 
        break;

      case SubType.LINE_DOUBLE_SOLID:
        shaderType = ShaderType.DOUBLE_SOLID; width *= 3.0; 
        break;
        
      case SubType.LINE_DOUBLE_DASHED:
        shaderType = ShaderType.DOUBLE_DASHED; width *= 3.0; 
        break;
        
      case SubType.LINE_LEFT_SOLID_RIGHT_DASHED:
        shaderType = ShaderType.LEFT_SOLID_RIGHT_DASHED; width *= 3.0; 
        break;
        
      case SubType.LINE_RIGHT_SOLID_LEFT_DASHED:
        shaderType = ShaderType.RIGHT_SOLID_LEFT_DASHED; width *= 3.0; 
        break;
        
      case SubType.LINE_SHADED_AREA:
        // 🌟 需求修改：导流线改为灰色实线
        shaderType = ShaderType.SOLID; 
        // color = 0x00FFFF; // 强制灰色
        // width = Math.max(width, 0.3); // 稍微宽一点
        // width = 0.3; // 固定宽度
        break;

      case SubType.LINE_CURB:
         width = Math.max(width, 0.3);
         break;

      default: 
        shaderType = ShaderType.SOLID; 
        break;
    }
    
    return { shaderType, width, color }
  }

  /**
   * 获取或创建材质 (缓存机制)
   */
  private getMaterial(type: ShaderType, colorHex: number): THREE.ShaderMaterial {
    const key = `${type}_${colorHex}`
    
    if (this.materials.has(key)) {
      return this.materials.get(key)!
    }

    // 创建新材质
    const mat = this.createShaderMaterial(type, colorHex)
    this.materials.set(key, mat)
    return mat
  }

  private createShaderMaterial(type: ShaderType, colorHex: number) {
    const vertexShader = `
      varying vec2 vUv;
      varying float vDist;
      void main() {
        vUv = uv;
        vDist = uv.x;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `

    const fragmentShader = `
      uniform vec3 color;
      uniform int uType;
      uniform float dashSize;
      uniform float ratio;
      varying vec2 vUv;
      varying float vDist;
      
      void main() {
        float alpha = 1.0;
        
        float cycle = fract(vDist / dashSize);
        bool isDashHollow = (cycle > ratio);
        bool isCenterGap = (vUv.y > 0.33 && vUv.y < 0.66);
        bool isRightSide = (vUv.y > 0.5);

        if (uType == 1) { // DASHED
          if (isDashHollow) discard;
        } 
        else if (uType >= 2 && uType <= 5) { // DOUBLE
          if (isCenterGap) discard;
          if (uType == 3 && isDashHollow) discard; // Double Dash
          if (uType == 4 && isRightSide && isDashHollow) discard; // L_Solid_R_Dash
          if (uType == 5 && !isRightSide && isDashHollow) discard; // R_Solid_L_Dash
        }
        
        gl_FragColor = vec4(color, alpha);
      }
    `

    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colorHex) }, // 🌟 注入颜色
        uType: { value: type },
        dashSize: { value: 6.0 },
        ratio: { value: 0.5 }
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    })
  }

  public dispose() {
    this.lines.forEach(mesh => {
        this.group.remove(mesh)
        mesh.geometry.dispose()
    })
    this.lines.clear()
    
    this.materials.forEach(mat => mat.dispose())
    this.materials.clear()
    
    // 从父节点移除
    if (this.group.parent) {
        this.group.parent.remove(this.group)
    }
  }
}