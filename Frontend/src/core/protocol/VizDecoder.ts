// src/core/protocol/VizDecoder.ts

import { PointListDecoder, type DecodedPointList } from './PointListDecoder'

// 🌟 [新增] 视图掩码枚举 (必须与后端一致)
export enum ViewMask {
  NONE    = 0,
  VIEW_2D = 1 << 0, // 1
  VIEW_3D = 1 << 1, // 2
  ALL     = 3       // 1 | 2
}

// 坐标系枚举
export enum CoordinateSystem {
  RIGHT_HANDED_Z_UP_X_FWD = 0,   // ROS (X前, Y左, Z上)
  RIGHT_HANDED_Y_UP_X_RIGHT = 1, // OpenGL (X右, Y上, Z后)
  LEFT_HANDED_Y_UP_X_RIGHT = 2,  // Unity (X右, Y上, Z前)
  RIGHT_HANDED_Z_UP_Y_FWD = 3    // ENU (X东, Y北, Z天)
}

export enum NodeType {
  GROUP = 0,
  OBJECT = 1
}

export enum ObjectType {
  UNKNOWN = 0,
  POINT_CLOUD = 1,
  LINE_LIST = 2,
  POLYLINE = 3,
  POLYGON = 4,
  CUBE = 5,
  SPHERE = 6,
  TEXT = 7,
  MESH = 8,
  IMAGE = 9
}

// 🌟 [新增] 子类型枚举 (与后端保持一致)
export enum SubType {
  // === 0-99: 车道线/路面标识 ===
  DEFAULT = 0,
  
  // 实线类
  LINE_SOLID = 1,
  LINE_DOUBLE_SOLID = 2,
  
  // 虚线类
  LINE_DASHED = 3,
  LINE_SHORT_DASHED = 4,
  LINE_DOUBLE_DASHED = 5,
  
  // 混合类
  LINE_LEFT_SOLID_RIGHT_DASHED = 6,
  LINE_RIGHT_SOLID_LEFT_DASHED = 7,
  
  // 虚拟/特殊类
  LINE_VIRTUAL = 10,
  LINE_SHADED_AREA = 11,
  LINE_CURB = 12,
  
  // === 100+: 障碍物/动态对象 ===
  OBJ_CAR = 100,
  OBJ_PEDESTRIAN = 101,
  OBJ_CYCLIST = 102,
  OBJ_CONE = 103,
  OBJ_TRUCK = 104,
  OBJ_BUS = 105
}

// 解码结果接口
export interface DecodeResult {
  frameId: bigint
  timestamp: number
  coordinateSystem: CoordinateSystem
  layers: DecodedLayer[]
}

// 基础节点信息
export interface DecodedNodeBase {
  id: string
  name: string
  visible: boolean
  viewMask: number // 🌟 [修复] 包含 viewMask
  properties: Record<string, string>
}

// 组节点
export interface DecodedGroup extends DecodedNodeBase {
  nodeType: 'group'
  children: (DecodedGroup | DecodedObject)[]
}

// 物体节点
export interface DecodedObject extends DecodedNodeBase {
  nodeType: 'object'
  type: ObjectType
  subType: SubType 
  position: { x: number, y: number, z: number }
  rotation: { x: number, y: number, z: number }
  size: { x: number, y: number, z: number }
  color: { r: number, g: number, b: number, a: number }
  points?: DecodedPointList
}

// Topic 节点
export interface DecodedTopic {
  id: string
  frameId: bigint 
  rootNode?: DecodedGroup | DecodedObject
}

// 图层节点
export interface DecodedLayer extends DecodedNodeBase {
  nodeType: 'layer'
  topics: DecodedTopic[]
}

