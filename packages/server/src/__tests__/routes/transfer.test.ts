/**
 * transfer 路由单元测试
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildApp, createTestAccount } from '../helpers/buildApp'
import { createMockAdapter } from '../helpers/mockAdapter'

const PART_SIZE = 10 * 1024 * 1024

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

describe('POST /api/transfer/upload/init', () => {
  it('小文件（< 10MB）返回 presignedUrl，uploadId 为 null', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/transfer/upload/init',
      payload: { accountId, bucket: 'test-bucket', key: 'small.txt', fileName: 'small.txt', fileSize: 1024 * 100 },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.presignedUrl).toBeTruthy()
    expect(body.uploadId).toBeNull()
    expect(body.taskId).toBeTruthy()
    expect(body.totalParts).toBe(1)
  })

  it('大文件（>= 10MB）返回 uploadId，presignedUrl 为 null', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/transfer/upload/init',
      payload: { accountId, bucket: 'test-bucket', key: 'large.zip', fileName: 'large.zip', fileSize: PART_SIZE * 3 },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.uploadId).toBeTruthy()
    expect(body.presignedUrl).toBeNull()
    expect(body.totalParts).toBe(3)
    expect(vi.mocked(mockAdapter.initiateMultipartUpload)).toHaveBeenCalled()
  })

  it('任务记录写入数据库', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/transfer/upload/init',
      payload: { accountId, bucket: 'test-bucket', key: 'track.txt', fileName: 'track.txt', fileSize: 512 },
    })
    const { taskId } = JSON.parse(res.body)
    const listRes = await app.inject({ method: 'GET', url: '/api/transfer/tasks' })
    const { tasks } = JSON.parse(listRes.body)
    expect(tasks.some((t: { id: string }) => t.id === taskId)).toBe(true)
  })
})

describe('POST /api/transfer/upload/part-url', () => {
  it('返回各分片的预签名 URL Map', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/transfer/upload/part-url',
      payload: { accountId, bucket: 'test-bucket', key: 'large.zip', uploadId: 'uid-xyz', partNumbers: [1, 2, 3] },
    })
    expect(res.statusCode).toBe(200)
    const { urls } = JSON.parse(res.body)
    expect(urls['1']).toBeTruthy()
    expect(urls['2']).toBeTruthy()
    expect(urls['3']).toBeTruthy()
  })
})

describe('POST /api/transfer/upload/complete', () => {
  it('调用 completeMultipartUpload 并更新任务为 completed', async () => {
    const initRes = await app.inject({
      method: 'POST', url: '/api/transfer/upload/init',
      payload: { accountId, bucket: 'test-bucket', key: 'complete.zip', fileName: 'complete.zip', fileSize: PART_SIZE * 2 },
    })
    const { taskId, uploadId } = JSON.parse(initRes.body)

    vi.mocked(mockAdapter.completeMultipartUpload).mockClear()
    const res = await app.inject({
      method: 'POST', url: '/api/transfer/upload/complete',
      payload: { taskId, accountId, bucket: 'test-bucket', key: 'complete.zip', uploadId,
        parts: [{ PartNumber: 1, ETag: 'etag1' }, { PartNumber: 2, ETag: 'etag2' }] },
    })
    expect(res.statusCode).toBe(200)
    expect(vi.mocked(mockAdapter.completeMultipartUpload)).toHaveBeenCalledOnce()

    const tasksRes = await app.inject({ method: 'GET', url: '/api/transfer/tasks?status=completed' })
    const { tasks } = JSON.parse(tasksRes.body)
    expect(tasks.some((t: { id: string }) => t.id === taskId)).toBe(true)
  })
})

describe('POST /api/transfer/upload/abort', () => {
  it('调用 abortMultipartUpload', async () => {
    const initRes = await app.inject({
      method: 'POST', url: '/api/transfer/upload/init',
      payload: { accountId, bucket: 'test-bucket', key: 'abort.zip', fileName: 'abort.zip', fileSize: PART_SIZE * 2 },
    })
    const { taskId, uploadId } = JSON.parse(initRes.body)

    vi.mocked(mockAdapter.abortMultipartUpload).mockClear()
    const res = await app.inject({
      method: 'POST', url: '/api/transfer/upload/abort',
      payload: { taskId, accountId, bucket: 'test-bucket', key: 'abort.zip', uploadId },
    })
    expect(res.statusCode).toBe(200)
    expect(vi.mocked(mockAdapter.abortMultipartUpload)).toHaveBeenCalledOnce()
  })
})

describe('GET /api/transfer/download', () => {
  it('返回预签名下载 URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/transfer/download?accountId=${accountId}&bucket=test-bucket&key=file.txt`,
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).url).toBeTruthy()
  })
})

describe('DELETE /api/transfer/tasks/:id', () => {
  it('删除任务记录', async () => {
    const initRes = await app.inject({
      method: 'POST', url: '/api/transfer/upload/init',
      payload: { accountId, bucket: 'test-bucket', key: 'del.txt', fileName: 'del.txt', fileSize: 100 },
    })
    const { taskId } = JSON.parse(initRes.body)

    const res = await app.inject({ method: 'DELETE', url: `/api/transfer/tasks/${taskId}` })
    expect(res.statusCode).toBe(200)

    const listRes = await app.inject({ method: 'GET', url: '/api/transfer/tasks' })
    const { tasks } = JSON.parse(listRes.body)
    expect(tasks.find((t: { id: string }) => t.id === taskId)).toBeUndefined()
  })
})

describe('POST /api/transfer/tasks/clear-completed', () => {
  it('清空已完成任务', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/transfer/tasks/clear-completed' })
    expect(res.statusCode).toBe(200)
  })
})
