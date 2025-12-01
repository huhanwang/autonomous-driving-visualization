// Frontend/src/core/types/viz-standard.ts
// 可视化标准接口定义 (UI层的通用语言)

// ========== 1. 基础几何原语 (Primitives) ==========

export interface Point2D {
    x: number
    y: number
  }
  
  export interface Point3D {
    x: number
    y: number
    z: number
  }
  
  export interface Size2D {
    width: number
    height: number
  }
  
  export interface Size3D {
    width: number
    height: number
    depth: number
  }
  
  export interface Rotation3D {
    x: number // roll (弧度)
    y: number // pitch (弧度)
    z: number // yaw (弧度)
  }
  
  // ========== 2. 样式定义 (Styling) ==========
  
  export interface RenderStyle {
    color?: string       // 主色 (Hex/RGBA)
    fillColor?: string   // 填充色
    strokeColor?: string // 边框色
    strokeWidth?: number // 线宽
    size?: number        // 点大小
    opacity?: number     // 透明度 (0-1)
    zIndex?: number      // 层级
    visible?: boolean    // 是否可见
  }
  
  // ========== 3. 标准渲染对象 (Renderable Objects) ==========
  // 驱动层适配器(Adapter)的输出目标
  
  export type RenderableType = 
    | 'point' 
    | 'line' 
    | 'polyline' 
    | 'polygon' 
    | 'circle' 
    | 'text' 
    | 'image' 
    | 'mesh'
    | 'custom' // 预留给特殊对象
  
  /**
   * 所有渲染对象的基类
   */
  export interface BaseRenderable {
    id: string                  // 唯一标识 (通常是 "topic_index")
    type: RenderableType        // 类型标识
    category?: string           // 业务分类 (如 'obstacle', 'lane', 'trajectory')
    style?: RenderStyle         // 渲染样式
    meta?: Record<string, any>  // 原始数据引用 (用于点击交互、Tooltip显示)
    timestamp?: number          // 数据时间戳
  }
  
  /**
   * 2D/3D 点
   */
  export interface RenderablePoint extends BaseRenderable {
    type: 'point'
    position: Point3D // 2D场景忽略z轴
  }
  
  /**
   * 线段 (两点)
   */
  export interface RenderableLine extends BaseRenderable {
    type: 'line'
    start: Point3D
    end: Point3D
  }
  
  /**
   * 多段线 (轨迹/车道线)
   */
  export interface RenderablePolyline extends BaseRenderable {
    type: 'polyline'
    points: Point3D[]
    closed?: boolean // 是否闭合
  }
  
  /**
   * 多边形 (填充区域)
   */
  export interface RenderablePolygon extends BaseRenderable {
    type: 'polygon'
    points: Point3D[]
  }
  
  /**
   * 圆形 / 2D包围盒的简化表示
   */
  export interface RenderableCircle extends BaseRenderable {
    type: 'circle'
    center: Point3D
    radius: number
  }
  
  /**
   * 文本标签
   */
  export interface RenderableText extends BaseRenderable {
    type: 'text'
    position: Point3D
    text: string
    fontSize?: number
    anchor?: [number, number] // [0.5, 0.5] 中心对齐
  }
  
  /**
   * 图像 (如摄像头画面、地图瓦片)
   */
  export interface RenderableImage extends BaseRenderable {
    type: 'image'
    source: string      // Base64, Blob URL 或 资源ID
    format?: 'jpeg' | 'png' | 'webp'
    width?: number
    height?: number
    position?: Point3D  // 图像在世界坐标中的位置(可选)
    rotation?: Rotation3D // 图像旋转(可选)
  }
  
  /**
   * 3D 网格/模型 (如自车模型、3D包围盒)
   */
  export interface RenderableMesh extends BaseRenderable {
    type: 'mesh'
    position: Point3D
    rotation?: Rotation3D
    scale?: Point3D
    resourceId?: string // 引用外部模型资源ID (如 'car_model_01')
  }
  
  // 联合类型，方便使用
  export type RenderableObject = 
    | RenderablePoint 
    | RenderableLine 
    | RenderablePolyline 
    | RenderablePolygon 
    | RenderableCircle 
    | RenderableText 
    | RenderableImage
    | RenderableMesh