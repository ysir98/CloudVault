import { http } from './index'
import type { TransferTask, CompletedPart } from '@/types'
import axios from 'axios'

export const transferApi = {
  /** 发起上传任务 */
  initUpload: (params: {
    accountId: string; bucket: string; key: string
    fileName: string; fileSize: number; contentType?: string
  }) =>
    http.post<{
      taskId: string
      uploadId: string | null
      presignedUrl: string | null
      contentType: string
      /** true = 七牛/又拍云等不支持预签名 PUT，需 POST 到服务端代理端点 */
      proxyUpload: boolean
      partSize: number
      totalParts: number
    }>('/transfer/upload/init', params).then(r => r.data),

  /** 获取分片预签名 URL */
  getPartUrls: (params: {
    accountId: string; bucket: string; key: string
    uploadId: string; partNumbers: number[]
  }) =>
    http.post<{ urls: Record<number, string> }>('/transfer/upload/part-url', params)
      .then(r => r.data.urls),

  /** 完成分片上传 */
  completeUpload: (params: {
    taskId: string; accountId: string; bucket: string
    key: string; uploadId: string; parts: CompletedPart[]
  }) => http.post('/transfer/upload/complete', params),

  /** 中止分片上传 */
  abortUpload: (params: {
    taskId: string; accountId: string; bucket: string; key: string; uploadId: string
  }) => http.post('/transfer/upload/abort', params),

  /** 上报传输进度 */
  reportProgress: (taskId: string, transferred: number, parts?: CompletedPart[]) =>
    http.post('/transfer/upload/progress', { taskId, transferred, parts }),

  /** 获取下载预签名 URL */
  getDownloadUrl: (accountId: string, bucket: string, key: string, expires?: number) =>
    http.get<{ url: string }>('/transfer/download', { params: { accountId, bucket, key, expires } })
      .then(r => r.data.url),

  /** 获取传输任务列表 */
  listTasks: (params?: { status?: string; type?: string; limit?: number }) =>
    http.get<{ tasks: TransferTask[] }>('/transfer/tasks', { params }).then(r => r.data.tasks),

  /** 删除任务 */
  deleteTask: (id: string) => http.delete(`/transfer/tasks/${id}`),

  /** 清空已完成任务 */
  clearCompleted: () => http.post('/transfer/tasks/clear-completed'),

  /**
   * 代理上传：将文件 multipart POST 到本地服务端，由服务端推送到云存储。
   * 用于七牛、又拍云等不支持标准预签名 PUT 的提供商。
   */
  proxyUpload: (
    taskId: string,
    accountId: string,
    bucket: string,
    key: string,
    file: File,
    onProgress?: (loaded: number, total: number) => void,
  ) => {
    const form = new FormData()
    form.append('taskId', taskId)
    form.append('accountId', accountId)
    form.append('bucket', bucket)
    form.append('key', key)
    form.append('file', file, file.name)

    return http.post('/transfer/upload/proxy', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(e.loaded, e.total)
      },
    })
  },

  /**
   * 直接上传到云存储预签名 URL（客户端直传，绕过本地服务器）
   *
   * @param url         预签名 PUT URL
   * @param data        文件内容
   * @param onProgress  进度回调
   * @param contentType 必须与服务端签名时使用的 ContentType 一致，否则 S3 签名验证失败
   */
  uploadPart: (
    url: string,
    data: Blob | ArrayBuffer,
    onProgress?: (loaded: number, total: number) => void,
    contentType = 'application/octet-stream',
  ) =>
    axios.put(url, data, {
      headers: { 'Content-Type': contentType },
      timeout: 0,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(e.loaded, e.total)
      },
    }).then(r => ({
      etag: (r.headers['etag'] as string)?.replace(/"/g, '') ?? '',
    })),
}
