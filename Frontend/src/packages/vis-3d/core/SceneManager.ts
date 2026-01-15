// src/packages/vis-3d/core/SceneManager.ts

import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { CoordinateSystem } from '@/core/protocol/VizDecoder'
import type { DecodeResult } from '@/core/protocol/VizDecoder'
// 🌟 修正引入路径
import { layerManager } from '@/core/vis/LayerManager'

// 导出全局实例
export let sceneManager: SceneManager

const VIS_CONFIG = {
  fogColor: new THREE.Color(0xddeeff),
  gridColor: new THREE.Color(0x6688aa),
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

export interface ISceneUpdater {
  update(deltaTime: number): void
  topicKey?: string 
}

// 惯性缓冲池大小 (帧)
const MAX_INERTIAL_BUFFER = 60

export class SceneManager {
  private scene: THREE.Scene
  private coordinateRoot: THREE.Group
  private groundGrid: THREE.Mesh | null = null
  private globalUniforms: Record<string, THREE.IUniform>

  private camera: THREE.Camera | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private isRunning: boolean = false
  private animationFrameId: number | null = null

  private targetFPS: number = 30
  private frameInterval: number = 1000 / 30
  private lastTime: number = 0

  private isPhysicsActive: boolean = false
  private updaters: Set<ISceneUpdater> = new Set()
  private isProcessingData: boolean = false

  // ========== 🌟 [核心数据结构：动静分离] ==========
  
  // 1. 极速插槽 (播放时专用)
  // 只存最新一帧，随来随覆盖，没有任何队列操作开销
  private latestFrame: DecodeResult | null = null
  
  // 2. 惯性队列 (暂停时专用)
  // 接住暂停瞬间还在网络上飞的数据，保证画面连续性
  private inertialQueue: DecodeResult[] = [] 

  // 控制位
  private isPaused: boolean = false
  private oneTimeToken: boolean = false

  constructor(scene: THREE.Scene) {
    sceneManager = this
    this.scene = scene
    this.scene.background = VIS_CONFIG.fogColor
    this.globalUniforms = {
      uTime: { value: 0 },
      uFogColor: { value: VIS_CONFIG.fogColor },
      uFogDensity: { value: VIS_CONFIG.fogDensity },
      uFogHeightFalloff: { value: VIS_CONFIG.fogHeightFalloff },
      uFogHeightBias: { value: VIS_CONFIG.fogHeightBias }
    }
    this.coordinateRoot = new THREE.Group()
    this.coordinateRoot.name = 'CoordinateRoot'
    this.scene.add(this.coordinateRoot)
    this.setupLights()
    this.setupEnvironment()
    this.createGround()
    this.coordinateRoot.add(new THREE.AxesHelper(5))
  }
  
  initLoop(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    this.renderer = renderer
    this.camera = camera
    this.start()
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.lastTime = performance.now()
    this.loop()
    console.log('[SceneManager] Render loop started')
  }

  stop() {
    this.isRunning = false
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  // ========== 🌟 [核心逻辑：智能分流] ==========
  handleDecodedFrame(frame: DecodeResult) {
    if (!this.isPaused) {
      // ✅ 场景 A：播放中 (极速模式)
      // 直接覆盖 latestFrame，保证主线程绝对流畅
      this.latestFrame = frame
      
      // 顺便清空惯性队列，因为播放了一切历史都失效了
      if (this.inertialQueue.length > 0) {
        this.inertialQueue = []
      }
    } else {
      // ✅ 场景 B：暂停中 (捕获模式)
      // 将惯性数据存入队列，防止跳变
      
      if (this.inertialQueue.length < MAX_INERTIAL_BUFFER) {
        this.inertialQueue.push(frame)
      } else {
        // 队列满了：拒绝新数据 (Drop Newest)
        // 策略：保留紧接着暂停那一刻的数据 (N+1, N+2...)
      }
    }
  }

  // ========== 🌟 [控制接口] ==========
  setPaused(paused: boolean) {
    this.isPaused = paused
    if (paused) {
      // 暂停瞬间：不做任何清空！
      // 开启 inertialQueue 准备接收后续飞来的数据
      this.oneTimeToken = false
    } else {
      // 恢复播放：清空积压，轻装上阵
      this.inertialQueue = []
      this.latestFrame = null
    }
  }

  expectNextFrame() {
    this.oneTimeToken = true
  }

  registerUpdater(updater: ISceneUpdater) { this.updaters.add(updater) }
  unregisterUpdater(updater: ISceneUpdater) { this.updaters.delete(updater) }
  setPhysicsActive(active: boolean) { this.isPhysicsActive = active }

  // ========== 🌟 [渲染循环：智能消费] ==========
  private loop = (time: number = performance.now()) => {
    if (!this.isRunning) return
    this.animationFrameId = requestAnimationFrame(this.loop)

    const deltaTime = time - this.lastTime
    if (deltaTime < this.frameInterval) return
    this.lastTime = time - (deltaTime % this.frameInterval)

    this.updateLogic(deltaTime)
    
    // --- 消费逻辑 ---
    let frameToRender: DecodeResult | undefined | null = null

    if (!this.isPaused) {
      // 🟢 播放时：只看最新帧 (Latest Frame)
      if (this.latestFrame) {
        frameToRender = this.latestFrame
        this.latestFrame = null // 消费掉
      }
    } else {
      // 🔴 暂停时：
      if (this.oneTimeToken) {
        // 🟡 单步调试：优先吃惯性队列里的存货
        if (this.inertialQueue.length > 0) {
           frameToRender = this.inertialQueue.shift()
        } else if (this.latestFrame) {
           // 极少数情况：暂停瞬间的数据卡在 latestFrame 里，拿来用
           frameToRender = this.latestFrame
           this.latestFrame = null
        }
        
        // 只有真的渲染了数据，才消耗令牌
        if (frameToRender) {
          this.oneTimeToken = false
        }
      }
    }

    if (frameToRender) {
      this.consumeFrameData(frameToRender)
    }

    if (this.renderer && this.camera) {
      this.renderer.render(this.scene, this.camera)
    }
  }

  private updateLogic(deltaTime: number) {
    this.updateTime(deltaTime)
    if (this.camera && this.groundGrid) this.updateGround(this.camera.position)
    if (this.isPhysicsActive) {
      this.updaters.forEach(u => { try { u.update(deltaTime) } catch(e){} })
    }
  }

  private consumeFrameData(data: DecodeResult) {
    if (this.isProcessingData) return
    this.isProcessingData = true
    try {
       layerManager.updateScene(data)
    } catch (e) {
      console.error('[SceneManager] Failed to apply frame data:', e)
    } finally {
      this.isProcessingData = false
    }
  }

  // ... (常规辅助方法) ...
  private setupLights() {
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
    sunLight.position.set(100, 50, 100)
    this.scene.add(sunLight)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))
  }
  private setupEnvironment() {
    const hdrLoader = new HDRLoader()
    hdrLoader.setPath('/env/').load('qwantani_noon_puresky_2k.hdr', (t) => {
        t.mapping = THREE.EquirectangularReflectionMapping
        this.scene.environment = t; this.scene.background = t
        this.scene.backgroundRotation.set(Math.PI/2,0,0); this.scene.environmentRotation.set(Math.PI/2,0,0)
        this.scene.backgroundBlurriness = 0.02
      }, undefined, (e) => console.warn('[SceneManager] HDR error', e))
  }
  private createGround() {
    const geometry = new THREE.PlaneGeometry(4000, 4000, 1, 1)
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...this.globalUniforms,
        uGroundColor: { value: new THREE.Color(0x1a1f28) },
        uGridColor: { value: new THREE.Color(0x6688aa) },
        uScale: { value: 10.0 }, uSubScale: { value: 2.0 }
      },
      transparent: true, depthWrite: true,
      vertexShader: `varying vec3 vWorldPos;varying float vCamDist;void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorldPos=p.xyz;vCamDist=distance(cameraPosition,p.xyz);gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `${fogParsFragment}
        uniform vec3 uGroundColor;uniform vec3 uGridColor;uniform float uScale;uniform float uSubScale;varying vec3 vWorldPos;varying float vCamDist;
        float grid(vec3 p,float s,float t){vec2 c=p.xy/s;vec2 g=abs(fract(c-0.5)-0.5)/fwidth(c);float l=min(g.x,g.y);return 1.0-smoothstep(0.0,t,l);}
        void main(){vec3 c=uGroundColor;float mg=grid(vWorldPos,uScale,1.5);float sg=grid(vWorldPos,uSubScale,1.2);float f=1.0-smoothstep(50.0,400.0,vCamDist);vec3 fc=mix(c,uGridColor,(mg*0.5+sg*0.2)*f);float ff=getHeightFogFactor(vCamDist,vWorldPos.z);fc=mix(fc,uFogColor,ff);gl_FragColor=vec4(fc,0.85*(1.0-ff*0.6));}`
    })
    this.groundGrid = new THREE.Mesh(geometry, material)
    this.groundGrid.position.z = -0.05
    this.groundGrid.renderOrder = -1
    this.scene.add(this.groundGrid)
  }
  updateCoordinateSystem(sys: CoordinateSystem) {
    this.coordinateRoot.rotation.set(0,0,0); this.coordinateRoot.scale.set(1,1,1)
    switch (sys) {
      case CoordinateSystem.RIGHT_HANDED_Z_UP_X_FWD: this.coordinateRoot.rotation.z=-Math.PI/2; break
      case CoordinateSystem.RIGHT_HANDED_Y_UP_X_RIGHT: this.coordinateRoot.rotation.x=Math.PI/2; break
      case CoordinateSystem.LEFT_HANDED_Y_UP_X_RIGHT: this.coordinateRoot.rotation.x=Math.PI/2; this.coordinateRoot.scale.z=-1; break
    }
    this.coordinateRoot.updateMatrix()
  }
  updateGround(p: THREE.Vector3) { if(this.groundGrid){this.groundGrid.position.x=p.x;this.groundGrid.position.y=p.y} }
  updateTime(d: number) { this.globalUniforms.uTime.value += d }
  getCoordinateRoot() { return this.coordinateRoot }
  getGlobalUniforms() { return this.globalUniforms }
  setTargetFPS(fps: number) { this.targetFPS = fps; this.frameInterval = 1000 / fps }
  dispose() { this.stop(); this.groundGrid?.geometry.dispose(); this.updaters.clear() }
}