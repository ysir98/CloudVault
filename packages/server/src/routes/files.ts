/**
 * 文件操作路由
 *
 * 包含：列表、元数据、删除、复制、移动、重命名、
 * 创建文件夹、搜索、标签、收藏夹、回收站。
 */

import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { dbAll, dbGet, dbRun, dbTransaction } from '../db'
import { decryptObject } from '../crypto'
import { getAdapter, type ProviderType } from '../storage/registry'
import type { ProviderConfig } from '../storage/types'

interface AccountRow {
  id: string; provider: string; config: string
}

function getAdapter2(accountId: string) {
  const row = dbGet<AccountRow>('SELECT id, provider, config FROM accounts WHERE id = ?', [accountId])
  if (!row) throw Object.assign(new Error('Account not found'), { statusCode: 404 })
  const cfg = decryptObject<ProviderConfig>(row.config)
  return getAdapter(row.id, row.provider as ProviderType, cfg)
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {

  // ----------------------------------------------------------------
  // GET /api/files/:accountId/:bucket — 列出目录内容
  // ----------------------------------------------------------------
  app.get<{
    Params: { accountId: string; bucket: string }
    Querystring: { prefix?: string; marker?: string; maxKeys?: string }
  }>('/api/files/:accountId/:bucket', async (req) => {
    const { accountId, bucket } = req.params
    const { prefix = '', marker, maxKeys = '200' } = req.query

    const adapter = getAdapter2(accountId)
    const result = await adapter.listObjects(bucket, {
      prefix,
      delimiter: '/',
      marker,
      maxKeys: parseInt(maxKeys, 10),
    })

    // 异步更新文件索引缓存（不阻塞响应）
    const now = Date.now()
    setImmediate(() => {
      dbTransaction(() => {
        for (const obj of result.objects) {
          dbRun(
            `INSERT OR REPLACE INTO file_index
             (id, account_id, bucket, key, size, last_modified, content_type, etag, is_dir, cached_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              nanoid(), accountId, bucket, obj.key,
              obj.size, obj.lastModified.getTime(),
              obj.contentType ?? null, obj.etag ?? null,
              obj.isDir ? 1 : 0, now,
            ],
          )
        }
      })
    })

    return result
  })

  // ----------------------------------------------------------------
  // GET /api/files/:accountId/:bucket/stat — 获取对象元数据
  // ----------------------------------------------------------------
  app.get<{
    Params: { accountId: string; bucket: string }
    Querystring: { key: string }
  }>('/api/files/:accountId/:bucket/stat', async (req) => {
    const { accountId, bucket } = req.params
    const { key } = req.query
    const adapter = getAdapter2(accountId)
    return adapter.headObject(bucket, key)
  })

  // ----------------------------------------------------------------
  // DELETE /api/files/:accountId/:bucket — 批量删除
  // ----------------------------------------------------------------
  app.delete<{
    Params: { accountId: string; bucket: string }
    Body: { keys: string[] }
  }>('/api/files/:accountId/:bucket', {
    schema: {
      body: {
        type: 'object',
        required: ['keys'],
        properties: { keys: { type: 'array', items: { type: 'string' }, minItems: 1 } },
      },
    },
  }, async (req) => {
    const { accountId, bucket } = req.params
    const { keys } = req.body
    const adapter = getAdapter2(accountId)
    await adapter.deleteObjects(bucket, keys)

    // 清除文件索引缓存
    for (const key of keys) {
      dbRun('DELETE FROM file_index WHERE account_id = ? AND bucket = ? AND key = ?', [accountId, bucket, key])
    }
    return { ok: true, deleted: keys.length }
  })

  // ----------------------------------------------------------------
  // POST /api/files/:accountId/:bucket/copy — 复制
  // ----------------------------------------------------------------
  app.post<{
    Params: { accountId: string; bucket: string }
    Body: { items: Array<{ srcKey: string; destBucket?: string; destKey: string }> }
  }>('/api/files/:accountId/:bucket/copy', async (req) => {
    const { accountId, bucket } = req.params
    const adapter = getAdapter2(accountId)

    for (const item of req.body.items) {
      await adapter.copyObject(bucket, item.srcKey, item.destBucket ?? bucket, item.destKey)
    }
    return { ok: true }
  })

  // ----------------------------------------------------------------
  // POST /api/files/:accountId/:bucket/move — 移动（copy + delete）
  // ----------------------------------------------------------------
  app.post<{
    Params: { accountId: string; bucket: string }
    Body: { items: Array<{ srcKey: string; destBucket?: string; destKey: string }> }
  }>('/api/files/:accountId/:bucket/move', async (req) => {
    const { accountId, bucket } = req.params
    const adapter = getAdapter2(accountId)

    for (const item of req.body.items) {
      await adapter.copyObject(bucket, item.srcKey, item.destBucket ?? bucket, item.destKey)
      await adapter.deleteObjects(bucket, [item.srcKey])
    }
    return { ok: true }
  })

  // ----------------------------------------------------------------
  // POST /api/files/:accountId/:bucket/rename — 重命名
  // ----------------------------------------------------------------
  app.post<{
    Params: { accountId: string; bucket: string }
    Body: { oldKey: string; newKey: string }
  }>('/api/files/:accountId/:bucket/rename', async (req) => {
    const { accountId, bucket } = req.params
    const { oldKey, newKey } = req.body
    const adapter = getAdapter2(accountId)
    await adapter.copyObject(bucket, oldKey, bucket, newKey)
    await adapter.deleteObjects(bucket, [oldKey])
    return { ok: true }
  })

  // ----------------------------------------------------------------
  // POST /api/files/:accountId/:bucket/mkdir — 创建文件夹
  // ----------------------------------------------------------------
  app.post<{
    Params: { accountId: string; bucket: string }
    Body: { prefix: string }
  }>('/api/files/:accountId/:bucket/mkdir', async (req) => {
    const { accountId, bucket } = req.params
    const { prefix } = req.body
    const adapter = getAdapter2(accountId)
    await adapter.createFolder(bucket, prefix)
    return { ok: true }
  })

  // ----------------------------------------------------------------
  // GET /api/files/:accountId/search — 跨 Bucket 搜索（基于本地索引）
  // ----------------------------------------------------------------
  app.get<{
    Params: { accountId: string }
    Querystring: {
      q: string
      bucket?: string
      type?: string   // 'image'|'video'|'audio'|'document'|'other'
      minSize?: string
      maxSize?: string
      from?: string
      to?: string
    }
  }>('/api/files/:accountId/search', async (req) => {
    const { accountId } = req.params
    const { q, bucket, type, minSize, maxSize, from, to } = req.query

    let sql = `SELECT * FROM file_index WHERE account_id = ? AND key LIKE ? AND is_dir = 0`
    const params: (string | number)[] = [accountId, `%${q}%`]

    if (bucket) { sql += ' AND bucket = ?'; params.push(bucket) }
    if (minSize) { sql += ' AND size >= ?'; params.push(parseInt(minSize, 10)) }
    if (maxSize) { sql += ' AND size <= ?'; params.push(parseInt(maxSize, 10)) }
    if (from) { sql += ' AND last_modified >= ?'; params.push(new Date(from).getTime()) }
    if (to) { sql += ' AND last_modified <= ?'; params.push(new Date(to).getTime()) }

    if (type) {
      const typeMap: Record<string, string> = {
        image: '(image/%)',
        video: '(video/%)',
        audio: '(audio/%)',
        document: '(application/pdf%|text/%)',
      }
      if (typeMap[type]) {
        sql += ` AND content_type LIKE ${typeMap[type].split('|').map(() => '?').join(' OR content_type LIKE ')}`
        typeMap[type].replace(/[()]/g, '').split('|').forEach((t) => params.push(t))
      }
    }

    sql += ' ORDER BY last_modified DESC LIMIT 500'

    const rows = dbAll<{
      id: string; account_id: string; bucket: string; key: string
      size: number; last_modified: number; content_type: string; etag: string; is_dir: number
    }>(sql, params)

    return {
      results: rows.map((r) => ({
        accountId: r.account_id,
        bucket: r.bucket,
        key: r.key,
        size: r.size,
        lastModified: r.last_modified,
        contentType: r.content_type,
        etag: r.etag,
      })),
    }
  })

  // ================================================================
  // 标签系统
  // ================================================================

  app.get('/api/tags', async () => {
    return { tags: dbAll('SELECT * FROM tags ORDER BY name') }
  })

  app.post<{ Body: { name: string; color?: string } }>('/api/tags', async (req, reply) => {
    const { name, color = '#4CAF50' } = req.body
    const id = nanoid()
    dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', [id, name, color])
    reply.code(201)
    return { tag: dbGet('SELECT * FROM tags WHERE id = ?', [id]) }
  })

  app.delete<{ Params: { tagId: string } }>('/api/tags/:tagId', async (req) => {
    dbRun('DELETE FROM tags WHERE id = ?', [req.params.tagId])
    return { ok: true }
  })

  app.post<{
    Params: { accountId: string; bucket: string }
    Body: { key: string; tagId: string }
  }>('/api/files/:accountId/:bucket/tags', async (req) => {
    const { accountId, bucket } = req.params
    const { key, tagId } = req.body
    dbRun(
      `INSERT OR IGNORE INTO file_tags (account_id, bucket, key, tag_id) VALUES (?, ?, ?, ?)`,
      [accountId, bucket, key, tagId],
    )
    return { ok: true }
  })

  app.delete<{
    Params: { accountId: string; bucket: string }
    Querystring: { key: string; tagId: string }
  }>('/api/files/:accountId/:bucket/tags', async (req) => {
    const { accountId, bucket } = req.params
    dbRun(
      'DELETE FROM file_tags WHERE account_id = ? AND bucket = ? AND key = ? AND tag_id = ?',
      [accountId, bucket, req.query.key, req.query.tagId],
    )
    return { ok: true }
  })

  // ================================================================
  // 收藏夹
  // ================================================================

  app.get('/api/favorites', async () => {
    return { favorites: dbAll('SELECT * FROM favorites ORDER BY created_at DESC') }
  })

  app.post<{
    Body: { accountId: string; bucket: string; key: string; displayName?: string }
  }>('/api/favorites', async (req, reply) => {
    const { accountId, bucket, key, displayName } = req.body
    const id = nanoid()
    dbRun(
      `INSERT OR IGNORE INTO favorites (id, account_id, bucket, key, display_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, accountId, bucket, key, displayName ?? null, Date.now()],
    )
    reply.code(201)
    return { ok: true }
  })

  app.delete<{ Querystring: { accountId: string; bucket: string; key: string } }>(
    '/api/favorites',
    async (req) => {
      const { accountId, bucket, key } = req.query
      dbRun('DELETE FROM favorites WHERE account_id = ? AND bucket = ? AND key = ?', [accountId, bucket, key])
      return { ok: true }
    },
  )

  // ================================================================
  // 回收站
  // ================================================================

  app.get<{ Params: { accountId: string } }>('/api/trash/:accountId', async (req) => {
    return {
      items: dbAll('SELECT * FROM trash WHERE account_id = ? ORDER BY deleted_at DESC', [req.params.accountId]),
    }
  })

  app.post<{
    Params: { accountId: string }
    Body: { bucket: string; keys: string[] }
  }>('/api/trash/:accountId', async (req) => {
    const { accountId } = req.params
    const { bucket, keys } = req.body
    const adapter = getAdapter2(accountId)
    const now = Date.now()

    // better-sqlite3 的 transaction 只支持同步函数，不能包裹 async 云存储操作。
    // 策略：先顺序执行云端 copy → delete，全部成功后再批量写入 DB。
    // 若云端操作失败则抛出异常，DB 不会有脏数据。
    const trashEntries: Array<[string, string, string, string, string, number]> = []

    for (const key of keys) {
      const trashKey = `__trash__/${nanoid()}/${key.split('/').pop()}`
      await adapter.copyObject(bucket, key, bucket, trashKey)
      await adapter.deleteObjects(bucket, [key])
      trashEntries.push([nanoid(), accountId, bucket, trashKey, key, now])
    }

    // 所有云端操作完成后，同步批量写入 DB（此处可安全使用事务）
    dbTransaction(() => {
      for (const entry of trashEntries) {
        dbRun(
          `INSERT INTO trash (id, account_id, bucket, key, original_key, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          entry,
        )
      }
    })

    return { ok: true }
  })

  app.post<{
    Params: { accountId: string }
    Body: { ids: string[] }
  }>('/api/trash/:accountId/restore', async (req) => {
    const { accountId } = req.params
    const adapter = getAdapter2(accountId)

    for (const id of req.body.ids) {
      const item = dbGet<{ bucket: string; key: string; original_key: string }>(
        'SELECT bucket, key, original_key FROM trash WHERE id = ? AND account_id = ?',
        [id, accountId],
      )
      if (!item) continue
      await adapter.copyObject(item.bucket, item.key, item.bucket, item.original_key)
      await adapter.deleteObjects(item.bucket, [item.key])
      dbRun('DELETE FROM trash WHERE id = ?', [id])
    }

    return { ok: true }
  })

  app.delete<{
    Params: { accountId: string }
    Body: { ids?: string[] }  // 不传则清空全部
  }>('/api/trash/:accountId', async (req) => {
    const { accountId } = req.params
    const adapter = getAdapter2(accountId)
    const ids = req.body?.ids

    // ids 为空数组时 IN () 是非法 SQL，提前返回
    if (ids && ids.length === 0) {
      return { ok: true, deleted: 0 }
    }

    const items = ids
      ? dbAll<{ id: string; bucket: string; key: string }>(
          `SELECT id, bucket, key FROM trash WHERE account_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
          [accountId, ...ids],
        )
      : dbAll<{ id: string; bucket: string; key: string }>(
          'SELECT id, bucket, key FROM trash WHERE account_id = ?',
          [accountId],
        )

    for (const item of items) {
      await adapter.deleteObjects(item.bucket, [item.key]).catch(() => {})
      dbRun('DELETE FROM trash WHERE id = ?', [item.id])
    }

    return { ok: true, deleted: items.length }
  })
}
