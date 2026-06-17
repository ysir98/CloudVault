/** 应用全局类型定义 */

// ----------------------------------------------------------------
// 账户与提供商
// ----------------------------------------------------------------

export interface Provider {
  id: string
  name: string
  protocol: string
  fields: string[]
}

export interface Account {
  id: string
  name: string
  provider: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface Bucket {
  name: string
  region?: string
  creationDate?: string
}

// ----------------------------------------------------------------
// 文件对象
// ----------------------------------------------------------------

export interface FileObject {
  key: string
  size: number
  lastModified: Date | string | number
  etag?: string
  contentType?: string
  isDir: boolean
  accountId?: string
  bucket?: string
}

export interface ListResult {
  objects: FileObject[]
  nextMarker?: string
  isTruncated: boolean
}

// ----------------------------------------------------------------
// 传输任务
// ----------------------------------------------------------------

export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type TaskType = 'upload' | 'download'

export interface TransferTask {
  id: string
  type: TaskType
  accountId: string
  bucket: string
  key: string
  fileName: string
  totalSize: number
  transferred: number
  status: TaskStatus
  uploadId?: string
  parts?: CompletedPart[]
  error?: string
  createdAt: number
  updatedAt: number
  /** 前端运行时计算的速度（bytes/s） */
  speed?: number
  /** 前端运行时计算的剩余秒数 */
  remainingSecs?: number
}

export interface CompletedPart {
  PartNumber: number
  ETag: string
}

// ----------------------------------------------------------------
// 分享链接
// ----------------------------------------------------------------

export interface ShareLink {
  id: string
  accountId: string
  bucket: string
  key: string
  expiresAt?: number
  createdAt: number
}

// ----------------------------------------------------------------
// 标签与收藏
// ----------------------------------------------------------------

export interface Tag {
  id: string
  name: string
  color: string
}

export interface FavoriteItem {
  id: string
  accountId: string
  bucket: string
  key: string
  displayName?: string
  createdAt: number
}

export interface TrashItem {
  id: string
  accountId: string
  bucket: string
  key: string
  originalKey: string
  size?: number
  deletedAt: number
}

// ----------------------------------------------------------------
// UI 辅助
// ----------------------------------------------------------------

/** 文件视图模式 */
export type ViewMode = 'list' | 'grid' | 'column'

/** 文件排序字段 */
export type SortField = 'name' | 'size' | 'lastModified' | 'type'
export type SortOrder = 'asc' | 'desc'

/** 当前浏览路径 */
export interface BrowsePath {
  accountId: string
  bucket: string
  prefix: string  // 始终以 '/' 或空字符串开头，目录以 '/' 结尾
}
