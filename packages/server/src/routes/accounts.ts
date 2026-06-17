/**
 * 账户管理路由
 *
 * 提供账户的增删改查、连通性测试和 Bucket 列表接口。
 * AK/SK 在写入数据库前加密，读取时不返回原始凭证。
 */

import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { dbAll, dbGet, dbRun } from '../db'
import { encryptObject, decryptObject } from '../crypto'
import { getAdapter, invalidateAdapter, getProviderMeta, type ProviderType } from '../storage/registry'
import type { ProviderConfig } from '../storage/types'

interface AccountRow {
  id: string
  name: string
  provider: string
  config: string  // encrypted JSON
  sort_order: number
  created_at: number
  updated_at: number
}

/** 从数据库行构建安全的账户对象（不暴露 config 明文） */
function safeAccount(row: AccountRow) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  // ----------------------------------------------------------------
  // GET /api/providers — 支持的提供商列表（含配置字段定义）
  // ----------------------------------------------------------------
  app.get('/api/providers', async () => {
    return { providers: getProviderMeta() }
  })

  // ----------------------------------------------------------------
  // GET /api/accounts — 列出所有账户
  // ----------------------------------------------------------------
  app.get('/api/accounts', async () => {
    const rows = dbAll<AccountRow>(
      'SELECT * FROM accounts ORDER BY sort_order ASC, created_at ASC',
    )
    return { accounts: rows.map(safeAccount) }
  })

  // ----------------------------------------------------------------
  // POST /api/accounts — 新建账户
  // ----------------------------------------------------------------
  app.post<{
    Body: { name: string; provider: ProviderType; config: ProviderConfig }
  }>('/api/accounts', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'provider', 'config'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          provider: { type: 'string' },
          config: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    const { name, provider, config } = req.body
    const id = nanoid()
    const now = Date.now()
    const encryptedConfig = encryptObject(config as Record<string, unknown>)

    dbRun(
      `INSERT INTO accounts (id, name, provider, config, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [id, name, provider, encryptedConfig, now, now],
    )

    const row = dbGet<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id])!
    reply.code(201)
    return { account: safeAccount(row) }
  })

  // ----------------------------------------------------------------
  // PUT /api/accounts/:id — 更新账户
  // ----------------------------------------------------------------
  app.put<{
    Params: { id: string }
    Body: { name?: string; provider?: ProviderType; config?: ProviderConfig }
  }>('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params
    const row = dbGet<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id])
    if (!row) {
      reply.code(404)
      return { error: 'Account not found' }
    }

    const name = req.body.name ?? row.name
    const provider = req.body.provider ?? row.provider
    const config = req.body.config
      ? encryptObject(req.body.config as Record<string, unknown>)
      : row.config

    dbRun(
      `UPDATE accounts SET name = ?, provider = ?, config = ?, updated_at = ? WHERE id = ?`,
      [name, provider, config, Date.now(), id],
    )

    // 清除适配器缓存，下次请求重新初始化
    invalidateAdapter(id)

    const updated = dbGet<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id])!
    return { account: safeAccount(updated) }
  })

  // ----------------------------------------------------------------
  // DELETE /api/accounts/:id — 删除账户
  // ----------------------------------------------------------------
  app.delete<{ Params: { id: string } }>('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params
    const row = dbGet<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id])
    if (!row) {
      reply.code(404)
      return { error: 'Account not found' }
    }

    dbRun('DELETE FROM accounts WHERE id = ?', [id])
    invalidateAdapter(id)
    reply.code(204)
  })

  // ----------------------------------------------------------------
  // POST /api/accounts/:id/test — 测试连接
  // ----------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/api/accounts/:id/test', async (req, reply) => {
    const { id } = req.params
    const row = dbGet<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id])
    if (!row) {
      reply.code(404)
      return { error: 'Account not found' }
    }

    try {
      const cfg = decryptObject<ProviderConfig>(row.config)
      const adapter = getAdapter(id, row.provider as ProviderType, cfg)
      await adapter.listBuckets()
      return { ok: true }
    } catch (err) {
      reply.code(200)  // 返回 200 但附带错误信息，前端统一处理
      return { ok: false, error: (err as Error).message }
    }
  })

  // ----------------------------------------------------------------
  // GET /api/accounts/:id/buckets — 列出账户下的 Bucket
  // ----------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/api/accounts/:id/buckets', async (req, reply) => {
    const { id } = req.params
    const row = dbGet<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id])
    if (!row) {
      reply.code(404)
      return { error: 'Account not found' }
    }

    const cfg = decryptObject<ProviderConfig>(row.config)
    const adapter = getAdapter(id, row.provider as ProviderType, cfg)
    const buckets = await adapter.listBuckets()

    // 更新 buckets 缓存
    const now = Date.now()
    dbRun('DELETE FROM buckets_cache WHERE account_id = ?', [id])
    for (const b of buckets) {
      dbRun(
        `INSERT OR REPLACE INTO buckets_cache (id, account_id, name, region, cached_at)
         VALUES (?, ?, ?, ?, ?)`,
        [nanoid(), id, b.name, b.region ?? null, now],
      )
    }

    return { buckets }
  })

  // ----------------------------------------------------------------
  // PATCH /api/accounts/reorder — 更新账户排序
  // ----------------------------------------------------------------
  app.patch<{
    Body: { orders: Array<{ id: string; sortOrder: number }> }
  }>('/api/accounts/reorder', async (req) => {
    for (const { id, sortOrder } of req.body.orders) {
      dbRun('UPDATE accounts SET sort_order = ? WHERE id = ?', [sortOrder, id])
    }
    return { ok: true }
  })
}
