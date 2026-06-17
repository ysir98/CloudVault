/** 文件大小格式化（防御 undefined / NaN / 负数） */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (!bytes || !isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** 日期格式化 */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** 速度格式化（bytes/s → KB/s 或 MB/s） */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
}

/** 剩余时间格式化 */
export function formatEta(secs: number): string {
  if (!isFinite(secs) || secs <= 0) return '—'
  if (secs < 60) return `${Math.ceil(secs)}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.ceil(secs % 60)}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

/** 从对象 key 提取文件名 */
export function keyToName(key: string): string {
  const parts = key.replace(/\/$/, '').split('/')
  return parts[parts.length - 1] || key
}

/** 从对象 key 提取父目录 prefix */
export function keyToPrefix(key: string): string {
  const idx = key.lastIndexOf('/')
  return idx === -1 ? '' : key.substring(0, idx + 1)
}
