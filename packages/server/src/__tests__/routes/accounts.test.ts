/**
 * accounts 路由单元测试
 *
 * vi.mock 工厂不引用外部变量（避免提升后 TDZ 错误）。
 * mock adapter 在 beforeAll 中配置，通过 vi.mocked 注入。
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildApp, createTestAccount } from '../helpers/buildApp'
import { createMockAdapter } from '../helpers/mockAdapter'
import { decrypt } from '../../crypto'

// ✅ 工厂内不引用外部变量
vi.mock('../../storage/registry', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../storage/registry')>()
  return {
    ...original,
    getAdapter: vi.fn(),
    invalidateAdapter: vi.fn(),
  }
})

let app: Awaited<ReturnType<typeof buildApp>>
let mockAdapter: ReturnType<typeof createMockAdapter>

beforeAll(async () => {
  // 在 beforeAll 中创建并注入 mock adapter
  const { getAdapter } = await import('../../storage/registry')
  mockAdapter = createMockAdapter()
  vi.mocked(getAdapter).mockReturnValue(mockAdapter)

  app = await buildApp()
})

afterAll(async () => {
  await app.close()
})

describe('GET /api/providers', () => {
  it('返回 9 个提供商', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/providers' })
    expect(res.statusCode).toBe(200)
    const { providers } = JSON.parse(res.body)
    expect(providers).toHaveLength(9)
  })

  it('每个提供商有 id / name / protocol / fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/providers' })
    const { providers } = JSON.parse(res.body)
    for (const p of providers) {
      expect(p.id).toBeTruthy()
      expect(p.name).toBeTruthy()
      expect(p.protocol).toBeTruthy()
      expect(Array.isArray(p.fields)).toBe(true)
    }
  })
})

describe('POST /api/accounts', () => {
  it('成功创建账户，返回 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: {
        name: '我的 S3',
        provider: 's3',
        config: { accessKeyId: 'AK', secretAccessKey: 'SK', region: 'us-east-1' },
      },
    })
    expect(res.statusCode).toBe(201)
    const { account } = JSON.parse(res.body)
    expect(account.id).toBeTruthy()
    expect(account.name).toBe('我的 S3')
    expect(account.provider).toBe('s3')
    expect(account.config).toBeUndefined()
  })

  it('config 在数据库中以密文存储', async () => {
    const account = await createTestAccount(app)
    const { dbGet } = await import('../../db')
    const row = dbGet<{ config: string }>('SELECT config FROM accounts WHERE id = ?', [account.id])
    expect(row?.config).toBeTruthy()
    expect(() => decrypt(row!.config)).not.toThrow()
  })

  it('缺少 name 字段时返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: { provider: 's3', config: {} },
    })
    expect(res.statusCode).toBe(400)
  })

  it('缺少 provider 字段时返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: { name: 'test', config: {} },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/accounts', () => {
  it('返回账户列表', async () => {
    await createTestAccount(app)
    const res = await app.inject({ method: 'GET', url: '/api/accounts' })
    expect(res.statusCode).toBe(200)
    const { accounts } = JSON.parse(res.body)
    expect(Array.isArray(accounts)).toBe(true)
    expect(accounts.length).toBeGreaterThan(0)
  })

  it('账户列表不包含 config 字段', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/accounts' })
    const { accounts } = JSON.parse(res.body)
    for (const a of accounts) {
      expect(a.config).toBeUndefined()
    }
  })
})

describe('PUT /api/accounts/:id', () => {
  it('更新账户名称', async () => {
    const account = await createTestAccount(app)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/accounts/${account.id}`,
      payload: { name: '新名称' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).account.name).toBe('新名称')
  })

  it('更新不存在的账户返回 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/accounts/nonexistent-id',
      payload: { name: '新名称' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/accounts/:id', () => {
  it('删除账户返回 204', async () => {
    const account = await createTestAccount(app)
    const res = await app.inject({ method: 'DELETE', url: `/api/accounts/${account.id}` })
    expect(res.statusCode).toBe(204)
  })

  it('删除后账户不再出现在列表中', async () => {
    const account = await createTestAccount(app)
    await app.inject({ method: 'DELETE', url: `/api/accounts/${account.id}` })
    const listRes = await app.inject({ method: 'GET', url: '/api/accounts' })
    const { accounts } = JSON.parse(listRes.body)
    expect(accounts.find((a: { id: string }) => a.id === account.id)).toBeUndefined()
  })

  it('删除不存在的账户返回 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/accounts/nonexistent' })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/accounts/:id/test', () => {
  it('连接测试成功时返回 ok: true', async () => {
    const account = await createTestAccount(app)
    const res = await app.inject({ method: 'POST', url: `/api/accounts/${account.id}/test` })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).ok).toBe(true)
  })

  it('连接测试失败时返回 ok: false 和 error 信息', async () => {
    vi.mocked(mockAdapter.listBuckets).mockRejectedValueOnce(new Error('Connection refused'))
    const account = await createTestAccount(app)
    const res = await app.inject({ method: 'POST', url: `/api/accounts/${account.id}/test` })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ok).toBe(false)
    expect(body.error).toContain('Connection refused')
  })

  it('账户不存在时返回 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/accounts/nonexistent/test' })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/accounts/:id/buckets', () => {
  it('返回 Bucket 列表', async () => {
    const account = await createTestAccount(app)
    const res = await app.inject({ method: 'GET', url: `/api/accounts/${account.id}/buckets` })
    expect(res.statusCode).toBe(200)
    const { buckets } = JSON.parse(res.body)
    expect(Array.isArray(buckets)).toBe(true)
    expect(buckets[0].name).toBe('test-bucket')
  })
})
