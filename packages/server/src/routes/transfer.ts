/**
 * 传输路由
 *
 * 采用"预签名 URL 直传"策略：
 *   服务端生成预签名 URL → 客户端直接向云存储上传/下载
 * 这样流量不经过本地服务器，性能最优。
 *
 * 分片上传流程：
 *   1. POST /transfer/upload/init      → 服务端向云存储发起分片上传，返回 uploadId
 *   2. POST /transfer/upload/part-url  → 服务端生成各分片预签名 URL，客户端并行直传
 *   3. POST /transfer/upload/complete  → 服务端通知云存储合并分片
 *   4. POST /transfer/upload/abort     → 中止分片上传
 */

import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { dbGet, dbAll, dbRun } from '../db'
import { decryptObject } from '../crypto'
import { getAdapter, type ProviderType } from '../storage/registry'
import type { ProviderConfig, CompletedPart } from '../storage/types'

/** 单个分片大小：10MB */
const PART_SIZE = 10 * 1024 * 1024

interface AccountRow { id: string; provider: string; config: string }

function resolveAdapter(accountId: string) {
  const row = dbGet<AccountRow>('SELECT id, provider, config FROM accounts WHERE id = ?', [accountId])
  if (!row) throw Object.assign(new Error('Account not found'), { statusCode: 404 })
  return getAdapter(row.id, row.provider as ProviderType, decryptObject<ProviderConfig>(row.config))
}

