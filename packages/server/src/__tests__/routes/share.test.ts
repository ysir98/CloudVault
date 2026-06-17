/**
 * share 路由单元测试
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildApp, createTestAccount } from '../helpers/buildApp'
import { createMockAdapter } from '../helpers/mockAdapter'

vi.mock('../../storage/registry', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../storage/registry')>()
  return { ...original, getAdapter: vi.fn(), invalidateAdapter: vi.fn() }
})

let app: Awaited<ReturnType<typeof buildApp>>
let mockAdapter: ReturnType<typeof createMockAdapter>
let accountId: string

beforeAll(async () => {
  const { getAdapter } = await import('../../storage/registry')
  mockAdapter = createMockAdapter()
  vi.mocked(getAdapter).mockReturnValue(mockAdapter)

  app = await buildApp()
  const account = await createTestAccount(app)
  accountId = account.id
})

afterAll(async () => { await app.close() })

async function createShare(overrides: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST', url: '/api/share',
    payload: { accountId, bucket: 'test-bucket', key: 'file.txt', expiresIn: 3600, ...overrides },
  })
  return JSON.parse(res.body) as {
    id: string; url: string; cdnUrl: string | null; expiresAt: number; hasPassword: boolean
  }
}

describe('POST /api/share', () => {
  it('创建分享链接，返回 201', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/share',
      payload: { accountId, bucket: 'test-bucket', key: 'file.txt', expiresIn: 3600 },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.id).toBeTruthy()
    expect(body.url).toBeTruthy()
    expect(body.expiresAt).toBeGreaterThan(Date.now())
  })

  it('expiresAt 约等于 now + expiresIn 秒', async () => {
    const before = Date.now()
    const share = await createShare({ expiresIn: 7200 })
    const after = Date.now()
    expect(share.expiresAt).toBeGreaterThanOrEqual(before + 7200 * 1000 - 5000)
    expect(share.expiresAt).toBeLessThanOrEqual(after + 7200 * 1000 + 5000)
  })

  it('设置密码时 hasPassword 为 true', async () => {
    const share = await createShare({ password: 'my-secret' })
    expect(share.hasPassword).toBe(true)
  })

  it('不设置密码时 hasPassword 为 false', async () => {
    const share = await createShare()
    expect(share.hasPassword).toBe(false)
  })
})

describe('GET /api/share/:id/resolve', () => {
  it('正常链接返回 url', async () => {
    const share = await createShare()
    const res = await app.inject({ method: 'GET', url: `/api/share/${share.id}/resolve` })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).url).toBeTruthy()
  })

  it('密码正确时返回 url', async () => {
    const share = await createShare({ password: 'correct-pw' })
    const res = await app.inject({ method: 'GET', url: `/api/share/${share.id}/resolve?password=correct-pw` })
    expect(res.statusCode).toBe(200)
  })

  it('密码错误时返回 403', async () => {
    const share = await createShare({ password: 'correct-pw' })
    const res = await app.inject({ method: 'GET', url: `/api/share/${share.id}/resolve?password=wrong` })
    expect(res.statusCode).toBe(403)
  })

  it('不存在的链接返回 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/share/nonexistent-id/resolve' })
    expect(res.statusCode).toBe(404)
  })

  it('已过期的链接返回 410', async () => {
    const { dbRun } = await import('../../db')
    const { nanoid } = await import('nanoid')
    const expiredId = nanoid(10)
    dbRun(
      `INSERT INTO share_links (id, account_id, bucket, key, url, expires_at, created_at) VALUES (?,?,?,?,?,?,?)`,
      [expiredId, accountId, 'test-bucket', 'expired.txt', 'https://example.com', Date.now() - 1000, Date.now() - 10000],
    )
    const res = await app.inject({ method: 'GET', url: `/api/share/${expiredId}/resolve` })
    expect(res.statusCode).toBe(410)
  })
})

describe('GET /api/share', () => {
  it('返回分享列表', async () => {
    await createShare()
    const res = await app.inject({ method: 'GET', url: '/api/share' })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(JSON.parse(res.body).shares)).toBe(true)
  })

  it('按 accountId 过滤', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/share?accountId=${accountId}` })
    const { shares } = JSON.parse(res.body)
    expect(shares.every((s: { account_id: string }) => s.account_id === accountId)).toBe(true)
  })
})

describe('DELETE /api/share/:id', () => {
  it('删除后链接不可解析', async () => {
    const share = await createShare()
    await app.inject({ method: 'DELETE', url: `/api/share/${share.id}` })
    const res = await app.inject({ method: 'GET', url: `/api/share/${share.id}/resolve` })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/share/acl', () => {
  it('设置对象 ACL', async () => {
    vi.mocked(mockAdapter.setObjectAcl).mockClear()
    const res = await app.inject({
      method: 'POST', url: '/api/share/acl',
      payload: { accountId, bucket: 'test-bucket', key: 'file.txt', acl: 'public-read' },
    })
    expect(res.statusCode).toBe(200)
    expect(vi.mocked(mockAdapter.setObjectAcl)).toHaveBeenCalledWith('test-bucket', 'file.txt', 'public-read')
  })
})
