/**
 * 传输 Store
 *
 * 管理上传/下载队列，实现分片上传、断点续传和进度追踪。
 * 并发数可配置，默认 3 个同时传输。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { transferApi } from '@/api/transfer'
import type { TransferTask, CompletedPart } from '@/types'

/** 单个分片大小：10MB */
const PART_SIZE = 10 * 1024 * 1024

/** 默认同时传输任务数 */
const DEFAULT_CONCURRENCY = 3

interface UploadJob {
  taskId: string
  accountId: string
  bucket: string
  key: string
  file: File
  uploadId: string | null
  presignedUrl: string | null
  /** 与预签名 URL 签名时一致的 ContentType，上传时必须匹配否则 S3 返回签名错误 */
  contentType: string
  /** true = 七牛/又拍云，通过服务端代理上传而非客户端直传 */
  proxyUpload: boolean
  totalParts: number
  completedParts: CompletedPart[]
  abortController: AbortController
}

interface TaskDoneEvent {
  task: TransferTask
  success: boolean
  error?: string
}

export const useTransferStore = defineStore('transfer', () => {
  const tasks = ref<TransferTask[]>([])
  const concurrency = ref(DEFAULT_CONCURRENCY)

  // 运行时状态（不持久化到 DB）
  const activeJobs = ref<Map<string, UploadJob>>(new Map())
  const runningCount = ref(0)

  /** 每个任务完成/失败时调用（由视图层注册，用于刷新文件列表或弹 toast） */
  const _onTaskDone = ref<((e: TaskDoneEvent) => void) | null>(null)

  function onTaskDone(cb: (e: TaskDoneEvent) => void) {
    _onTaskDone.value = cb
  }

  const pendingTasks = computed(() => tasks.value.filter(t => t.status === 'pending'))
  const runningTasks = computed(() => tasks.value.filter(t => t.status === 'running'))
  const completedTasks = computed(() => tasks.value.filter(t => t.status === 'completed'))
  const failedTasks = computed(() => tasks.value.filter(t => t.status === 'failed'))

  const totalProgress = computed(() => {
    const running = tasks.value.filter(t => t.status === 'running' || t.status === 'pending')
    if (!running.length) return 100
    const total = running.reduce((s, t) => s + t.totalSize, 0)
    const done = running.reduce((s, t) => s + t.transferred, 0)
    return total ? Math.round((done / total) * 100) : 0
  })

  async function loadTasks() {
    tasks.value = await transferApi.listTasks({ limit: 100 })
  }

  /**
   * 添加文件到上传队列并开始上传
   */
  async function addUpload(
    accountId: string,
    bucket: string,
    prefix: string,
    files: File[],
  ) {
    for (const file of files) {
      const key = prefix ? `${prefix}${file.name}` : file.name

      // 初始化上传任务（获取 uploadId 或 presignedUrl）
      const init = await transferApi.initUpload({
        accountId, bucket, key,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || 'application/octet-stream',
      })

      const task: TransferTask = {
        id: init.taskId,
        type: 'upload',
        accountId, bucket, key,
        fileName: file.name,
        totalSize: file.size,
        transferred: 0,
        status: 'pending',
        uploadId: init.uploadId ?? undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      tasks.value.unshift(task)

      // 双重保险：若服务端已明确返回 proxyUpload，直接用；
      // 若返回的 presignedUrl 不是 http(s):// 协议（如旧版 qiniu:// 假 URL），也强制走代理
      const presignedUrl = init.presignedUrl
      const needsProxy = init.proxyUpload ||
        (presignedUrl !== null && presignedUrl !== undefined &&
         !presignedUrl.startsWith('http://') && !presignedUrl.startsWith('https://'))

      const job: UploadJob = {
        taskId: init.taskId,
        accountId, bucket, key, file,
        uploadId: needsProxy ? null : init.uploadId,
        presignedUrl: needsProxy ? null : presignedUrl,
        contentType: init.contentType,
        proxyUpload: needsProxy,
        totalParts: init.totalParts,
        completedParts: [],
        abortController: new AbortController(),
      }

      activeJobs.value.set(init.taskId, job)
      scheduleNext()
    }
  }

  function scheduleNext() {
    if (runningCount.value >= concurrency.value) return

    const pending = tasks.value.find(t => t.status === 'pending' && activeJobs.value.has(t.id))
    if (!pending) return

    runningCount.value++
    pending.status = 'running'
    executeJob(pending.id).finally(() => {
      runningCount.value--
      scheduleNext()  // 完成后自动调度下一个
    })
  }

  async function executeJob(taskId: string) {
    const job = activeJobs.value.get(taskId)
    const task = tasks.value.find(t => t.id === taskId)
    if (!job || !task) return

    try {
      if (job.proxyUpload) {
        // 七牛/又拍云：通过服务端代理上传
        await executeProxyUpload(job, task)
      } else if (job.uploadId) {
        await executeMultipartUpload(job, task)
      } else if (job.presignedUrl) {
        await executeSingleUpload(job, task)
      }
      // 上传成功：触发外部监听器（用于刷新文件列表、显示 toast 等）
      _onTaskDone.value?.({ task: tasks.value.find(t => t.id === taskId)!, success: true })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        updateTaskStatus(taskId, 'paused')
      } else {
        const msg = (err as Error).message || '上传失败'
        updateTaskStatus(taskId, 'failed', msg)
        // 上传失败：通知外部（弹 toast 等）
        _onTaskDone.value?.({ task: tasks.value.find(t => t.id === taskId)!, success: false, error: msg })
      }
    } finally {
      activeJobs.value.delete(taskId)
    }
  }

  /** 代理上传：文件经由本地服务端中转，适用于七牛、又拍云等 */
  async function executeProxyUpload(job: UploadJob, task: TransferTask) {
    const startTime = Date.now()

    await transferApi.proxyUpload(
      job.taskId,
      job.accountId,
      job.bucket,
      job.key,
      job.file,
      (loaded, total) => {
        task.transferred = loaded
        const elapsed = (Date.now() - startTime) / 1000
        task.speed = elapsed > 0 ? loaded / elapsed : 0
        task.remainingSecs = task.speed > 0 ? (total - loaded) / task.speed : 0
      },
    )

    updateTaskStatus(job.taskId, 'completed', undefined, job.file.size)
  }

  async function executeSingleUpload(job: UploadJob, task: TransferTask) {
    const startTime = Date.now()
    let lastTransferred = 0

    await transferApi.uploadPart(
      job.presignedUrl!,
      job.file,
      (loaded, total) => {
        task.transferred = loaded
        const elapsed = (Date.now() - startTime) / 1000
        task.speed = elapsed > 0 ? (loaded - lastTransferred) / elapsed : 0
        task.remainingSecs = task.speed > 0 ? (total - loaded) / task.speed : 0
        lastTransferred = loaded
      },
      job.contentType,  // ← 与预签名 URL 签名时的 ContentType 保持一致
    )

    updateTaskStatus(job.taskId, 'completed', undefined, job.file.size)
  }

  async function executeMultipartUpload(job: UploadJob, task: TransferTask) {
    const { file, uploadId, totalParts, accountId, bucket, key, taskId } = job
    const startTime = Date.now()
    let totalTransferred = job.completedParts.reduce((s, _) => s + PART_SIZE, 0)

    // 已完成的分片编号
    const doneParts = new Set(job.completedParts.map(p => p.PartNumber))

    // 按分片并行上传（单任务内最多 3 个分片并发）
    const PART_CONCURRENCY = 3
    const partQueue: number[] = []
    for (let i = 1; i <= totalParts; i++) {
      if (!doneParts.has(i)) partQueue.push(i)
    }

    while (partQueue.length > 0) {
      const batch = partQueue.splice(0, PART_CONCURRENCY)

      // 批量获取预签名 URL
      const urls = await transferApi.getPartUrls({
        accountId, bucket, key, uploadId: uploadId!, partNumbers: batch,
      })

      await Promise.all(
        batch.map(async (partNumber) => {
          const start = (partNumber - 1) * PART_SIZE
          const end = Math.min(start + PART_SIZE, file.size)
          const blob = file.slice(start, end)

          const { etag } = await transferApi.uploadPart(urls[partNumber], blob, (loaded) => {
            // 更新任务进度
            const elapsed = (Date.now() - startTime) / 1000
            task.transferred = totalTransferred + loaded
            task.speed = elapsed > 0 ? task.transferred / elapsed : 0
            task.remainingSecs = task.speed > 0
              ? (task.totalSize - task.transferred) / task.speed
              : 0
          })

          job.completedParts.push({ PartNumber: partNumber, ETag: etag })
          totalTransferred += end - start
        }),
      )

      // 持久化已完成分片（断点续传）
      await transferApi.reportProgress(taskId, totalTransferred, job.completedParts)
    }

    // 完成分片上传
    await transferApi.completeUpload({
      taskId, accountId, bucket, key,
      uploadId: uploadId!,
      parts: job.completedParts,
    })

    updateTaskStatus(taskId, 'completed', undefined, file.size)
  }

  function updateTaskStatus(
    taskId: string,
    status: TransferTask['status'],
    error?: string,
    transferred?: number,
  ) {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return
    task.status = status
    task.updatedAt = Date.now()
    if (error) task.error = error
    if (transferred !== undefined) task.transferred = transferred
  }

  async function pauseTask(taskId: string) {
    const job = activeJobs.value.get(taskId)
    job?.abortController.abort()
    updateTaskStatus(taskId, 'paused')
  }

  async function resumeTask(taskId: string) {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task || task.status !== 'paused') return

    // 从 DB 重新获取任务状态（含已完成分片）
    const dbTasks = await transferApi.listTasks()
    const dbTask = dbTasks.find(t => t.id === taskId)
    if (!dbTask) return

    // 此处仅更新 UI 状态，实际恢复逻辑需要重新构建 job
    updateTaskStatus(taskId, 'pending')
    scheduleNext()
  }

  async function cancelTask(taskId: string) {
    const job = activeJobs.value.get(taskId)
    job?.abortController.abort()

    const task = tasks.value.find(t => t.id === taskId)
    if (task?.uploadId) {
      await transferApi.abortUpload({
        taskId,
        accountId: task.accountId,
        bucket: task.bucket,
        key: task.key,
        uploadId: task.uploadId,
      }).catch(() => {})
    }

    await transferApi.deleteTask(taskId)
    tasks.value = tasks.value.filter(t => t.id !== taskId)
    activeJobs.value.delete(taskId)
  }

  async function clearCompleted() {
    await transferApi.clearCompleted()
    tasks.value = tasks.value.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
  }

  return {
    tasks, concurrency, runningCount,
    pendingTasks, runningTasks, completedTasks, failedTasks, totalProgress,
    onTaskDone,
    loadTasks, addUpload, pauseTask, resumeTask, cancelTask, clearCompleted,
  }
})
