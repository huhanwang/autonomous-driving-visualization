// Frontend/src/core/types/driver.ts
// 数据驱动接口定义 (后端交互契约)

import type { TopicSchema } from './common' // 复用现有的 TopicSchema
import type { RenderableObject } from './viz-standard'

// ========== 1. Worker 协议标准 (主线程 <-> Worker) ==========
// 规定主线程和 Worker 之间传什么数据

export interface ParseRequest {
  topicKey: string
  data: any           // 原始数据 (ArrayBuffer, Blob 或 JSON)
  schema?: TopicSchema // 解析需要的 Schema
}

export interface ParseResponse {
  success: boolean
  topicKey: string
  parsedData?: Record<string, any> // 解析后的纯 JSON 对象
  error?: string
}

// ========== 2. 适配器接口 (Data -> Viz) ==========
// 规定如何把 "业务数据" 转为 "标准几何数据"

export interface IDataAdapter<T = any> {
  /**
   * 判断该适配器是否能处理此 Topic
   * @param topic topic 名称
   * @param schemaType 数据类型名称 (如 perception.LiDARPoint)
   */
  canHandle(topic: string, schemaType?: string): boolean

  /**
   * 将业务数据转换为标准渲染对象列表
   * @param data 解析后的业务数据
   * @param context 上下文信息 (可选，如当前帧号)
   */
  transform(data: T, context?: any): RenderableObject[]
}

// ========== 3. 驱动核心接口 (Driver Entry) ==========
// 每个数据格式插件(Pack/RosBag)的入口必须导出符合此接口的对象

export interface IDataDriver {
  /**
   * 驱动名称 (如 'pack-driver', 'ros2-driver')
   */
  name: string

  /**
   * 创建该格式专属的解析 Worker
   * (用于在后台线程处理二进制反序列化，避免阻塞 UI)
   */
  createWorker(): Worker

  /**
   * 获取该驱动提供的适配器列表
   * (用于将解析后的数据转换为 2D/3D 图形)
   */
  getAdapters(): IDataAdapter[]

  /**
   * (可选) 连接建立时的钩子
   * 例如发送特殊的握手协议或鉴权信息
   */
  onConnect?(ws: WebSocket): void
}