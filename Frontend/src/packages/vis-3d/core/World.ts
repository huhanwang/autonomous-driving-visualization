// src/packages/vis-3d/core/World.ts
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
// 1. 引入 RGBELoader
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { LaneMeshGenerator } from './LaneMeshGenerator'
import { ObjectType, CoordinateSystem, SubType } from '@/core/protocol/VizDecoder'
import { layerManager } from '@/core/vis/LayerManager'

// Shader 类型枚举
enum ShaderType {
  SOLID = 0,
  DASHED = 1,
  DOUBLE_SOLID = 2,
  DOUBLE_DASHED = 3,
  LEFT_SOLID_RIGHT_DASHED = 4,
  RIGHT_SOLID_LEFT_DASHED = 5,
}

export class World {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  private container: HTMLElement
  private rootGroup: THREE.Group

  private lines: Map<string, THREE.Mesh> = new Map()
  
  // 材质缓存池 (Key: "Type_ColorHex")
  private materials: Map<string, THREE.ShaderMaterial> = new Map()

  constructor(container: HTMLElement) {
    this.container = container
    const width = container.clientWidth
    const height = container.clientHeight

    // 1. Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0a0a0a) // 稍微亮一点的黑，更有质感
    this.scene.fog = new THREE.FogExp2(0x0a0a0a, 0.003)

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000)
    this.camera.position.set(0, -60, 40)
    this.camera.up.set(0, 0, 1)

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        powerPreference: 'high-performance' 
    })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // 限制 DPR 提升性能
    
    // ========== [新增] 开启 ToneMapping 以支持 HDR ==========
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0 // 可以调整曝光度
    // ==========================================================

    container.appendChild(this.renderer.domElement)

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.1
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05
    
    // ========== [新增] 加载 HDR 环境光 ==========
    // 确保 public/env/qwantani_noon_puresky_2k.hdr 文件存在
    new RGBELoader()
      .setPath('/env/')
      .load('qwantani_noon_puresky_2k.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping
        
        // 设置环境光 (影响物体材质的反射和光照)
        this.scene.environment = texture
        
        // [可选] 如果你想让背景直接显示这个天空盒，取消下面这行的注释
        // this.scene.background = texture 
      }, undefined, (err) => {
        console.error('Failed to load HDR environment map:', err)
      })
    // ===========================================

    // 5. Root Group
    this.rootGroup = new THREE.Group()
    this.scene.add(this.rootGroup)

    const grid = new THREE.GridHelper(400, 40, 0x222222, 0x111111)
    grid.rotation.x = Math.PI / 2
    this.rootGroup.add(grid)
    this.rootGroup.add(new THREE.AxesHelper(5))

    this.animate()
  }

  /**
   * 获取或创建材质 (自动缓存)
   */
  private getMaterial(type: ShaderType, colorHex: number): THREE.ShaderMaterial {
    const key = `${type}_${colorHex}`
    if (this.materials.has(key)) {
      return this.materials.get(key)!
    }

    // --- 高级抗锯齿车道线 Shader ---
    const vertexShader = `
      varying vec2 vUv;
      varying float vDist; // 累积距离
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
      uniform float dashSize; // 周期 (实+空)
      uniform float ratio;    // 实线比例
      
      varying vec2 vUv;
      varying float vDist;

      void main() {
        float alpha = 1.0;
        
        // --- 1. 纵向虚线处理 (带抗锯齿) ---
        // 归一化距离 -> [0, 1] 周期
        float t = vDist / dashSize;
        float cycle = fract(t);
        
        // 计算导数用于抗锯齿 (fw 是像素宽度的梯度)
        float fw = fwidth(t); 
        
        // 虚线逻辑: 0~ratio 是实线, ratio~1 是空
        // 使用 smoothstep 做软边缘
        float dashAlpha = 1.0 - smoothstep(ratio - fw, ratio + fw, cycle);
        
        // --- 2. 横向双线处理 (带抗锯齿) ---
        float y = vUv.y;
        float fy = fwidth(y);
        
        // 边缘虚化 (让线看起来更圆润)
        float edgeAlpha = smoothstep(0.0, fy, y) * smoothstep(1.0, 1.0 - fy, y);
        
        // 双线中间镂空 (0.35 ~ 0.65)
        float centerGap = smoothstep(0.35 - fy, 0.35, y) * smoothstep(0.65 + fy, 0.65, y);
        float isDouble = 1.0 - centerGap; // 1=实, 0=空
        
        // --- 3. 组合逻辑 ---
        if (uType == 0) { // SOLID
            // 纯实线
        } 
        else if (uType == 1) { // DASHED
            alpha *= dashAlpha;
        } 
        else if (uType >= 2) { // DOUBLE 类
            alpha *= isDouble; // 先挖空中间
            
            if (uType == 3) { // DOUBLE_DASHED
                alpha *= dashAlpha;
            }
            else if (uType == 4) { // LEFT_SOLID_RIGHT_DASHED
                // 右边(y>0.5)应用虚线
                float isRight = step(0.5, y);
                alpha *= mix(1.0, dashAlpha, isRight);
            }
            else if (uType == 5) { // RIGHT_SOLID_LEFT_DASHED
                // 左边(y<0.5)应用虚线
                float isLeft = 1.0 - step(0.5, y);
                alpha *= mix(1.0, dashAlpha, isLeft);
            }
        }

        alpha *= edgeAlpha; // 应用边缘抗锯齿

        if (alpha < 0.05) discard; // 丢弃极透明像素以优化深度
        
        gl_FragColor = vec4(color, alpha * 0.9); // 0.9 基础透明度
      }
    `

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colorHex) },
        uType: { value: type },
        dashSize: { value: 6.0 }, // 6米一个周期
        ratio: { value: 0.5 }     // 3米实 3米空
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false, // 🌟 关键：半透明物体不写深度，防止互相遮挡产生黑边
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    })

    this.materials.set(key, mat)
    return mat
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  // 🌟 核心更新逻辑 (零 GC)
  public updateScene(renderables: any[]) {
    this.updateCoordinateSystem()
    const currentFrameIds = new Set<string>()

    for (const obj of renderables) {
      if (obj.type !== ObjectType.POLYLINE || !obj.points) continue
      
      currentFrameIds.add(obj.id)
      
      // 1. 解析样式
      let width = obj.size?.x || 0.15
      let shaderType = ShaderType.SOLID
      const colorHex = (obj.color.r << 16) | (obj.color.g << 8) | obj.color.b
      
      switch (obj.subType) {
        case SubType.LINE_DASHED:
        case SubType.LINE_SHORT_DASHED:
        case SubType.LINE_VIRTUAL:
          shaderType = ShaderType.DASHED; break;
        case SubType.LINE_DOUBLE_SOLID:
          shaderType = ShaderType.DOUBLE_SOLID; width *= 3.0; break;
        case SubType.LINE_DOUBLE_DASHED:
          shaderType = ShaderType.DOUBLE_DASHED; width *= 3.0; break;
        case SubType.LINE_LEFT_SOLID_RIGHT_DASHED:
          shaderType = ShaderType.LEFT_SOLID_RIGHT_DASHED; width *= 3.0; break;
        case SubType.LINE_RIGHT_SOLID_LEFT_DASHED:
          shaderType = ShaderType.RIGHT_SOLID_LEFT_DASHED; width *= 3.0; break;
        case SubType.LINE_SHADED_AREA:
          shaderType = ShaderType.SOLID; break;
        case SubType.LINE_CURB:
          width = Math.max(width, 0.3); break;
      }

      // 2. 获取 Mesh & Material
      let mesh = this.lines.get(obj.id)
      const targetMat = this.getMaterial(shaderType, colorHex)

      if (!mesh) {
        // 创建 Mesh
        const geometry = LaneMeshGenerator.createReusableGeometry()
        mesh = new THREE.Mesh(geometry, targetMat)
        
        mesh.frustumCulled = false 
        mesh.matrixAutoUpdate = false 
        mesh.updateMatrix()
        mesh.renderOrder = 1 // 保证在地面(0)之上

        mesh.name = obj.id
        this.rootGroup.add(mesh)
        this.lines.set(obj.id, mesh)
      } else {
        // 更新材质 (如果类型或颜色变了)
        if (mesh.material !== targetMat) {
           mesh.material = targetMat
        }
      }

      // 3. 更新几何体 (传入原始 TypedArray)
      LaneMeshGenerator.updateGeometry(
          mesh.geometry as THREE.BufferGeometry, 
          obj.points.data, 
          obj.points.stride, 
          obj.points.count, 
          width
      )
      
      mesh.visible = true
    }

    // 4. 清理残留
    for (const [id, line] of this.lines) {
      if (!currentFrameIds.has(id)) {
        this.rootGroup.remove(line)
        line.geometry.dispose() // 释放 VBO
        this.lines.delete(id)
      }
    }
  }

  private updateCoordinateSystem() {
    const sys = layerManager.currentCoordinateSystem
    this.rootGroup.rotation.set(0, 0, 0)
    this.rootGroup.scale.set(1, 1, 1)

    switch (sys) {
      case CoordinateSystem.RIGHT_HANDED_Z_UP_X_FWD: 
        this.rootGroup.rotation.z = Math.PI / 2; break;
      case CoordinateSystem.RIGHT_HANDED_Y_UP_X_RIGHT: 
        this.rootGroup.rotation.x = Math.PI / 2; break;
      case CoordinateSystem.LEFT_HANDED_Y_UP_X_RIGHT: 
        this.rootGroup.rotation.x = Math.PI / 2; this.rootGroup.scale.z = -1; break;
    }
    this.rootGroup.updateMatrix()
  }

  private animate = () => {
    requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  public dispose() {
    this.renderer.dispose()
    this.controls.dispose()
    this.materials.forEach(mat => mat.dispose())
  }
}