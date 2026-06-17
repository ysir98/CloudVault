/**
 * 分享链接路由
 *
 * 生成临时访问链接（预签名 URL），支持设置过期时间和访问密码。
 * 密码保护通过生成随机短链接并在本地数据库中验证实现。
 */

import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { dbGet, dbAll, dbRun } from '../db'
import { decryptObject } from '../crypto'
import { getAdapter, type ProviderType } from '../storage/registry'
import type { ProviderConfig } from '../storage/types'

interface AccountRow { id: string; provider: string; config: string }

function resolveAdapter(accountId: string) {
  const row = dbGet<AccountRow>('SELECT id, provider, config FROM accounts WHERE id = ?', [accountId])
  if (!row) throw Object.assign(new Error('Account not found'), { statusCode: 404 })
  return getAdapter(row.id, row.provider as ProviderType, decryptObject<ProviderConfig>(row.config))
}

export async function shareRoutes(app: FastifyInstance): Promise<void> {

  // ----------------------------------------------------------------
  // POST /api/share — 创建分享链接
  // ----------------------------------------------------------------
  app.post<{
    Body: {
      accountId: string
      bucket: string
      key: string
      expiresIn?: number   // 秒，默认 7200
      password?: string    // 可选访问密码
    }
  }>('/api/share', async (req, reply) => {
    const { accountId, bucket, key, expiresIn = 7200, password } = req.body
    const adapter = resolveAdapter(accountId)

    const url = await adapter.getPresignedDownloadUrl(bucket, key, expiresIn)
    const expiresAt = Date.now() + expiresIn * 1000
    const id = nanoid(10)

    dbRun(
      `INSERT INTO share_links (id, account_id, bucket, key, url, expires_at, password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, accountId, bucket, key, url, expiresAt, password ?? null, Date.now()],
    )

    const cdnUrl = adapter.getCdnUrl(bucket, key)

    reply.code(201)
    return {
      id,
      url,        // 预签名原始 URL
      cdnUrl,     // CDN 加速 URL（如已配置）
      expiresAt,
      hasPassword: !!password,
    }
  })

  // ----------------------------------------------------------------
  // GET /api/share — 列出分享链接
  // ----------------------------------------------------------------
  app.get<{ Querystring: { accountId?: string } }>('/api/share', async (req) => {
    const { accountId } = req.query
    const rows = accountId
      ? dbAll(`SELECT id, account_id, bucket, key, expires_at, created_at
               FROM share_links WHERE account_id = ? ORDER BY created_at DESC`, [accountId])
      : dbAll(`SELECT id, account_id, bucket, key, expires_at, created_at
               FROM share_links ORDER BY created_at DESC LIMIT 100`)

    return { shares: rows }
  })

  // ----------------------------------------------------------------
  // GET /api/share/:id/resolve — 通过分享 ID 获取实际 URL（含密码校验）
  // ----------------------------------------------------------------
  app.get<{
    Params: { id: string }
    Querystring: { password?: string }
  }>('/api/share/:id/resolve', async (req, reply) => {
    const { id } = req.params
    const row = dbGet<{
      url: string; expires_at: number | null; password: string | null
    }>('SELECT url, expires_at, password FROM share_links WHERE id = ?', [id])

    if (!row) {
      reply.code(404)
      return { error: 'Share link not found' }
    }

    if (row.expires_at && row.expires_at < Date.now()) {
      reply.code(410)
      return { error: 'Share link has expired' }
    }

    if (row.password && row.password !== req.query.password) {
      reply.code(403)
      return { error: 'Invalid password' }
    }

    return { url: row.url }
  })

  // ----------------------------------------------------------------
  // DELETE /api/share/:id — 删除分享链接
  // ----------------------------------------------------------------
  app.delete<{ Params: { id: string } }>('/api/share/:id', async (req) => {
    dbRun('DELETE FROM share_links WHERE id = ?', [req.params.id])
    return { ok: true }
  })

  // ----------------------------------------------------------------
  // POST /api/share/acl — 设置对象 ACL（公开/私有）
  // ----------------------------------------------------------------
  app.post<{
    Body: {
      accountId: string
      bucket: string
      key: string
      acl: 'private' | 'public-read'
    }
  }>('/api/share/acl', async (req) => {
    const { accountId, bucket, key, acl } = req.body
    const adapter = resolveAdapter(accountId)
    await adapter.setObjectAcl(bucket, key, acl)
    return { ok: true }
  })

  // ----------------------------------------------------------------
  // GET /api/share/cdn — 获取 CDN 加速链接
  // ----------------------------------------------------------------
  app.get<{
    Querystring: { accountId: string; bucket: string; key: string }
  }>('/api/share/cdn', async (req, reply) => {
    const { accountId, bucket, key } = req.query
    const adapter = resolveAdapter(accountId)
    const url = adapter.getCdnUrl(bucket, key)

    if (!url) {
      reply.code(404)
      return { error: 'CDN not configured for this account' }
    }

    return { url }
  })
}
