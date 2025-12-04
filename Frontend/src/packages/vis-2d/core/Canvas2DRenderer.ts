import { ObjectType, type DecodedObject } from '@/core/protocol/VizDecoder'

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
    
    this.ctx.canvas.width = width * this.dpr
    this.ctx.canvas.height = height * this.dpr
    this.ctx.canvas.style.width = `${width}px`
    this.ctx.canvas.style.height = `${height}px`
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
    ctx.translate(width * dpr / 2, height * dpr / 2)
    const s = viewport.scale * dpr
    ctx.scale(s, s)
    const flipFactor = viewport.flipY ? 1 : -1
    ctx.scale(1, flipFactor) 
    if (viewport.rotation !== 0) ctx.rotate(viewport.rotation)
    ctx.translate(-viewport.x, -viewport.y)

    // 3. 绘制基础元素
    // 计算可见半径用于优化
    const visibleRadius = (Math.sqrt(width*width + height*height) * dpr) / s * 0.8
    
    this.drawGridAndRuler(viewport, visibleRadius)
    this.drawAxis(viewport)

    // 4. 绘制业务对象
    for (const obj of objects) {
      // ✅ 修复：传入 viewport 参数
      this.drawObject(obj, viewport)
    }
  }

  /**
   * 绘制测量工具的辅助线 (在 render 循环中调用)
   */
  drawMeasureLine(start: Point2D, end: Point2D, viewport: Viewport) {
    const { ctx, width, height, dpr } = this
    
    ctx.save()
    // 重新应用变换矩阵 (因为 render 结束后 context 可能已 restore)
    // 或者确保在 render 内部调用。这里假设独立调用，所以重设矩阵。
    ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset first
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
    
    // 线样式：黄色虚线，保持屏幕 1.5px 宽
    const lineWidth = 1.5 / (viewport.scale * dpr)
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
    ctx.moveTo(x - size, y)
    ctx.lineTo(x + size, y)
    ctx.moveTo(x, y - size)
    ctx.lineTo(x, y + size)
    ctx.setLineDash([])
    ctx.stroke()
  }

  private drawGridAndRuler(viewport: Viewport, range: number) {
    const { ctx } = this
    
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

    ctx.lineWidth = 1 / (viewport.scale * this.dpr)
    ctx.strokeStyle = '#333333'
    ctx.beginPath()
    for (let x = startX; x <= endX; x += step) {
      ctx.moveTo(x, startY); ctx.lineTo(x, endY)
    }
    for (let y = startY; y <= endY; y += step) {
      ctx.moveTo(startX, y); ctx.lineTo(endX, y)
    }
    ctx.stroke()

    // 绘制刻度值
    if (viewport.scale < 2) return

    const t = ctx.getTransform()
    const fontSize = 10 * this.dpr
    
    // 防变形文字绘制
    const drawSafeText = (text: string, wx: number, wy: number, offX: number, offY: number) => {
      const sx = t.a * wx + t.c * wy + t.e
      const sy = t.b * wx + t.d * wy + t.f
      
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0) 
      ctx.fillStyle = '#666666'
      ctx.font = `${fontSize}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, sx + offX * this.dpr, sy + offY * this.dpr)
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

  private drawAxis(viewport: Viewport) {
    const len = 2
    const lineWidth = 2 / (viewport.scale * this.dpr)
    this.ctx.lineWidth = lineWidth
    
    this.ctx.strokeStyle = '#ff4d4f'; this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.lineTo(len, 0); this.ctx.stroke()
    this.ctx.strokeStyle = '#52c41a'; this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.lineTo(0, len); this.ctx.stroke()
    
    const t = this.ctx.getTransform()
    const fontSize = 12 * this.dpr
    const drawLabel = (text: string, wx: number, wy: number, color: string) => {
        const sx = t.a * wx + t.c * wy + t.e
        const sy = t.b * wx + t.d * wy + t.f
        this.ctx.save()
        this.ctx.setTransform(1, 0, 0, 1, 0, 0)
        this.ctx.fillStyle = color
        this.ctx.font = `bold ${fontSize}px Arial`
        this.ctx.textAlign = 'center'
        this.ctx.textBaseline = 'middle'
        this.ctx.fillText(text, sx, sy)
        this.ctx.restore()
    }
    drawLabel('X', len + 0.4, 0, '#ff4d4f')
    drawLabel('Y', 0, len + 0.4, '#52c41a')
  }

  // ✅ 修复：添加 viewport 参数
  private drawObject(obj: DecodedObject, viewport: Viewport) {
    const ctx = this.ctx
    const { r, g, b, a } = obj.color
    const colorStyle = `rgba(${r},${g},${b},${a/255})`
    
    ctx.fillStyle = colorStyle
    ctx.strokeStyle = colorStyle
    // ✅ 修复：正确使用 viewport.scale
    ctx.lineWidth = 1 / (viewport.scale * this.dpr) 

    switch (obj.type) {
      case ObjectType.POINT_CLOUD:
        if (obj.points) {
          const size = 2 / (viewport.scale * this.dpr) * this.dpr 
          ctx.beginPath()
          const stride = obj.points.stride
          const data = obj.points.data
          const count = obj.points.count
          for (let i = 0; i < count; i++) {
            const idx = i * stride
            ctx.rect(data[idx] - size/2, data[idx+1] - size/2, size, size)
          }
          ctx.fill()
        }
        break

      case ObjectType.POLYLINE:
      case ObjectType.LINE_LIST: 
        if (obj.points && obj.points.count > 1) {
          ctx.beginPath()
          const stride = obj.points.stride
          const data = obj.points.data
          const count = obj.points.count
          ctx.moveTo(data[0], data[1])
          for (let i = 1; i < count; i++) {
            ctx.lineTo(data[i*stride], data[i*stride+1])
          }
          ctx.stroke()
        }
        break

      // ✅ [新增] 多边形渲染逻辑
      case ObjectType.POLYGON:
        if (obj.points && obj.points.count > 2) {
          ctx.beginPath()
          const stride = obj.points.stride
          const data = obj.points.data
          const count = obj.points.count
          
          ctx.moveTo(data[0], data[1])
          for (let i = 1; i < count; i++) {
            ctx.lineTo(data[i*stride], data[i*stride+1])
          }
          ctx.closePath() // 自动闭合
          
          // 填充半透明色
          ctx.fillStyle = colorStyle.replace(/[\d.]+\)$/, '0.4)') // 透明度 0.4
          ctx.fill()
          
          // 描边实色
          ctx.strokeStyle = colorStyle
          ctx.stroke()
        }
        break
      // ✅ [新增] 兼容 SPHERE (后端把行人映射为了 SPHERE)
      // 在 2D 下可以简化画一个实心圆
      case ObjectType.SPHERE: 
        if (obj.position) {
           // 半径：使用 size.x 的一半，或者默认值
           const radius = (obj.size?.x || 0.5) / 2
           ctx.beginPath()
           ctx.arc(obj.position.x, obj.position.y, radius, 0, Math.PI * 2)
           ctx.fillStyle = colorStyle
           ctx.fill()
           // 可选：加个描边区分
           ctx.lineWidth = 0.5 / (viewport.scale * this.dpr)
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
        ctx.lineWidth = 2 / (viewport.scale * this.dpr)
        ctx.stroke()
        ctx.fillStyle = colorStyle.replace(/[\d.]+\)$/, '0.2)')
        ctx.fill()
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(obj.size.x/2, 0); ctx.stroke()
        ctx.restore()
        break
    }
  }
}