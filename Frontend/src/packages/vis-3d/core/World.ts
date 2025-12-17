import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { LaneMeshGenerator } from './LaneMeshGenerator'
import { ObjectType, CoordinateSystem, SubType } from '@/core/protocol/VizDecoder'
import { layerManager } from '@/core/vis/LayerManager'

enum ShaderType {
  SOLID = 0,
  DASHED = 1,
  DOUBLE_SOLID = 2,
  DOUBLE_DASHED = 3,
  LEFT_SOLID_RIGHT_DASHED = 4,
  RIGHT_SOLID_LEFT_DASHED = 5,
}

const VIS_CONFIG = {
  fogColor: new THREE.Color(0xddeeff), 
  gridColor: new THREE.Color(0x8899aa), // 稍微调深一点，更明显
  fogDensity: 0.0018,
  fogHeightFalloff: 0.045,
  fogHeightBias: -3.0 
}

const fogParsFragment = `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uFogHeightFalloff;
  uniform float uFogHeightBias;
  
  float getHeightFogFactor(float dist, float worldZ) {
    float fogDist = 1.0 - exp(-dist * uFogDensity);
    float heightFactor = exp(-uFogHeightFalloff * (worldZ - uFogHeightBias));
    heightFactor = clamp(heightFactor, 0.0, 1.0);
    return clamp(fogDist * 0.7 + heightFactor * 0.3 * fogDist, 0.0, 1.0);
  }
`

export class World {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  private container: HTMLElement
  private rootGroup: THREE.Group

  private lines: Map<string, THREE.Mesh> = new Map()
  private materials: Map<string, THREE.ShaderMaterial> = new Map()
  private groundGrid: THREE.Mesh | null = null

  private globalUniforms = {
    uTime: { value: 0 },
    uFogColor: { value: VIS_CONFIG.fogColor },
    uFogDensity: { value: VIS_CONFIG.fogDensity },
    uFogHeightFalloff: { value: VIS_CONFIG.fogHeightFalloff },
    uFogHeightBias: { value: VIS_CONFIG.fogHeightBias }
  }

  constructor(container: HTMLElement) {
    this.container = container
    const width = container.clientWidth
    const height = container.clientHeight

    this.scene = new THREE.Scene()
    this.scene.background = VIS_CONFIG.fogColor 

    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000)
    this.camera.position.set(50, 50, 50)
    this.camera.up.set(0, 0, 1)

