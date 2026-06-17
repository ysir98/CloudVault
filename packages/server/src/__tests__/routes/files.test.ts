/**
 * files 路由单元测试
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

describe('GET /api/files/:accountId/:bucket', () => {
  it('返回文件列表', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/files/${accountId}/test-bucket` })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body.objects)).toBe(true)
    expect(body.objects.length).toBeGreaterThan(0)
  })

  it('支持 prefix 查询参数', async () => {
    await app.inject({ method: 'GET', url: `/api/files/${accountId}/test-bucket?prefix=folder/` })
    expect(vi.mocked(mockAdapter.listObjects)).toHaveBeenCalledWith(
      'test-bucket',
      expect.objectContaining({ prefix: 'folder/' }),
    )
  })

  it('账户不存在时返回 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files/nonexistent/test-bucket' })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/files/:accountId/:bucket', () => {
  it('批量删除成功', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/files/${accountId}/test-bucket`,
      payload: { keys: ['file1.txt', 'file2.txt'] },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).deleted).toBe(2)
  })

  it('keys 为空时返回 400', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/files/${accountId}/test-bucket`,
      payload: { keys: [] },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/files/:accountId/:bucket/mkdir', () => {
  it('创建文件夹', async () => {
    vi.mocked(mockAdapter.createFolder).mockClear()
    const res = await app.inject({
      method: 'POST',
      url: `/api/files/${accountId}/test-bucket/mkdir`,
      payload: { prefix: 'new-folder' },
    })
    expect(res.statusCode).toBe(200)
    expect(vi.mocked(mockAdapter.createFolder)).toHaveBeenCalledWith('test-bucket', 'new-folder')
  })
})

describe('POST /api/files/:accountId/:bucket/rename', () => {
  it('重命名：先 copy 再 delete', async () => {
    vi.mocked(mockAdapter.copyObject).mockClear()
    vi.mocked(mockAdapter.deleteObjects).mockClear()

    const res = await app.inject({
      method: 'POST',
      url: `/api/files/${accountId}/test-bucket/rename`,
      payload: { oldKey: 'old.txt', newKey: 'new.txt' },
    })
    expect(res.statusCode).toBe(200)
    expect(vi.mocked(mockAdapter.copyObject)).toHaveBeenCalledWith('test-bucket', 'old.txt', 'test-bucket', 'new.txt')
    expect(vi.mocked(mockAdapter.deleteObjects)).toHaveBeenCalledWith('test-bucket', ['old.txt'])
  })
})

describe('回收站 (trash)', () => {
  it('POST — 移入回收站，顺序 copy → delete → DB 写入', async () => {
    vi.mocked(mockAdapter.copyObject).mockClear()
    vi.mocked(mockAdapter.deleteObjects).mockClear()

    const res = await app.inject({
      method: 'POST',
      url: `/api/trash/${accountId}`,
      payload: { bucket: 'test-bucket', keys: ['a.txt', 'b.txt'] },
    })
    expect(res.statusCode).toBe(200)
    expect(vi.mocked(mockAdapter.copyObject)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(mockAdapter.deleteObjects)).toHaveBeenCalledTimes(2)

    const listRes = await app.inject({ method: 'GET', url: `/api/trash/${accountId}` })
    expect(JSON.parse(listRes.body).items.length).toBeGreaterThanOrEqual(2)
  })

  it('DELETE — 空 ids 数组安全返回 {ok:true, deleted:0}', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/trash/${accountId}`,
      payload: { ids: [] },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true, deleted: 0 })
  })

  it('POST /restore — 恢复文件', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/trash/${accountId}`,
      payload: { bucket: 'test-bucket', keys: ['restore-me.txt'] },
    })
    const { items } = JSON.parse(
      (await app.inject({ method: 'GET', url: `/api/trash/${accountId}` })).body,
    )
    const target = items.find((i: { original_key: string }) => i.original_key === 'restore-me.txt')
    expect(target).toBeDefined()

    vi.mocked(mockAdapter.copyObject).mockClear()
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/trash/${accountId}/restore`,
      payload: { ids: [target.id] },
    })
    expect(restoreRes.statusCode).toBe(200)
    expect(vi.mocked(mockAdapter.copyObject)).toHaveBeenCalledTimes(1)
  })
})

describe('标签系统', () => {
  let tagId: string

  it('POST /api/tags — 创建标签', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/tags',
      payload: { name: 'important', color: '#ff0000' },
    })
    expect(res.statusCode).toBe(201)
    tagId = JSON.parse(res.body).tag.id
    expect(tagId).toBeTruthy()
  })

  it('GET /api/tags — 返回标签列表（含刚创建的标签）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tags' })
    const { tags } = JSON.parse(res.body)
    expect(tags.some((t: { id: string }) => t.id === tagId)).toBe(true)
  })

  it('DELETE /api/tags/:tagId — 删除标签', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/tags/${tagId}` })
    expect(res.statusCode).toBe(200)
  })
})

describe('收藏夹', () => {
  it('添加、列出、删除收藏', async () => {
    // 添加
    const addRes = await app.inject({
      method: 'POST', url: '/api/favorites',
      payload: { accountId, bucket: 'test-bucket', key: 'fav.txt' },
    })
    expect(addRes.statusCode).toBe(201)

    // 列出
    const listRes = await app.inject({ method: 'GET', url: '/api/favorites' })
    const { favorites } = JSON.parse(listRes.body)
    expect(favorites.some((f: { key: string }) => f.key === 'fav.txt')).toBe(true)

    // 删除
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/favorites?accountId=${accountId}&bucket=test-bucket&key=fav.txt`,
    })
    expect(delRes.statusCode).toBe(200)
  })
})

describe('GET /api/files/:accountId/search', () => {
  it('搜索返回正确结构', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/files/${accountId}/search?q=file` })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(JSON.parse(res.body).results)).toBe(true)
  })
})
