/**
 * 文件预览路由
 *
 * 提供缩略图生成（图片文件）功能。
 * 视频/音频/文档的预览通过前端直接获取下载 URL 实现，
 * 无需后端介入。
 */

import type { FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import { dbGet } from '../db'
import { decryptObject } from '../crypto'
import { getAdapter, type ProviderType } from '../storage/registry'
import type { ProviderConfig } from '../storage/types'
import { config } from '../config'
import axios from 'axios'
import sharp from 'sharp'

interface AccountRow { id: string; provider: string; config: string }

function resolveAdapter(accountId: string) {
  const row = dbGet<AccountRow>('SELECT id, provider, config FROM accounts WHERE id = ?', [accountId])
  if (!row) throw Object.assign(new Error('Account not found'), { statusCode: 404 })
  return getAdapter(row.id, row.provider as ProviderType, decryptObject<ProviderConfig>(row.config))
}

export async function previewRoutes(app: FastifyInstance): Promise<void> {

  // ----------------------------------------------------------------
  // GET /api/preview/thumbnail — 生成并缓存图片缩略图
  // ----------------------------------------------------------------
  app.get<{
    Querystring: {
      accountId: string
      bucket: string
      key: string
      width?: string
      height?: string
    }
  }>('/api/preview/thumbnail', async (req, reply) => {
    // 整个处理器均在 try/catch 内，任何步骤失败都静默返回 404
    // （不用 req.log.warn 避免日志写入本身触发二次异常导致 500）
    try {
      const { accountId, bucket, key } = req.query
      const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(Math.round(v), lo), hi)
      const width  = clamp(parseInt(req.query.width  ?? '200', 10), 16, 800)
      const height = clamp(parseInt(req.query.height ?? '200', 10), 16, 800)

      const cacheKey = Buffer.from(`${accountId}:${bucket}:${key}:${width}x${height}`)
        .toString('base64').replace(/[/+=]/g, '_')
      const cachePath = path.join(config.thumbCacheDir, `${cacheKey}.webp`)

      if (fs.existsSync(cachePath)) {
        reply.header('Content-Type', 'image/webp')
        reply.header('Cache-Control', 'public, max-age=86400')
        return reply.send(fs.createReadStream(cachePath))
      }

      fs.mkdirSync(config.thumbCacheDir, { recursive: true })

      const adapter = resolveAdapter(accountId)
      const downloadUrl = await adapter.getPresignedDownloadUrl(bucket, key, 300)

      const { data } = await axios.get<ArrayBuffer>(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024,
      })

      const thumbnail = await sharp(Buffer.from(data))
        .resize(width, height, { fit: 'cover', position: 'centre' })
        .webp({ quality: 80 })
        .toBuffer()

      fs.writeFileSync(cachePath, thumbnail)

      reply.header('Content-Type', 'image/webp')
      reply.header('Cache-Control', 'public, max-age=86400')
      return reply.send(thumbnail)
    } catch {
      // 缩略图失败不暴露 500，让 <img> 的 onerror 静默处理
      return reply.code(404).send()
    }
  })

  // ----------------------------------------------------------------
  // GET /api/preview/text — 读取文本文件内容（用于在线预览/编辑）
  // ----------------------------------------------------------------
  app.get<{
    Querystring: { accountId: string; bucket: string; key: string }
  }>('/api/preview/text', async (req, reply) => {
    const { accountId, bucket, key } = req.query
    const adapter = resolveAdapter(accountId)
    const downloadUrl = await adapter.getPresignedDownloadUrl(bucket, key, 300)

    const response = await axios.get<string>(downloadUrl, {
      responseType: 'text',
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024,  // 文本文件最大 10MB
    })

    reply.header('Content-Type', 'text/plain; charset=utf-8')
    return reply.send(response.data)
  })

  // ----------------------------------------------------------------
  // PUT /api/preview/text — 保存文本文件（在线编辑后保存）
  // ----------------------------------------------------------------
  app.put<{
    Querystring: { accountId: string; bucket: string; key: string }
    Body: string
  }>('/api/preview/text', {
    config: { rawBody: true },
  }, async (req) => {
    const { accountId, bucket, key } = req.query
    const adapter = resolveAdapter(accountId)

    const content = req.body as unknown as string
    const contentType = key.endsWith('.md') ? 'text/markdown' : 'text/plain'

    // 对于小文件直接使用预签名 PUT
    const putUrl = await adapter.getPresignedPutUrl(bucket, key, { contentType, expires: 300 })

    await axios.put(putUrl, content, {
      headers: { 'Content-Type': contentType },
      timeout: 30000,
    })

    return { ok: true }
  })
}