    this.renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        powerPreference: 'high-performance',
        alpha: false 
    })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.renderer.shadowMap.enabled = false

    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.1
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02
    this.controls.target.set(0, 0, 0)
    
    this.setupEnvironment()
    this.createTransparentGround()
    
    this.rootGroup = new THREE.Group()
    this.scene.add(this.rootGroup)
    this.rootGroup.add(new THREE.AxesHelper(5))

    this.animate()
  }

  private setupEnvironment() {
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
    sunLight.position.set(100, 50, 100)
    sunLight.castShadow = false
    this.scene.add(sunLight)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9)
    this.scene.add(ambientLight)

    new HDRLoader()
      .setPath('/env/')
      .load('qwantani_noon_puresky_2k.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping
        this.scene.environment = texture
        this.scene.background = texture
        this.scene.backgroundRotation.set(Math.PI / 2, 0, 0)
        this.scene.environmentRotation.set(Math.PI / 2, 0, 0)
        this.scene.backgroundBlurriness = 0.02
      }, undefined, (err) => {
        console.warn('HDR load failed:', err)
      })
  }

  private createTransparentGround() {
    const geometry = new THREE.PlaneGeometry(4000, 4000, 1, 1)
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...this.globalUniforms,
        uGroundColor: { value: new THREE.Color(0x1a1f28) }, // 深色地面底色
        uGridColor: { value: new THREE.Color(0x6688aa) },   // 网格线颜色
        uScale: { value: 10.0 },
        uSubScale: { value: 2.0 }
      },
      transparent: true,  // 半透明
      depthWrite: true,   // 写入深度，避免漂浮感
      vertexShader: `
        varying vec3 vWorldPos;
        varying float vCamDist;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vCamDist = distance(cameraPosition, worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        ${fogParsFragment}
        
        uniform vec3 uGroundColor;
        uniform vec3 uGridColor;
        uniform float uScale;
        uniform float uSubScale;
        
        varying vec3 vWorldPos;
        varying float vCamDist;

        float grid(vec3 pos, float scale, float thickness) {
          vec2 coord = pos.xy / scale;
          vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
          float line = min(grid.x, grid.y);
          return 1.0 - smoothstep(0.0, thickness, line);
        }

        void main() {
          // 1. 地面底色（深色沥青）
          vec3 baseColor = uGroundColor;
          
          // 2. 添加网格线
          float mainGrid = grid(vWorldPos, uScale, 1.5);
          float subGrid = grid(vWorldPos, uSubScale, 1.2);
          
          // 网格随距离淡出
          float gridFade = 1.0 - smoothstep(50.0, 400.0, vCamDist);
          
          // 混合地面色和网格色
          vec3 finalColor = baseColor;
          finalColor = mix(finalColor, uGridColor, (mainGrid * 0.5 + subGrid * 0.2) * gridFade);
          
          // 3. 应用雾效
          float fogFactor = getHeightFogFactor(vCamDist, vWorldPos.z);
          finalColor = mix(finalColor, uFogColor, fogFactor);
          
          // 4. 地面透明度：近处半透明(0.85)，远处随雾完全透明
          float baseAlpha = 0.85; // 调整这个值控制地面透明度 (0.5-1.0)
          float finalAlpha = baseAlpha * (1.0 - fogFactor * 0.6);

          gl_FragColor = vec4(finalColor, finalAlpha);
        }
      `
    })

    this.groundGrid = new THREE.Mesh(geometry, material)
    this.groundGrid.position.z = -0.05 // 略低于车道线
    this.groundGrid.renderOrder = -1
    this.scene.add(this.groundGrid)
  }

  private getMaterial(type: ShaderType, colorHex: number): THREE.ShaderMaterial {
    const key = `${type}_${colorHex}`
    if (this.materials.has(key)) {
      return this.materials.get(key)!
    }

    const vertexShader = `
      varying vec2 vUv;
      varying float vDistLine;
      varying float vCamDist;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vDistLine = uv.x;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vCamDist = distance(cameraPosition, worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `

    const fragmentShader = `
      uniform vec3 color;
      uniform int uType;
      uniform float dashSize;
      uniform float ratio;
      ${fogParsFragment}
      varying vec2 vUv;
      varying float vDistLine;
      varying float vCamDist;
      varying vec3 vWorldPos;

      void main() {
        float alpha = 1.0;
        float t = vDistLine / dashSize;
        float cycle = fract(t);
        float fw = fwidth(t); 
        float dashAlpha = 1.0 - smoothstep(ratio - fw, ratio + fw, cycle);
        float y = vUv.y;
        float fy = fwidth(y);
        float edgeAlpha = smoothstep(0.0, fy, y) * smoothstep(1.0, 1.0 - fy, y);
        if (uType == 1) alpha *= dashAlpha;
        else if (uType >= 2) {
            float centerGap = smoothstep(0.35 - fy, 0.35, y) * smoothstep(0.65 + fy, 0.65, y);
            float isDouble = 1.0 - centerGap;
            alpha *= isDouble;
            if (uType == 3) alpha *= dashAlpha;
            else if (uType == 4) alpha *= mix(1.0, dashAlpha, step(0.5, y));
            else if (uType == 5) alpha *= mix(1.0, dashAlpha, 1.0 - step(0.5, y));
        }
        alpha *= edgeAlpha;
        if (alpha < 0.05) discard;
        
        float fogFactor = getHeightFogFactor(vCamDist, vWorldPos.z);
        vec3 renderColor = color * 1.2;
        vec3 finalColor = mix(renderColor, uFogColor, fogFactor);
        float fadeAlpha = 1.0 - smoothstep(1500.0, 3000.0, vCamDist);
        gl_FragColor = vec4(finalColor, alpha * fadeAlpha);
      }
    `

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.globalUniforms,
        color: { value: new THREE.Color(colorHex) },
        uType: { value: type },
        dashSize: { value: 6.0 }, 
        ratio: { value: 0.5 }     
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false, 
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    })

    this.materials.set(key, mat)
    return mat
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  public updateScene(renderables: any[]) {
    this.updateCoordinateSystem()
    const currentFrameIds = new Set<string>()

    for (const obj of renderables) {
      if (obj.type !== ObjectType.POLYLINE || !obj.points) continue
      currentFrameIds.add(obj.id)
      
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

      let mesh = this.lines.get(obj.id)
      const targetMat = this.getMaterial(shaderType, colorHex)

      if (!mesh) {
        const geometry = LaneMeshGenerator.createReusableGeometry()
        mesh = new THREE.Mesh(geometry, targetMat)
        mesh.frustumCulled = false 
        mesh.matrixAutoUpdate = false 
        mesh.updateMatrix()
        mesh.renderOrder = 1 
        mesh.name = obj.id
        this.rootGroup.add(mesh)
        this.lines.set(obj.id, mesh)
      } else {
        if (mesh.material !== targetMat) {
           mesh.material = targetMat
        }
      }

      LaneMeshGenerator.updateGeometry(
          mesh.geometry as THREE.BufferGeometry, 
          obj.points.data, 
          obj.points.stride, 
          obj.points.count, 
          width
      )
      mesh.visible = true
    }

    for (const [id, line] of this.lines) {
      if (!currentFrameIds.has(id)) {
        this.rootGroup.remove(line)
        line.geometry.dispose() 
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
    this.globalUniforms.uTime.value += 0.01 
    
    if (this.groundGrid) {
        this.groundGrid.position.x = this.camera.position.x
        this.groundGrid.position.y = this.camera.position.y
    }
    
    this.renderer.render(this.scene, this.camera)
  }

  public dispose() {
    this.renderer.dispose()
    this.controls.dispose()
    this.materials.forEach(mat => mat.dispose())
    if (this.groundGrid) {
        this.scene.remove(this.groundGrid)
        this.groundGrid.geometry.dispose()
        if (this.groundGrid.material instanceof THREE.Material) {
          this.groundGrid.material.dispose()
        }
    }
  }
}