import { http } from './index'
import type { ShareLink } from '@/types'

export const shareApi = {
  create: (params: {
    accountId: string; bucket: string; key: string
    expiresIn?: number; password?: string
  }) =>
    http.post<{
      id: string; url: string; cdnUrl: string | null
      expiresAt: number; hasPassword: boolean
    }>('/share', params).then(r => r.data),

  list: (accountId?: string) =>
    http.get<{ shares: ShareLink[] }>('/share', { params: { accountId } })
      .then(r => r.data.shares),

  resolve: (id: string, password?: string) =>
    http.get<{ url: string }>(`/share/${id}/resolve`, { params: { password } })
      .then(r => r.data.url),

  remove: (id: string) => http.delete(`/share/${id}`),

  setAcl: (accountId: string, bucket: string, key: string, acl: 'private' | 'public-read') =>
    http.post('/share/acl', { accountId, bucket, key, acl }),

  getCdnUrl: (accountId: string, bucket: string, key: string) =>
    http.get<{ url: string }>('/share/cdn', { params: { accountId, bucket, key } })
      .then(r => r.data.url),

  // 预览路由
  getTextContent: (accountId: string, bucket: string, key: string) =>
    http.get<string>('/preview/text', {
      params: { accountId, bucket, key },
      responseType: 'text',
    }).then(r => r.data),

  saveTextContent: (accountId: string, bucket: string, key: string, content: string) =>
    http.put('/preview/text', content, {
      params: { accountId, bucket, key },
      headers: { 'Content-Type': 'text/plain' },
    }),

  getThumbnailUrl: (accountId: string, bucket: string, key: string, size = 200) =>
    `/api/preview/thumbnail?accountId=${accountId}&bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}&width=${size}&height=${size}`,
}