export class VizDecoder {
  static decode(buffer: ArrayBuffer): DecodeResult {
    const view = new DataView(buffer)
    let offset = 0
    
    // Header Check
    if (view.byteLength < 23) throw new Error('Packet too short')
    
    const magic = view.getUint16(offset, true); offset += 2
    if (magic !== 0x5343) throw new Error('Invalid Magic')
    
    const frameId = view.getBigUint64(offset, true); offset += 8
    const timestamp = view.getFloat64(offset, true); offset += 8
    
    // 读取坐标系
    let coordinateSystem = CoordinateSystem.RIGHT_HANDED_Z_UP_X_FWD;
    if (offset + 1 <= view.byteLength) {
       coordinateSystem = view.getUint8(offset++) as CoordinateSystem;
    }

    const layerCount = view.getUint32(offset, true); offset += 4
    const layers: DecodedLayer[] = []

    const checkBound = (need: number) => {
      if (offset + need > view.byteLength) throw new Error(`Buffer overflow: need ${need}, left ${view.byteLength - offset}`)
    }

    const readString = () => {
      checkBound(2)
      const len = view.getUint16(offset, true); offset += 2
      if (len > 10000) throw new Error(`String too long: ${len}`)
      
      checkBound(len)
      const strBytes = new Uint8Array(buffer, offset, len)
      offset += len
      return new TextDecoder().decode(strBytes)
    }

    // 🌟 [修复] 读取节点基础信息 (包含 viewMask)
    const readNodeBase = () => {
      const id = readString()
      const name = readString()
      
      // visible(1) + viewMask(1) + propCount(2) = 4 bytes
      checkBound(4) 
      
      const visible = view.getUint8(offset++) !== 0
      const viewMask = view.getUint8(offset++) // 🌟 读取掩码
      
      const propCount = view.getUint16(offset, true); offset += 2
      
      const properties: Record<string, string> = {}
      for(let i=0; i<propCount; i++) {
        if (offset >= view.byteLength) break;
        const k = readString(); 
        const v = readString();
        properties[k] = v
      }
      return { id, name, visible, viewMask, properties }
    }

    const decodeNode = (typeTag: NodeType): DecodedGroup | DecodedObject => {
      const base = readNodeBase()

      if (typeTag === NodeType.GROUP) {
        checkBound(4)
        const childCount = view.getUint32(offset, true); offset += 4
        const children: any[] = []
        
        for(let i=0; i<childCount; i++) {
          if (offset >= view.byteLength) break
          checkBound(1)
          const childTag = view.getUint8(offset++) as NodeType
          children.push(decodeNode(childTag))
        }
        return { nodeType: 'group', ...base, children }
      } 
      else {
        // OBJECT
        // Type(1) + SubType(4) + Pos(12) + Rot(12) + Size(12) + Color(4)
        checkBound(1 + 4 + 12 + 12 + 12 + 4)
        
        const type = view.getUint8(offset++) as ObjectType
        
        // 🛑 注意：viewMask 已经在 base 里读过了，这里不需要再读
        // 后端顺序: Node::serialize (viewMask) -> Object Specifics (Type, SubType...)

        const subType = view.getInt32(offset, true) as SubType; offset += 4
        
        const pos = { x: view.getFloat32(offset, true), y: view.getFloat32(offset+4, true), z: view.getFloat32(offset+8, true) }; offset += 12
        const rot = { x: view.getFloat32(offset, true), y: view.getFloat32(offset+4, true), z: view.getFloat32(offset+8, true) }; offset += 12
        const size = { x: view.getFloat32(offset, true), y: view.getFloat32(offset+4, true), z: view.getFloat32(offset+8, true) }; offset += 12
        const color = { r: view.getUint8(offset++), g: view.getUint8(offset++), b: view.getUint8(offset++), a: view.getUint8(offset++) }

        // 解析几何数据
        let points
        try {
            if (offset + 4 <= view.byteLength) {
                const res = PointListDecoder.decode(view, offset)
                if (res && res.newOffset > offset && res.newOffset <= view.byteLength) {
                    points = res.result
                    offset = res.newOffset
                }
            }
        } catch (e) {
            console.warn('[VizDecoder] PointList decode skipped', e)
            throw e
        }

        // ✅ 不再读取 binary_data

        return { 
            nodeType: 'object', ...base, 
            type, subType, position: pos, rotation: rot, size, color, points 
        }
      }
    }

    const decodeTopic = (): DecodedTopic | null => {
        try {
            const id = readString()
            checkBound(8 + 1)
            const frameId = view.getBigUint64(offset, true); offset += 8
            const hasNode = view.getUint8(offset++) !== 0
            
            let rootNode
            if (hasNode) {
                checkBound(1)
                const typeTag = view.getUint8(offset++) as NodeType
                rootNode = decodeNode(typeTag)
            }
            return { id, frameId, rootNode }
        } catch (e) {
            console.error('[VizDecoder] Topic decode error', e)
            return null
        }
    }

    for (let l = 0; l < layerCount; l++) {
      try {
          const layerBase = readNodeBase()
          checkBound(4)
          const topicCount = view.getUint32(offset, true); offset += 4
          const topics: DecodedTopic[] = []
          for (let t = 0; t < topicCount; t++) {
              const topic = decodeTopic()
              if (topic) topics.push(topic)
          }
          layers.push({ nodeType: 'layer', ...layerBase, topics })
      } catch (e) {
          console.error('[VizDecoder] Layer decode error', e)
          break;
      }
    }
    
    return {
        frameId,
        timestamp,
        coordinateSystem,
        layers
    }
  }
}