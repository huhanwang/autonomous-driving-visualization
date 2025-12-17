// src/packages/vis-2d/core/Canvas2DRenderer.ts

import { ObjectType, SubType, type DecodedObject } from '@/core/protocol/VizDecoder'

export interface Viewport {
  x: number      
  y: number      
  scale: number  
  rotation: number 
  flipY: boolean   
}

export interface Point2D {
  x: number
  y: number
}

// 内部样式接口
interface LineStyle {
  isDouble: boolean
  isMixed: boolean       // 是否混合线 (如左实右虚)
  dash: number[]         // 虚线参数 [实, 空] (单位: 米)
  lineWidthScale: number // 线宽倍率
  leftDashed?: boolean   // 混合线专用: 左侧是否虚线
  rightDashed?: boolean  // 混合线专用: 右侧是否虚线
  colorScale?: number    // 颜色亮度调整 (可选)
}

/**
 * 样式工厂：将 SubType 映射为渲染样式
 */
class LineStyler {
  static getStyle(subType: SubType): LineStyle {
    // 默认样式: 单实线
    const baseStyle: LineStyle = { 
      isDouble: false, 
      isMixed: false, 
      dash: [], 
      lineWidthScale: 1.0 
    }
    
    switch (subType) {
      // --- 虚线类 ---
      case SubType.LINE_DASHED:
        return { ...baseStyle, dash: [3, 3] } // 3米实 3米空
        
      case SubType.LINE_SHORT_DASHED:
        return { ...baseStyle, dash: [1, 2] } // 短虚线
        
      case SubType.LINE_VIRTUAL:
        return { ...baseStyle, dash: [0.5, 1], lineWidthScale: 0.8 } // 虚拟线: 细虚线

      // --- 双线类 ---
      case SubType.LINE_DOUBLE_SOLID:
        return { ...baseStyle, isDouble: true } // 双实线
        
      case SubType.LINE_DOUBLE_DASHED:
        return { ...baseStyle, isDouble: true, dash: [3, 3] } // 双虚线

      // --- 混合类 ---
      case SubType.LINE_LEFT_SOLID_RIGHT_DASHED:
        return { 
          ...baseStyle, 
          isDouble: true, 
          isMixed: true, 
          leftDashed: false, 
          rightDashed: true, 
          dash: [3, 3] 
        }
        
      case SubType.LINE_RIGHT_SOLID_LEFT_DASHED:
        return { 
          ...baseStyle, 
          isDouble: true, 
          isMixed: true, 
          leftDashed: true, 
          rightDashed: false, 
          dash: [3, 3] 
        }
        
      // --- 特殊类 ---
      case SubType.LINE_CURB:
        return { ...baseStyle, lineWidthScale: 2.0 } // 路沿加粗
        
      default: // LINE_SOLID
        return baseStyle
    }
  }
}

