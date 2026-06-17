import { http } from './index'
import type { Account, Provider, Bucket } from '@/types'

export const accountApi = {
  /** 获取所有支持的提供商元数据 */
  getProviders: () => http.get<{ providers: Provider[] }>('/providers').then(r => r.data.providers),

  /** 列出所有账户 */
  list: () => http.get<{ accounts: Account[] }>('/accounts').then(r => r.data.accounts),

  /** 新建账户 */
  create: (data: { name: string; provider: string; config: Record<string, string> }) =>
    http.post<{ account: Account }>('/accounts', data).then(r => r.data.account),

  /** 更新账户 */
  update: (id: string, data: Partial<{ name: string; provider: string; config: Record<string, string> }>) =>
    http.put<{ account: Account }>(`/accounts/${id}`, data).then(r => r.data.account),

  /** 删除账户 */
  remove: (id: string) => http.delete(`/accounts/${id}`),

  /** 测试连接 */
  test: (id: string) =>
    http.post<{ ok: boolean; error?: string }>(`/accounts/${id}/test`).then(r => r.data),

  /** 列出账户下的所有 Bucket */
  listBuckets: (id: string) =>
    http.get<{ buckets: Bucket[] }>(`/accounts/${id}/buckets`).then(r => r.data.buckets),

  /** 更新账户排序 */
  reorder: (orders: Array<{ id: string; sortOrder: number }>) =>
    http.patch('/accounts/reorder', { orders }),
}
