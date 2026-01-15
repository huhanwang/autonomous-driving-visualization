// src/core/protocol/PointListDecoder.ts

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
      // 1. 检查剩余长度 (Header 13 bytes)
      if (ptr + 13 > view.byteLength) {
        throw new Error(`Buffer too short for header. Need 13, has ${view.byteLength - ptr}`)
      }

      // 2. 读取元数据
      const format = view.getUint8(ptr) as PointFormat; ptr += 1
      const count = view.getUint32(ptr, true); ptr += 4
      const originalSize = view.getUint32(ptr, true); ptr += 4
      const compressedSize = view.getUint32(ptr, true); ptr += 4

      // 3. 提取压缩体
      if (ptr + compressedSize > view.byteLength) {
        throw new Error(`Buffer overflow. Need ${compressedSize}, has ${view.byteLength - ptr}`)
      }
      
      // 空数据直接返回
      if (compressedSize === 0) {
         return {
           result: { format, count: 0, data: new Float32Array(0), stride: 3 },
           newOffset: ptr
         }
      }

      const compressedBytes = new Uint8Array(view.buffer, view.byteOffset + ptr, compressedSize)
      ptr += compressedSize

      // 4. 解压 (pako)
      let rawBytes: Uint8Array | null = null
      try {
        rawBytes = pako.inflate(compressedBytes)
      } catch (e1) {
        try {
          rawBytes = pako.inflateRaw(compressedBytes)
        } catch (e2) {
           console.error('[Decoder] All inflate methods failed', e2)
           return this.emptyResult(format, ptr)
        }
      }

      if (!rawBytes || rawBytes.byteLength === 0) {
        return this.emptyResult(format, ptr)
      }

      // 5. 转换为 Float32Array (处理内存对齐)
      let finalData: Float32Array
      let stride = 3

      switch (format) {
        case PointFormat.XY_F32: stride = 2; break;
        case PointFormat.XYZ_F32: stride = 3; break;
        case PointFormat.XYZI_F32: stride = 4; break;
        default: stride = 3; break;
      }
      
      // 必须确保内存地址是 4 的倍数才能创建 Float32Array
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
      return this.emptyResult(PointFormat.XYZ_F32, ptr)
    }
  }

  private static emptyResult(format: PointFormat, offset: number) {
    return {
        result: { format, count: 0, data: new Float32Array(0), stride: 3 },
        newOffset: offset
    }
  }
}