export async function transferRoutes(app: FastifyInstance): Promise<void> {

  // ----------------------------------------------------------------
  // POST /api/transfer/upload/init — 发起上传任务
  // ----------------------------------------------------------------
  app.post<{
    Body: {
      accountId: string
      bucket: string
      key: string
      fileName: string
      fileSize: number
      contentType?: string
    }
  }>('/api/transfer/upload/init', async (req, reply) => {
    const { accountId, bucket, key, fileName, fileSize, contentType } = req.body
    const adapter = resolveAdapter(accountId)
    const now = Date.now()
    const taskId = nanoid()

    let uploadId: string | null = null
    let presignedUrl: string | null = null
    // 七牛、又拍云不支持预签名 PUT，需客户端将文件 POST 到服务端再转发
    const proxyUpload = !adapter.supportsPresignedPut

    if (!proxyUpload) {
      if (fileSize >= PART_SIZE) {
        // 支持直传的大文件：分片上传
        uploadId = await adapter.initiateMultipartUpload(bucket, key, { contentType })
      } else {
        // 支持直传的小文件：单次预签名 PUT
        presignedUrl = await adapter.getPresignedPutUrl(bucket, key, { contentType, expires: 7200 })
      }
    }

    dbRun(
      `INSERT INTO transfer_tasks
       (id, type, account_id, bucket, key, file_name, total_size, status, upload_id, created_at, updated_at)
       VALUES (?, 'upload', ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [taskId, accountId, bucket, key, fileName, fileSize, uploadId, now, now],
    )

    reply.code(201)
    return {
      taskId,
      uploadId,
      presignedUrl,
      proxyUpload,
      contentType: contentType ?? 'application/octet-stream',
      partSize: PART_SIZE,
      totalParts: uploadId ? Math.ceil(fileSize / PART_SIZE) : 1,
    }
  })

  // ----------------------------------------------------------------
  // POST /api/transfer/upload/part-url — 获取分片上传预签名 URL
  // ----------------------------------------------------------------
  app.post<{
    Body: {
      accountId: string
      bucket: string
      key: string
      uploadId: string
      partNumbers: number[]  // 需要上传的分片编号列表
    }
  }>('/api/transfer/upload/part-url', async (req) => {
    const { accountId, bucket, key, uploadId, partNumbers } = req.body
    const adapter = resolveAdapter(accountId)

    const urls: Record<number, string> = {}
    for (const partNumber of partNumbers) {
      urls[partNumber] = await adapter.getPresignedPartUrl(bucket, key, uploadId, partNumber, 7200)
    }

    return { urls }
  })

  // ----------------------------------------------------------------
  // POST /api/transfer/upload/complete — 完成分片上传
  // ----------------------------------------------------------------
  app.post<{
    Body: {
      taskId: string
      accountId: string
      bucket: string
      key: string
      uploadId: string
      parts: CompletedPart[]
    }
  }>('/api/transfer/upload/complete', async (req) => {
    const { taskId, accountId, bucket, key, uploadId, parts } = req.body
    const adapter = resolveAdapter(accountId)

    // 按分片编号排序（S3 要求严格有序）
    const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber)
    await adapter.completeMultipartUpload(bucket, key, uploadId, sortedParts)

    dbRun(
      `UPDATE transfer_tasks SET status = 'completed', transferred = total_size, updated_at = ? WHERE id = ?`,
      [Date.now(), taskId],
    )

    return { ok: true }
  })

  // ----------------------------------------------------------------
  // POST /api/transfer/upload/abort — 中止分片上传
  // ----------------------------------------------------------------
  app.post<{
    Body: { taskId: string; accountId: string; bucket: string; key: string; uploadId: string }
  }>('/api/transfer/upload/abort', async (req) => {
    const { taskId, accountId, bucket, key, uploadId } = req.body
    const adapter = resolveAdapter(accountId)

    await adapter.abortMultipartUpload(bucket, key, uploadId).catch(() => {})

    dbRun(
      `UPDATE transfer_tasks SET status = 'cancelled', updated_at = ? WHERE id = ?`,
      [Date.now(), taskId],
    )

    return { ok: true }
  })

  // ----------------------------------------------------------------
  // POST /api/transfer/upload/progress — 更新传输进度（客户端轮询上报）
  // ----------------------------------------------------------------
  app.post<{
    Body: { taskId: string; transferred: number; parts?: CompletedPart[] }
  }>('/api/transfer/upload/progress', async (req) => {
    const { taskId, transferred, parts } = req.body
    dbRun(
      `UPDATE transfer_tasks SET transferred = ?, parts = ?, status = 'running', updated_at = ? WHERE id = ?`,
      [transferred, parts ? JSON.stringify(parts) : null, Date.now(), taskId],
    )
    return { ok: true }
  })

  // ----------------------------------------------------------------
  // GET /api/transfer/download — 获取下载预签名 URL
  // ----------------------------------------------------------------
  app.get<{
    Querystring: { accountId: string; bucket: string; key: string; expires?: string }
  }>('/api/transfer/download', async (req) => {
    const { accountId, bucket, key, expires = '3600' } = req.query
    const adapter = resolveAdapter(accountId)
    const url = await adapter.getPresignedDownloadUrl(bucket, key, parseInt(expires, 10))
    return { url }
  })

  // ----------------------------------------------------------------
  // GET /api/transfer/tasks — 列出传输任务（默认取近 100 条）
  // ----------------------------------------------------------------
  app.get<{
    Querystring: { status?: string; type?: string; limit?: string }
  }>('/api/transfer/tasks', async (req) => {
    const { status, type, limit = '100' } = req.query
    let sql = 'SELECT * FROM transfer_tasks WHERE 1=1'
    const params: (string | number)[] = []

    if (status) { sql += ' AND status = ?'; params.push(status) }
    if (type) { sql += ' AND type = ?'; params.push(type) }
    sql += ' ORDER BY created_at DESC LIMIT ?'
    params.push(parseInt(limit, 10))

    // 将 DB snake_case 字段映射为前端期望的 camelCase
    type TaskRow = {
      id: string; type: string; account_id: string; bucket: string; key: string
      file_name: string; total_size: number; transferred: number; status: string
      upload_id: string | null; parts: string | null; error: string | null
      created_at: number; updated_at: number
    }
    const rows = dbAll<TaskRow>(sql, params)
    const tasks = rows.map(r => ({
      id: r.id,
      type: r.type,
      accountId: r.account_id,
      bucket: r.bucket,
      key: r.key,
      fileName: r.file_name,
      totalSize: r.total_size,
      transferred: r.transferred,
      status: r.status,
      uploadId: r.upload_id,
      parts: r.parts ? JSON.parse(r.parts) : undefined,
      error: r.error,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
    return { tasks }
  })

  // ----------------------------------------------------------------
  // DELETE /api/transfer/tasks/:id — 取消/删除任务记录
  // ----------------------------------------------------------------
  app.delete<{ Params: { id: string } }>('/api/transfer/tasks/:id', async (req) => {
    const task = dbGet<{ upload_id: string; account_id: string; bucket: string; key: string; status: string }>(
      'SELECT upload_id, account_id, bucket, key, status FROM transfer_tasks WHERE id = ?',
      [req.params.id],
    )

    if (task?.upload_id && task.status === 'running') {
      // 自动中止未完成的分片上传
      const adapter = resolveAdapter(task.account_id)
      await adapter.abortMultipartUpload(task.bucket, task.key, task.upload_id).catch(() => {})
    }

    dbRun('DELETE FROM transfer_tasks WHERE id = ?', [req.params.id])
    return { ok: true }
  })

  // ----------------------------------------------------------------
  // POST /api/transfer/tasks/clear-completed — 清空已完成任务
  // ----------------------------------------------------------------
  app.post('/api/transfer/tasks/clear-completed', async () => {
    dbRun(`DELETE FROM transfer_tasks WHERE status IN ('completed', 'cancelled', 'failed')`)
    return { ok: true }
  })

  // ----------------------------------------------------------------
  // POST /api/transfer/upload/proxy — 服务端代理上传
  //
  // 用于七牛、又拍云等不支持预签名 PUT 的提供商：
  // 客户端将文件 multipart POST 到此端点，服务端通过 SDK 推送到云存储。
  // ----------------------------------------------------------------
  app.post('/api/transfer/upload/proxy', async (req, reply) => {
    const data = await req.file()
    if (!data) {
      reply.code(400)
      return { error: 'No file provided' }
    }

    // fields 中获取元信息
    const fields = data.fields as Record<string, { value: string }>
    const taskId   = fields.taskId?.value
    const accountId = fields.accountId?.value
    const bucket   = fields.bucket?.value
    const key      = fields.key?.value
    const contentType = data.mimetype || 'application/octet-stream'

    if (!accountId || !bucket || !key) {
      reply.code(400)
      return { error: 'Missing required fields: accountId, bucket, key' }
    }

    // 收集文件数据到 Buffer
    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const buffer = Buffer.concat(chunks)

    req.log.info(
      { accountId, bucket, key, contentType, bufferSize: buffer.length },
      'proxy upload: starting',
    )

    const adapter = resolveAdapter(accountId)

    try {
      await adapter.uploadBuffer(bucket, key, buffer, contentType)
    } catch (uploadErr) {
      const msg = (uploadErr as Error).message
      req.log.error({ bucket, key, err: msg }, 'proxy upload: SDK error')
      // 更新任务状态为失败
      if (taskId) {
        dbRun(
          `UPDATE transfer_tasks SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
          [msg, Date.now(), taskId],
        )
      }
      reply.code(500)
      return { error: msg }
    }

    req.log.info({ bucket, key, size: buffer.length }, 'proxy upload: success')

    if (taskId) {
      dbRun(
        `UPDATE transfer_tasks SET status = 'completed', transferred = total_size, updated_at = ? WHERE id = ?`,
        [Date.now(), taskId],
      )
    }

    return { ok: true }
  })
}
