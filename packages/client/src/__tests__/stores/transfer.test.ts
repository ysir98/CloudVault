/**
 * stores/transfer 单元测试
 *
 * 专注 store 内部状态管理：进度计算、并发调度、状态转换。
 * 不测试实际上传逻辑（需要真实云存储）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTransferStore } from '../../stores/transfer'
import type { TransferTask } from '../../types'

vi.mock('../../api/transfer', () => ({
  transferApi: {
    initUpload: vi.fn().mockResolvedValue({
      taskId: 'task-new',
      uploadId: null,
      presignedUrl: 'https://s3.example.com/put-url',
      partSize: 10 * 1024 * 1024,
      totalParts: 1,
    }),
    listTasks: vi.fn().mockResolvedValue([]),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    clearCompleted: vi.fn().mockResolvedValue(undefined),
    abortUpload: vi.fn().mockResolvedValue(undefined),
    getPartUrls: vi.fn().mockResolvedValue({}),
    completeUpload: vi.fn().mockResolvedValue(undefined),
    reportProgress: vi.fn().mockResolvedValue(undefined),
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.example.com/download'),
    uploadPart: vi.fn().mockResolvedValue({ etag: 'test-etag' }),
  },
}))

function makeTask(overrides: Partial<TransferTask> = {}): TransferTask {
  return {
    id: `task-${Math.random()}`,
    type: 'upload',
    accountId: 'acc-1',
    bucket: 'bucket',
    key: 'file.txt',
    fileName: 'file.txt',
    totalSize: 1024 * 1024,
    transferred: 0,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('totalProgress', () => {
  it('无任务时返回 100%', () => {
    const store = useTransferStore()
    expect(store.totalProgress).toBe(100)
  })

  it('全部完成时返回 100%', () => {
    const store = useTransferStore()
    store.tasks.push(
      makeTask({ status: 'completed', totalSize: 1000, transferred: 1000 }),
      makeTask({ status: 'completed', totalSize: 500, transferred: 500 }),
    )
    // 已完成任务不计入 pending/running 计算
    expect(store.totalProgress).toBe(100)
  })

  it('一个运行中任务 50% 完成时返回 50', () => {
    const store = useTransferStore()
    store.tasks.push(
      makeTask({ status: 'running', totalSize: 1000, transferred: 500 }),
    )
    expect(store.totalProgress).toBe(50)
  })

  it('多个任务混合进度的加权计算', () => {
    const store = useTransferStore()
    store.tasks.push(
      makeTask({ status: 'running', totalSize: 1000, transferred: 1000 }),  // 100%
      makeTask({ status: 'pending', totalSize: 1000, transferred: 0 }),     // 0%
    )
    // (1000 + 0) / (1000 + 1000) = 50%
    expect(store.totalProgress).toBe(50)
  })
})

describe('computed task filters', () => {
  it('pendingTasks 只包含 status=pending 的任务', () => {
    const store = useTransferStore()
    store.tasks.push(
      makeTask({ status: 'pending' }),
      makeTask({ status: 'running' }),
      makeTask({ status: 'completed' }),
    )
    expect(store.pendingTasks).toHaveLength(1)
  })

  it('runningTasks 只包含 status=running 的任务', () => {
    const store = useTransferStore()
    store.tasks.push(
      makeTask({ status: 'running' }),
      makeTask({ status: 'running' }),
      makeTask({ status: 'pending' }),
    )
    expect(store.runningTasks).toHaveLength(2)
  })

  it('completedTasks 只包含 status=completed 的任务', () => {
    const store = useTransferStore()
    store.tasks.push(
      makeTask({ status: 'completed' }),
      makeTask({ status: 'failed' }),
    )
    expect(store.completedTasks).toHaveLength(1)
  })

  it('failedTasks 只包含 status=failed 的任务', () => {
    const store = useTransferStore()
    store.tasks.push(
      makeTask({ status: 'failed' }),
      makeTask({ status: 'cancelled' }),
    )
    expect(store.failedTasks).toHaveLength(1)
  })
})

describe('loadTasks', () => {
  it('从 API 加载任务列表', async () => {
    const { transferApi } = await import('../../api/transfer')
    vi.mocked(transferApi.listTasks).mockResolvedValueOnce([
      makeTask({ id: 'loaded-task', status: 'completed' }),
    ])

    const store = useTransferStore()
    await store.loadTasks()

    expect(store.tasks).toHaveLength(1)
    expect(store.tasks[0].id).toBe('loaded-task')
  })
})

describe('cancelTask', () => {
  it('从任务列表移除已取消的任务', async () => {
    const store = useTransferStore()
    const task = makeTask({ id: 'cancel-me', status: 'pending' })
    store.tasks.push(task)

    await store.cancelTask('cancel-me')

    expect(store.tasks.find(t => t.id === 'cancel-me')).toBeUndefined()
  })

  it('取消有 uploadId 的运行中任务时调用 abortUpload', async () => {
    const { transferApi } = await import('../../api/transfer')
    const store = useTransferStore()
    const task = makeTask({ id: 'abort-me', status: 'running', uploadId: 'upload-123' })
    store.tasks.push(task)

    await store.cancelTask('abort-me')

    expect(transferApi.abortUpload).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'abort-me', uploadId: 'upload-123' }),
    )
  })
})

describe('clearCompleted', () => {
  it('从列表移除已完成和已取消的任务', async () => {
    const store = useTransferStore()
    store.tasks.push(
      makeTask({ status: 'completed' }),
      makeTask({ status: 'cancelled' }),
      makeTask({ status: 'running' }),
      makeTask({ status: 'failed' }),
    )

    await store.clearCompleted()

    expect(store.tasks.every(t => t.status !== 'completed' && t.status !== 'cancelled')).toBe(true)
    expect(store.tasks).toHaveLength(2)  // running + failed 保留
  })
})

describe('concurrency', () => {
  it('默认并发数为 3', () => {
    const store = useTransferStore()
    expect(store.concurrency).toBe(3)
  })

  it('可以修改并发数', () => {
    const store = useTransferStore()
    store.concurrency = 5
    expect(store.concurrency).toBe(5)
  })
})
