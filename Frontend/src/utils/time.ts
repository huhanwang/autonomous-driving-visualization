// time.ts - 时间格式化工具

/**
 * 格式化时间戳为可读字符串
 * @param timestamp - Unix时间戳（秒）
 * @returns 格式化的时间字符串 HH:MM:SS.mmm
 */
export function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0')
    
    return `${hours}:${minutes}:${seconds}.${milliseconds}`
  }
  
  /**
   * 格式化时长（秒）为可读字符串
   * @param seconds - 时长（秒）
   * @returns 格式化的时长字符串 HH:MM:SS
   */
  export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`
  }
  
  /**
   * 格式化进度百分比
   * @param progress - 进度 0.0-1.0
   * @returns 百分比字符串
   */
  export function formatProgress(progress: number): string {
    return `${(progress * 100).toFixed(1)}%`
  }
  
  /**
   * 格式化帧号
   * @param frameId - 帧号
   * @returns 格式化的帧号字符串
   */
  export function formatFrameId(frameId: number): string {
    return `Frame ${frameId.toLocaleString()}`
  }