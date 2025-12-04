// src/core/protocol/VizDecoder.ts

import { PointListDecoder, type DecodedPointList } from './PointListDecoder'

// ... ObjectType 枚举保持不变 ...
export enum ObjectType {
  UNKNOWN = 0, POINT_CLOUD = 1, LINE_LIST = 2, POLYLINE = 3, 
  POLYGON = 4, CUBE = 5, SPHERE = 6, TEXT = 7, MESH = 8
}

export interface DecodedObject {
  id: string
  type: ObjectType
  // ✅ 新增：子类型 (前端可据此决定渲染细节，如实线/虚线)
  subType: number 
  
  position: { x: number, y: number, z: number }
  rotation: { x: number, y: number, z: number }
  size: { x: number, y: number, z: number }
  color: { r: number, g: number, b: number, a: number }
  points?: DecodedPointList
  properties: Record<string, string>
  
  layerId: string
  layerName: string
  groupId: string
  groupName: string
}

export class VizDecoder {
  static decode(buffer: ArrayBuffer): DecodedObject[] {
    const view = new DataView(buffer)
    let offset = 0
    
    // 1. Frame Header
    const magic = view.getUint16(offset, true); offset += 2
    if (magic !== 0x5343) { 
        console.warn('Invalid Magic Header')
        return []
    }
    
    const frameId = Number(view.getBigUint64(offset, true)); offset += 8
    const timestamp = view.getFloat64(offset, true); offset += 8
    const layerCount = view.getUint32(offset, true); offset += 4

    const objects: DecodedObject[] = []

    const readString = () => {
      if (offset + 2 > view.byteLength) throw new Error('Buffer overflow reading string len')
      const len = view.getUint16(offset, true); offset += 2
      if (offset + len > view.byteLength) throw new Error('Buffer overflow reading string body')
      const strBytes = new Uint8Array(buffer, offset, len)
      offset += len
      return new TextDecoder().decode(strBytes)
    }

    const readNodeBase = () => {
      const id = readString()
      const name = readString()
      const visible = view.getUint8(offset++) !== 0
      const propCount = view.getUint16(offset, true); offset += 2
      const props: Record<string, string> = {}
      for(let i=0; i<propCount; i++) {
        const k = readString(); const v = readString();
        props[k] = v
      }
      return { id, name, visible, props }
    }

    // 2. 遍历 Layers
    for (let l = 0; l < layerCount; l++) {
      const layerInfo = readNodeBase() // Layer Node
      const groupCount = view.getUint32(offset, true); offset += 4

      for (let g = 0; g < groupCount; g++) {
        const groupInfo = readNodeBase() // Group Node
        const objCount = view.getUint32(offset, true); offset += 4

        for (let o = 0; o < objCount; o++) {
          const objInfo = readNodeBase() 
          
          // --- 读取 Object 本体数据 ---
          const type = view.getUint8(offset++) as ObjectType
          const viewMask = view.getUint8(offset++)
          
          // ✅ 关键修复：读取新增的 sub_type (int32)
          const subType = view.getInt32(offset, true); offset += 4
          
          const pos = { x: view.getFloat32(offset, true), y: view.getFloat32(offset+4, true), z: view.getFloat32(offset+8, true) }; offset += 12
          const rot = { x: view.getFloat32(offset, true), y: view.getFloat32(offset+4, true), z: view.getFloat32(offset+8, true) }; offset += 12
          const size = { x: view.getFloat32(offset, true), y: view.getFloat32(offset+4, true), z: view.getFloat32(offset+8, true) }; offset += 12
          const color = { r: view.getUint8(offset++), g: view.getUint8(offset++), b: view.getUint8(offset++), a: view.getUint8(offset++) }

          const { result: points, newOffset } = PointListDecoder.decode(view, offset)
          offset = newOffset

          objects.push({
            id: objInfo.id,
            type,
            subType, // ✅ 保存 subType
            position: pos, rotation: rot, size, color,
            points,
            properties: objInfo.props,
            
            layerId: layerInfo.id || `layer_${l}`,
            layerName: layerInfo.name || `Layer ${l}`,
            groupId: groupInfo.id || `group_${l}_${g}`,
            groupName: groupInfo.name || `Group ${g}`
          })
        }
      }
    }
    
    return objects
  }
}