export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D
  private width: number = 0
  private height: number = 0
  private dpr: number = 1

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Failed to get 2d context')
    this.ctx = context
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.dpr = window.devicePixelRatio || 1
    
    // ✅ 1. 只设置画布的“分辨率”属性 (Attribute)
    this.ctx.canvas.width = width * this.dpr
    this.ctx.canvas.height = height * this.dpr
    
    // ❌ 2. 【删除或注释掉】这两行设置样式的代码
    // CSS 会负责处理显示大小，不要在这里用 JS 强制写死，否则会跟 Flexbox 冲突
    // this.ctx.canvas.style.width = `${width}px` 
    // this.ctx.canvas.style.height = `${height}px`
    
    // 💡 补充：如果你的绘制逻辑依赖 scale，可能需要根据 dpr 调整，
    // 但你下方的 render 方法里已经处理了 dpr (ctx.scale(s, s))，所以这里不需要额外操作。
  }

  /**
   * 屏幕坐标转世界坐标 (用于鼠标交互)
   */
  screenToWorld(sx: number, sy: number, viewport: Viewport): Point2D {
    const { width, height } = this
    
    // 1. 屏幕中心校正
    let dx = (sx - width / 2)
    let dy = (sy - height / 2)

    // 2. 逆缩放
    dx /= viewport.scale
    dy /= viewport.scale

    // 3. 逆翻转 (Y轴)
    const flipFactor = viewport.flipY ? 1 : -1
    dy /= flipFactor

    // 4. 逆旋转
    const r = -viewport.rotation 
    const cos = Math.cos(r)
    const sin = Math.sin(r)
    
    const wx_rot = dx * cos - dy * sin
    const wy_rot = dx * sin + dy * cos

    // 5. 加上摄像机位置
    return {
      x: viewport.x + wx_rot,
      y: viewport.y + wy_rot
    }
  }

  render(objects: DecodedObject[], viewport: Viewport) {
    const { ctx, width, height, dpr } = this
    
    // 1. 清空画布
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#1e1e1e'
    ctx.fillRect(0, 0, width * dpr, height * dpr)

    // 2. 建立变换矩阵 (World -> Screen)
    // 技巧：我们直接在 World 空间绘图 (单位: 米)，依靠 scale 缩放到屏幕像素
    ctx.translate(width * dpr / 2, height * dpr / 2)
    const s = viewport.scale * dpr
    ctx.scale(s, s)
    const flipFactor = viewport.flipY ? 1 : -1
    ctx.scale(1, flipFactor) 
    if (viewport.rotation !== 0) ctx.rotate(viewport.rotation)
    ctx.translate(-viewport.x, -viewport.y)

    // 3. 绘制基础元素
    const visibleRadius = (Math.sqrt(width*width + height*height) * dpr) / s * 0.8
    this.drawGridAndRuler(viewport, visibleRadius)
    this.drawAxis()

    // 4. 绘制业务对象
    // 计算最小像素宽对应的物理宽度 (1px 在当前缩放下是多少米)
    // 防止缩放时线条消失
    const minPhysicalWidth = 1.0 / s

    for (const obj of objects) {
      if (!obj.visible) continue
      this.drawObject(obj, minPhysicalWidth)
    }
  }

  private drawObject(obj: DecodedObject, minWidth: number) {
    const ctx = this.ctx
    const { r, g, b, a } = obj.color
    const colorStyle = `rgba(${r},${g},${b},${a/255})`
    
    ctx.fillStyle = colorStyle
    ctx.strokeStyle = colorStyle
    
    // 基础线宽处理
    // 如果对象自带 size.x (物理宽度)，则使用之，否则默认 0.15m
    let baseWidth = obj.size?.x || 0.15
    if (baseWidth < minWidth) baseWidth = minWidth

    switch (obj.type) {
      case ObjectType.POLYLINE:
      case ObjectType.LINE_LIST: // 简单作为 Polyline 处理
        if (obj.points && obj.points.count > 1) {
          const style = LineStyler.getStyle(obj.subType)
          const finalWidth = baseWidth * style.lineWidthScale
          
          if (style.isDouble) {
            // 🌟 双线绘制
            this.drawDoublePolyline(obj, finalWidth, style, minWidth)
          } else {
            // 单线绘制
            ctx.lineWidth = finalWidth
            ctx.setLineDash(style.dash)
            this.drawSimplePolyline(obj)
            ctx.setLineDash([]) // 还原
          }
        }
        break

      case ObjectType.POLYGON:
        if (obj.points && obj.points.count > 2) {
          ctx.beginPath()
          const { data, stride, count } = obj.points
          ctx.moveTo(data[0], data[1])
          for (let i = 1; i < count; i++) {
            ctx.lineTo(data[i*stride], data[i*stride+1])
          }
          ctx.closePath()
          
          // 填充半透明
          ctx.fillStyle = colorStyle.replace(/[\d.]+\)$/, '0.4)')
          ctx.fill()
          // 描边
          ctx.lineWidth = minWidth // 至少 1px
          ctx.setLineDash([])
          ctx.stroke()
        }
        break

      case ObjectType.POINT_CLOUD:
        if (obj.points) {
          // 点云画成小矩形，固定屏幕大小或者物理大小
          const size = Math.max(0.1, minWidth * 2) 
          ctx.beginPath()
          const { data, stride, count } = obj.points
          for (let i = 0; i < count; i++) {
            const idx = i * stride
            ctx.rect(data[idx] - size/2, data[idx+1] - size/2, size, size)
          }
          ctx.fill()
        }
        break

      case ObjectType.SPHERE: 
        if (obj.position) {
           const radius = Math.max((obj.size?.x || 0.5) / 2, minWidth * 2)
           ctx.beginPath()
           ctx.arc(obj.position.x, obj.position.y, radius, 0, Math.PI * 2)
           ctx.fillStyle = colorStyle
           ctx.fill()
           ctx.lineWidth = minWidth
           ctx.strokeStyle = 'rgba(255,255,255,0.8)'
           ctx.stroke()
        }
        break

      case ObjectType.CUBE:
        ctx.save()
        ctx.translate(obj.position.x, obj.position.y)
        ctx.rotate(obj.rotation.z)
        ctx.beginPath()
        ctx.rect(-obj.size.x/2, -obj.size.y/2, obj.size.x, obj.size.y)
        ctx.lineWidth = Math.max(0.05, minWidth)
        ctx.stroke()
        ctx.fillStyle = colorStyle.replace(/[\d.]+\)$/, '0.2)')
        ctx.fill()
        // 画个箭头表示朝向
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(obj.size.x/2, 0); ctx.stroke()
        ctx.restore()
        break
    }
  }

  // 基础单线绘制
  private drawSimplePolyline(obj: DecodedObject) {
    const ctx = this.ctx
    const { data, stride, count } = obj.points!
    
    ctx.beginPath()
    ctx.moveTo(data[0], data[1])
    for (let i = 1; i < count; i++) {
      ctx.lineTo(data[i*stride], data[i*stride+1])
    }
    ctx.stroke()
  }

  /**
   * 🌟 双线绘制算法
   * 计算法线方向，向左右偏移，画两次
   */
  private drawDoublePolyline(obj: DecodedObject, width: number, style: LineStyle, minWidth: number) {
    const ctx = this.ctx
    const { data, stride, count } = obj.points!
    
    // 计算偏移量：线宽的 1.5 倍以上，保证中间有空隙
    const offsetDist = Math.max(width * 2.0, minWidth * 2.5)

    const leftPath: Point2D[] = []
    const rightPath: Point2D[] = []

    for (let i = 0; i < count; i++) {
      const idx = i * stride
      const curr = { x: data[idx], y: data[idx+1] }
      
      // 计算切线方向 (简单的差分)
      let next
      if (i < count - 1) {
        const nextIdx = (i + 1) * stride
        next = { x: data[nextIdx], y: data[nextIdx+1] }
      } else {
        // 末端点使用前一个点的切线
        const prevIdx = (i - 1) * stride
        const prev = { x: data[prevIdx], y: data[prevIdx+1] }
        next = { x: curr.x + (curr.x - prev.x), y: curr.y + (curr.y - prev.y) }
      }

      const dx = next.x - curr.x
      const dy = next.y - curr.y
      const len = Math.sqrt(dx*dx + dy*dy)
      
      if (len > 0.0001) {
        // 法线 (Normal): (-dy, dx)
        const nx = -dy / len
        const ny = dx / len
        
        // 生成左右点
        leftPath.push({ 
          x: curr.x + nx * offsetDist * 0.5, 
          y: curr.y + ny * offsetDist * 0.5 
        })
        rightPath.push({ 
          x: curr.x - nx * offsetDist * 0.5, 
          y: curr.y - ny * offsetDist * 0.5 
        })
      }
    }

    // 绘制 Left Line
    ctx.lineWidth = width
    if (style.isMixed) {
        ctx.setLineDash(style.leftDashed ? style.dash : [])
    } else {
        ctx.setLineDash(style.dash) // 双虚线或双实线
    }
    this.drawPath(leftPath)

    // 绘制 Right Line
    if (style.isMixed) {
        ctx.setLineDash(style.rightDashed ? style.dash : [])
    } else {
        ctx.setLineDash(style.dash)
    }
    this.drawPath(rightPath)
    
    ctx.setLineDash([]) // Reset
  }

  private drawPath(points: Point2D[]) {
    if (points.length < 2) return
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.stroke()
  }

  // ========== 辅助绘制方法 ==========

  drawMeasureLine(start: Point2D, end: Point2D, viewport: Viewport) {
    const { ctx, width, height, dpr } = this
    
    ctx.save()
    // 重置并应用变换，确保在正确的坐标系下绘制
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.translate(width * dpr / 2, height * dpr / 2)
    const s = viewport.scale * dpr
    ctx.scale(s, s)
    const flipFactor = viewport.flipY ? 1 : -1
    ctx.scale(1, flipFactor) 
    if (viewport.rotation !== 0) ctx.rotate(viewport.rotation)
    ctx.translate(-viewport.x, -viewport.y)

    // 绘制虚线
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    
    // 保持屏幕像素宽度 (反算世界宽度)
    const lineWidth = 1.5 / s
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = '#ffff00'
    ctx.setLineDash([5 * lineWidth, 5 * lineWidth]) 
    ctx.stroke()
    
    // 绘制端点十字
    const size = 5 * lineWidth
    this.drawCross(ctx, start.x, start.y, size)
    this.drawCross(ctx, end.x, end.y, size)

    ctx.restore()
  }

  private drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.beginPath()
    ctx.moveTo(x - size, y); ctx.lineTo(x + size, y)
    ctx.moveTo(x, y - size); ctx.lineTo(x, y + size)
    ctx.setLineDash([])
    ctx.stroke()
  }

  private drawGridAndRuler(viewport: Viewport, range: number) {
    const { ctx, dpr } = this
    
    let step = 1
    if (viewport.scale > 100) step = 0.5
    else if (viewport.scale > 20) step = 1
    else if (viewport.scale > 5) step = 10
    else if (viewport.scale > 1) step = 50
    else step = 100

    const startX = Math.floor((viewport.x - range) / step) * step
    const endX = Math.floor((viewport.x + range) / step) * step
    const startY = Math.floor((viewport.y - range) / step) * step
    const endY = Math.floor((viewport.y + range) / step) * step

    ctx.lineWidth = 1 / (viewport.scale * dpr)
    ctx.strokeStyle = '#333333'
    ctx.beginPath()
    for (let x = startX; x <= endX; x += step) {
      ctx.moveTo(x, startY); ctx.lineTo(x, endY)
    }
    for (let y = startY; y <= endY; y += step) {
      ctx.moveTo(startX, y); ctx.lineTo(endX, y)
    }
    ctx.stroke()

    // 绘制刻度值 (仅在缩放足够大时)
    if (viewport.scale < 2) return

    const t = ctx.getTransform()
    const fontSize = 10 * dpr
    
    const drawSafeText = (text: string, wx: number, wy: number, offX: number, offY: number) => {
      // 将世界坐标转回屏幕坐标绘制文字，防止文字变形
      const sx = t.a * wx + t.c * wy + t.e
      const sy = t.b * wx + t.d * wy + t.f
      
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0) 
      ctx.fillStyle = '#666666'
      ctx.font = `${fontSize}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, sx + offX * dpr, sy + offY * dpr)
      ctx.restore()
    }

    for (let x = startX; x <= endX; x += step) {
      if (Math.abs(x) < 0.001) continue
      if (Math.abs(x - viewport.x) < range) drawSafeText(x.toString(), x, 0, 0, 12)
    }
    for (let y = startY; y <= endY; y += step) {
      if (Math.abs(y) < 0.001) continue
      if (Math.abs(y - viewport.y) < range) drawSafeText(y.toString(), 0, y, -15, 0)
    }
    
    drawSafeText("0", 0, 0, -8, 12)
  }

  // 🌟 修正版：直接在世界空间绘制
  private drawAxis() {
      const { ctx, dpr } = this
      
      // 1. 设置线宽 (使其在屏幕上始终为 2px)
      // 当前变换矩阵的缩放因子是 viewport.scale * dpr
      // 我们希望屏幕宽度 = 2px，所以世界宽度 = 2 / (viewport.scale * dpr)
      // 更简单的获取方式是读取当前矩阵的 a 值 (如果没旋转) 或 hypot(a, b)
      const t = ctx.getTransform()
      const scale = Math.hypot(t.a, t.b)
      
      ctx.lineWidth = 2 / scale
      
      // 2. 绘制 X 轴 (红)
      const len = 2 // 轴长 2米
      ctx.strokeStyle = '#ff4d4f'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(len, 0)
      ctx.stroke()
      
      // 3. 绘制 Y 轴 (绿)
      ctx.strokeStyle = '#52c41a'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, len)
      ctx.stroke()
      
      // 4. 绘制文字 (保持屏幕方向)
      // 这一步比较 tricky，因为如果世界旋转了，文字也会旋转。
      // 如果希望文字始终正向显示，我们需要临时抵消旋转。
      
      ctx.save()
      ctx.fillStyle = '#ff4d4f'
      ctx.font = `bold ${12/scale}px Arial` // 字体大小也反向缩放
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // 绘制 X
      // 如果不想让文字旋转，可以重置矩阵，但那就得算屏幕坐标
      // 简单方案：直接画在世界坐标，随世界旋转 (这样你知道哪个是 X 轴正方向)
      ctx.fillText('X', len + 0.2, 0)
      
      // 绘制 Y
      ctx.fillStyle = '#52c41a'
      ctx.fillText('Y', 0, len + 0.2)
      
      ctx.restore()
  }
}