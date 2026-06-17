/**
 * stores/accounts 单元测试
 *
 * Mock accountApi，隔离网络请求。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAccountStore } from '../../stores/accounts'

// Mock API 模块
vi.mock('../../api/accounts', () => ({
  accountApi: {
    getProviders: vi.fn().mockResolvedValue([
      { id: 's3', name: 'AWS S3', protocol: 's3', fields: ['accessKeyId', 'secretAccessKey', 'region'] },
      { id: 'oss', name: '阿里云 OSS', protocol: 'oss', fields: ['accessKeyId', 'accessKeySecret', 'region'] },
    ]),
    // 用 mockImplementation 而非 mockResolvedValue，确保每次调用返回全新对象，
    // 避免前一个测试修改了 reactive 数组后污染后续测试
    list: vi.fn().mockImplementation(() => Promise.resolve([
      { id: 'acc-1', name: 'My S3', provider: 's3', sortOrder: 0, createdAt: 1000, updatedAt: 1000 },
      { id: 'acc-2', name: 'My OSS', provider: 'oss', sortOrder: 1, createdAt: 2000, updatedAt: 2000 },
    ])),
    create: vi.fn().mockImplementation((data: { name: string; provider: string }) =>
      Promise.resolve({ id: 'new-acc', name: data.name, provider: data.provider, sortOrder: 0, createdAt: Date.now(), updatedAt: Date.now() }),
    ),
    update: vi.fn().mockImplementation((id: string, data: { name?: string }) =>
      Promise.resolve({ id, name: data.name ?? 'Updated', provider: 's3', sortOrder: 0, createdAt: 1000, updatedAt: Date.now() }),
    ),
    remove: vi.fn().mockResolvedValue(undefined),
    test: vi.fn().mockResolvedValue({ ok: true }),
    listBuckets: vi.fn().mockResolvedValue([
      { name: 'bucket-a', region: 'us-east-1' },
      { name: 'bucket-b', region: 'eu-west-1' },
    ]),
    reorder: vi.fn().mockResolvedValue(undefined),
  },
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('loadProviders', () => {
  it('加载提供商列表', async () => {
    const store = useAccountStore()
    await store.loadProviders()
    expect(store.providers).toHaveLength(2)
    expect(store.providers[0].id).toBe('s3')
  })
})

describe('loadAccounts', () => {
  it('加载账户列表，loading 状态正确变化', async () => {
    const store = useAccountStore()
    const promise = store.loadAccounts()
    // loading 开始时应为 true（实际会立即 resolve）
    await promise
    expect(store.loading).toBe(false)
    expect(store.accounts).toHaveLength(2)
  })

  it('sortedAccounts 按 sortOrder 排序', async () => {
    const store = useAccountStore()
    await store.loadAccounts()
    const sorted = store.sortedAccounts
    expect(sorted[0].sortOrder).toBeLessThanOrEqual(sorted[1].sortOrder)
  })
})

describe('createAccount', () => {
  it('创建账户后追加到 accounts 列表', async () => {
    const store = useAccountStore()
    await store.loadAccounts()
    const initial = store.accounts.length

    await store.createAccount({ name: 'New Account', provider: 's3', config: { accessKeyId: 'ak' } })

    expect(store.accounts).toHaveLength(initial + 1)
    expect(store.accounts.at(-1)?.name).toBe('New Account')
  })
})

describe('updateAccount', () => {
  it('更新账户并替换列表中的条目', async () => {
    const store = useAccountStore()
    await store.loadAccounts()

    await store.updateAccount('acc-1', { name: 'Renamed S3' })

    const updated = store.accounts.find(a => a.id === 'acc-1')
    expect(updated?.name).toBe('Renamed S3')
  })

  it('更新后清除该账户的 Bucket 缓存', async () => {
    const store = useAccountStore()
    await store.loadAccounts()
    await store.loadBuckets('acc-1')
    expect(store.getBuckets('acc-1')).toHaveLength(2)

    await store.updateAccount('acc-1', { name: 'New Name' })
    expect(store.getBuckets('acc-1')).toHaveLength(0)
  })
})

describe('removeAccount', () => {
  it('删除账户后从列表移除', async () => {
    const store = useAccountStore()
    await store.loadAccounts()

    await store.removeAccount('acc-1')

    expect(store.accounts.find(a => a.id === 'acc-1')).toBeUndefined()
  })

  it('删除后清除 Bucket 缓存', async () => {
    const store = useAccountStore()
    await store.loadAccounts()
    await store.loadBuckets('acc-1')

    await store.removeAccount('acc-1')
    expect(store.bucketsMap['acc-1']).toBeUndefined()
  })
})

describe('loadBuckets / getBuckets', () => {
  it('加载 Bucket 列表后可通过 getBuckets 读取', async () => {
    const store = useAccountStore()
    await store.loadBuckets('acc-1')
    const buckets = store.getBuckets('acc-1')
    expect(buckets).toHaveLength(2)
    expect(buckets[0].name).toBe('bucket-a')
  })

  it('缓存命中时不重复调用 API', async () => {
    const { accountApi } = await import('../../api/accounts')
    const store = useAccountStore()

    await store.loadBuckets('acc-1')
    await store.loadBuckets('acc-1')  // 第二次应走缓存

    expect(accountApi.listBuckets).toHaveBeenCalledTimes(1)
  })

  it('forceRefresh=true 时强制重新请求', async () => {
    const { accountApi } = await import('../../api/accounts')
    const store = useAccountStore()

    await store.loadBuckets('acc-1')
    await store.loadBuckets('acc-1', true)  // 强制刷新

    expect(accountApi.listBuckets).toHaveBeenCalledTimes(2)
  })
})

describe('getAccount / getProvider', () => {
  it('getAccount 返回正确账户', async () => {
    const store = useAccountStore()
    await store.loadAccounts()
    expect(store.getAccount('acc-1')?.name).toBe('My S3')
    expect(store.getAccount('nonexistent')).toBeUndefined()
  })

  it('getProvider 返回正确提供商', async () => {
    const store = useAccountStore()
    await store.loadProviders()
    expect(store.getProvider('s3')?.name).toBe('AWS S3')
    expect(store.getProvider('nonexistent')).toBeUndefined()
  })
})
