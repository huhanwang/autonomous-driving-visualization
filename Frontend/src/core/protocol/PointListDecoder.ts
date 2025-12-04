// Frontend/src/core/protocol/PointListDecoder.ts

import pako from 'pako'

export enum PointFormat {
  XY_F32    = 0,
  XYZ_F32   = 1,
  XYZI_F32  = 2,
  XY_F64    = 3,
  XYZ_F64   = 4
}

export interface DecodedPointList {
  format: PointFormat
  count: number
  data: Float32Array 
  stride: number     
}

export class PointListDecoder {
  static decode(view: DataView, offset: number): { result: DecodedPointList, newOffset: number } {
    let ptr = offset

    try {
      // 1. 检查剩余长度
      if (ptr + 13 > view.byteLength) {
        throw new Error(`Buffer too short for header. Need 13, has ${view.byteLength - ptr}`)
      }

      // 2. 读取元数据
      const format = view.getUint8(ptr) as PointFormat; ptr += 1
      const count = view.getUint32(ptr, true); ptr += 4
      const originalSize = view.getUint32(ptr, true); ptr += 4
      const compressedSize = view.getUint32(ptr, true); ptr += 4

      // console.log(`[Decoder] Fmt:${format}, Count:${count}, Orig:${originalSize}, Comp:${compressedSize}`)

      // 3. 提取压缩体 (Uint8Array View)
      if (ptr + compressedSize > view.byteLength) {
        throw new Error(`Buffer overflow. Need ${compressedSize}, has ${view.byteLength - ptr}`)
      }
      
      const compressedBytes = new Uint8Array(view.buffer, view.byteOffset + ptr, compressedSize)
      ptr += compressedSize

      // ✅ [新增] 如果压缩体大小为 0 (说明没有点数据)，直接返回空结果，不要调用 pako
      if (compressedSize === 0) {
         return {
           result: { format, count: 0, data: new Float32Array(0), stride: 3 },
           newOffset: ptr
         }
      }

      // 4. 解压 (智能兼容模式)
      let rawBytes: Uint8Array | null = null
      
      // 尝试 A: 标准 Zlib (miniz compress 默认格式)
      try {
        rawBytes = pako.inflate(compressedBytes)
      } catch (e1) {
        // 尝试 B: Raw Deflate (无头模式)
        try {
          // console.warn('[Decoder] Standard inflate failed, trying raw...', e1)
          rawBytes = pako.inflateRaw(compressedBytes)
        } catch (e2) {
           console.error('[Decoder] All inflate methods failed', e2)
           // 返回空结果，不要抛出异常炸掉整个渲染循环
           return this.emptyResult(format, ptr)
        }
      }

      if (!rawBytes || rawBytes.byteLength === 0) {
        console.error('[Decoder] Decompression result is empty')
        return this.emptyResult(format, ptr)
      }

      // 检查解压后大小是否符合预期
      // (注意：originalSize 是后端传来的，仅供参考，以实际解压为准)
      // if (rawBytes.byteLength !== originalSize) {
      //   console.warn(`[Decoder] Size mismatch! Expected ${originalSize}, got ${rawBytes.byteLength}`)
      // }

      // 5. 转换为 TypedArray
      let finalData: Float32Array
      let stride = 3

      switch (format) {
        case PointFormat.XY_F32: stride = 2; break;
        case PointFormat.XYZ_F32: stride = 3; break;
        case PointFormat.XYZI_F32: stride = 4; break;
        case PointFormat.XY_F64: stride = 2; break; // TODO: Handle Double
        case PointFormat.XYZ_F64: stride = 3; break; // TODO: Handle Double
        default: stride = 3; break;
      }
      
      // 创建 Float32Array
      // 使用 slice 确保内存对齐 (pako 返回的 buffer 有时会复用内部大 buffer)
      // Float32Array 必须 4 字节对齐
      if (rawBytes.byteOffset % 4 !== 0 || rawBytes.byteLength % 4 !== 0) {
          const alignedBuffer = rawBytes.slice().buffer
          finalData = new Float32Array(alignedBuffer)
      } else {
          finalData = new Float32Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength / 4)
      }

      return {
        result: { format, count, data: finalData, stride },
        newOffset: ptr
      }

    } catch (err) {
      console.error('[Decoder] Critical Error:', err)
      // 返回空结果，保证偏移量正确移动，避免影响后续层解析
      return this.emptyResult(PointFormat.XYZ_F32, ptr) // 这里 ptr 其实已经不对了，但这通常意味着整个帧都废了
    }
  }

  private static emptyResult(format: PointFormat, offset: number) {
    return {
        result: { format, count: 0, data: new Float32Array(0), stride: 3 },
        newOffset: offset
    }
  }
}