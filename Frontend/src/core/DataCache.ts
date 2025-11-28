// core/DataCache.ts - 数据缓存管理器

import type { 
    TopicData, 
    TopicSchema, 
    FrameData, 
    MetaData,
    CacheStats 
  } from './types/common'
  
  /**
   * LRU缓存实现
   */
  class LRUCache<K, V> {
    private maxSize: number
    private cache: Map<K, V>
    private hits: number = 0
    private misses: number = 0
    
    constructor(maxSize: number = 100) {
      this.maxSize = maxSize
      this.cache = new Map()
    }
    
    get(key: K): V | undefined {
      if (!this.cache.has(key)) {
        this.misses++
        return undefined
      }
      
      // 更新访问顺序（移到最后）
      const value = this.cache.get(key)!
      this.cache.delete(key)
      this.cache.set(key, value)
      this.hits++
      return value
    }
    
    set(key: K, value: V): void {
      // 如果已存在，先删除
      if (this.cache.has(key)) {
        this.cache.delete(key)
      } else if (this.cache.size >= this.maxSize) {
        // 删除最久未使用的（第一个）
        const firstKey = this.cache.keys().next().value
        this.cache.delete(firstKey)
      }
      
      this.cache.set(key, value)
    }
    
    has(key: K): boolean {
      return this.cache.has(key)
    }
    
    delete(key: K): boolean {
      return this.cache.delete(key)
    }
    
    clear(): void {
      this.cache.clear()
      this.hits = 0
      this.misses = 0
    }
    
    size(): number {
      return this.cache.size
    }
    
    getStats(): { hits: number; misses: number; hitRate: number } {
      const total = this.hits + this.misses
      const hitRate = total > 0 ? this.hits / total : 0
      return { hits: this.hits, misses: this.misses, hitRate }
    }
  }
  
  /**
   * 数据缓存管理器
   * 
   * 职责：
   * 1. 缓存最新的Topic数据
   * 2. 缓存Schema定义
   * 3. 缓存历史帧数据（LRU）
   * 4. 提供快速数据访问接口
   */
  export class DataCache {
    // Topic相关缓存
    private topicData: Map<string, TopicData> = new Map()
    private schemaCache: Map<string, TopicSchema> = new Map()
    
    // 帧数据缓存（LRU）
    private frameCache: LRUCache<string, FrameData>
    
    // 元数据缓存
    private metaCache: Map<string, MetaData> = new Map()
    
    constructor(frameCacheSize: number = 100) {
      this.frameCache = new LRUCache(frameCacheSize)
    }
    
    // ========== Topic数据管理 ==========
    
    /**
     * 设置Topic数据
     */
    setTopicData(topic: string, data: TopicData): void {
      this.topicData.set(topic, data)
      
      // 同时缓存到帧缓存
      const frameKey = `${topic}:${data.frame_id}`
      this.frameCache.set(frameKey, {
        frame_id: data.frame_id,
        timestamp: data.timestamp,
        topics: new Map([[topic, data.data]])
      })
    }
    
    /**
     * 获取Topic数据
     */
    getTopicData(topic: string): TopicData | undefined {
      return this.topicData.get(topic)
    }
    
    /**
     * 检查是否有Topic数据
     */
    hasTopicData(topic: string): boolean {
      return this.topicData.has(topic)
    }
    
    /**
     * 删除Topic数据
     */
    deleteTopicData(topic: string): boolean {
      return this.topicData.delete(topic)
    }
    
    /**
     * 获取所有Topic
     */
    getAllTopics(): string[] {
      return Array.from(this.topicData.keys())
    }
    
    // ========== Schema管理 ==========
    
    /**
     * 设置Schema
     */
    setSchema(topic: string, schema: TopicSchema): void {
      this.schemaCache.set(topic, schema)
    }
    
    /**
     * 获取Schema
     */
    getSchema(topic: string): TopicSchema | undefined {
      return this.schemaCache.get(topic)
    }
    
    /**
     * 检查是否有Schema
     */
    hasSchema(topic: string): boolean {
      return this.schemaCache.has(topic)
    }
    
    /**
     * 删除Schema
     */
    deleteSchema(topic: string): boolean {
      return this.schemaCache.delete(topic)
    }
    
    // ========== 帧数据管理 ==========
    
    /**
     * 缓存帧数据
     */
    cacheFrame(frameId: number, data: FrameData): void {
      const key = `frame:${frameId}`
      this.frameCache.set(key, data)
    }
    
    /**
     * 获取帧数据
     */
    getFrame(frameId: number): FrameData | undefined {
      const key = `frame:${frameId}`
      return this.frameCache.get(key)
    }
    
    /**
     * 检查是否有帧数据
     */
    hasFrame(frameId: number): boolean {
      const key = `frame:${frameId}`
      return this.frameCache.has(key)
    }
    
    /**
     * 获取Topic的特定帧数据
     */
    getTopicFrame(topic: string, frameId: number): any | undefined {
      const key = `${topic}:${frameId}`
      const frame = this.frameCache.get(key)
      return frame?.topics.get(topic)
    }
    
    // ========== 元数据管理 ==========
    
    /**
     * 设置元数据
     */
    setMeta(key: string, data: MetaData): void {
      this.metaCache.set(key, data)
    }
    
    /**
     * 获取元数据
     */
    getMeta(key: string): MetaData | undefined {
      return this.metaCache.get(key)
    }
    
    /**
     * 检查是否有元数据
     */
    hasMeta(key: string): boolean {
      return this.metaCache.has(key)
    }
    
    /**
     * 删除元数据
     */
    deleteMeta(key: string): boolean {
      return this.metaCache.delete(key)
    }
    
    // ========== 清除操作 ==========
    
    /**
     * 清除指定Topic的所有数据
     */
    clearTopic(topic: string): void {
      this.topicData.delete(topic)
      this.schemaCache.delete(topic)
      // 注意：帧缓存使用LRU，不主动清除
    }
    
    /**
     * 清除所有数据
     */
    clear(): void {
      this.topicData.clear()
      this.schemaCache.clear()
      this.frameCache.clear()
      this.metaCache.clear()
    }
    
    // ========== 统计信息 ==========
    
    /**
     * 获取缓存统计信息
     */
    getStats(): CacheStats {
      const frameStats = this.frameCache.getStats()
      
      return {
        size: this.topicData.size + this.schemaCache.size + this.frameCache.size(),
        hits: frameStats.hits,
        misses: frameStats.misses,
        hitRate: frameStats.hitRate
      }
    }
    
    /**
     * 获取详细统计信息
     */
    getDetailedStats() {
      return {
        topics: this.topicData.size,
        schemas: this.schemaCache.size,
        frames: this.frameCache.size(),
        meta: this.metaCache.size,
        frameStats: this.frameCache.getStats()
      }
    }
  }