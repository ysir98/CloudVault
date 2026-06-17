import { http } from './index'
import type { FileObject, ListResult, Tag, FavoriteItem, TrashItem } from '@/types'

export const fileApi = {
  /** 列出目录内容 */
  list: (accountId: string, bucket: string, params: {
    prefix?: string; marker?: string; maxKeys?: number
  } = {}) =>
    http.get<ListResult>(`/files/${accountId}/${bucket}`, { params })
      .then(r => r.data),

  /** 获取对象元数据 */
  stat: (accountId: string, bucket: string, key: string) =>
    http.get<FileObject>(`/files/${accountId}/${bucket}/stat`, { params: { key } })
      .then(r => r.data),

  /** 批量删除 */
  delete: (accountId: string, bucket: string, keys: string[]) =>
    http.delete(`/files/${accountId}/${bucket}`, { data: { keys } }),

  /** 复制文件 */
  copy: (accountId: string, bucket: string, items: Array<{
    srcKey: string; destBucket?: string; destKey: string
  }>) =>
    http.post(`/files/${accountId}/${bucket}/copy`, { items }),

  /** 移动文件 */
  move: (accountId: string, bucket: string, items: Array<{
    srcKey: string; destBucket?: string; destKey: string
  }>) =>
    http.post(`/files/${accountId}/${bucket}/move`, { items }),

  /** 重命名 */
  rename: (accountId: string, bucket: string, oldKey: string, newKey: string) =>
    http.post(`/files/${accountId}/${bucket}/rename`, { oldKey, newKey }),

  /** 创建文件夹 */
  mkdir: (accountId: string, bucket: string, prefix: string) =>
    http.post(`/files/${accountId}/${bucket}/mkdir`, { prefix }),

  /** 搜索（本地索引） */
  search: (accountId: string, params: {
    q: string; bucket?: string; type?: string
    minSize?: number; maxSize?: number; from?: string; to?: string
  }) =>
    http.get<{ results: FileObject[] }>(`/files/${accountId}/search`, { params })
      .then(r => r.data.results),

  // -------- 标签 --------

  listTags: () => http.get<{ tags: Tag[] }>('/tags').then(r => r.data.tags),

  createTag: (name: string, color?: string) =>
    http.post<{ tag: Tag }>('/tags', { name, color }).then(r => r.data.tag),

  deleteTag: (tagId: string) => http.delete(`/tags/${tagId}`),

  addFileTag: (accountId: string, bucket: string, key: string, tagId: string) =>
    http.post(`/files/${accountId}/${bucket}/tags`, { key, tagId }),

  removeFileTag: (accountId: string, bucket: string, key: string, tagId: string) =>
    http.delete(`/files/${accountId}/${bucket}/tags`, { params: { key, tagId } }),

  // -------- 收藏 --------

  listFavorites: () =>
    http.get<{ favorites: FavoriteItem[] }>('/favorites').then(r => r.data.favorites),

  addFavorite: (accountId: string, bucket: string, key: string, displayName?: string) =>
    http.post('/favorites', { accountId, bucket, key, displayName }),

  removeFavorite: (accountId: string, bucket: string, key: string) =>
    http.delete('/favorites', { params: { accountId, bucket, key } }),

  // -------- 回收站 --------

  listTrash: (accountId: string) =>
    http.get<{ items: TrashItem[] }>(`/trash/${accountId}`).then(r => r.data.items),

  moveToTrash: (accountId: string, bucket: string, keys: string[]) =>
    http.post(`/trash/${accountId}`, { bucket, keys }),

  restoreFromTrash: (accountId: string, ids: string[]) =>
    http.post(`/trash/${accountId}/restore`, { ids }),

  emptyTrash: (accountId: string, ids?: string[]) =>
    http.delete(`/trash/${accountId}`, { data: ids ? { ids } : {} }),
}
