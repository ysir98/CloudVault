/**
 * db 模块单元测试
 *
 * 使用内存数据库（DB_PATH=:memory: 由 vitest.config.ts 注入）。
 * 每个测试前 closeDb + 重新 getDb，保证状态隔离。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, closeDb, dbGet, dbAll, dbRun, dbTransaction } from '../db'

beforeEach(() => {
  // 每个测试用全新的 in-memory 数据库
  closeDb()
  getDb()
})

afterEach(() => {
  closeDb()
})

describe('getDb', () => {
  it('返回同一个数据库实例（单例）', () => {
    expect(getDb()).toBe(getDb())
  })

  it('Schema 已初始化：accounts 表存在', () => {
    const row = dbGet<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'",
    )
    expect(row?.name).toBe('accounts')
  })

  it('所有必要的表均已创建', () => {
    const tables = dbAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).map(r => r.name)

    const required = [
      'accounts', 'buckets_cache', 'file_index',
      'tags', 'file_tags', 'favorites',
      'transfer_tasks', 'trash', 'share_links',
    ]
    for (const t of required) {
      expect(tables, `表 ${t} 应存在`).toContain(t)
    }
  })
})

describe('dbRun / dbGet / dbAll', () => {
  it('dbRun 插入行，dbGet 可查询', () => {
    dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', ['t1', 'test-tag', '#ff0000'])
    const row = dbGet<{ name: string; color: string }>('SELECT name, color FROM tags WHERE id = ?', ['t1'])
    expect(row?.name).toBe('test-tag')
    expect(row?.color).toBe('#ff0000')
  })

  it('dbGet 查询不存在的行返回 undefined', () => {
    expect(dbGet('SELECT * FROM tags WHERE id = ?', ['nonexistent'])).toBeUndefined()
  })

  it('dbAll 返回多行', () => {
    dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', ['t1', 'tag1', '#000'])
    dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', ['t2', 'tag2', '#fff'])
    const rows = dbAll<{ id: string }>('SELECT id FROM tags ORDER BY id')
    expect(rows).toHaveLength(2)
  })

  it('dbRun 更新返回正确的 changes 数', () => {
    dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', ['t1', 'old', '#000'])
    const result = dbRun('UPDATE tags SET name = ? WHERE id = ?', ['new', 't1'])
    expect(result.changes).toBe(1)
  })

  it('dbRun 删除后 dbGet 返回 undefined', () => {
    dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', ['t1', 'tmp', '#000'])
    dbRun('DELETE FROM tags WHERE id = ?', ['t1'])
    expect(dbGet('SELECT * FROM tags WHERE id = ?', ['t1'])).toBeUndefined()
  })
})

describe('dbTransaction', () => {
  it('事务中所有操作成功提交', () => {
    dbTransaction(() => {
      dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', ['t1', 'a', '#000'])
      dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', ['t2', 'b', '#fff'])
    })
    expect(dbGet('SELECT id FROM tags WHERE id = ?', ['t1'])).toBeDefined()
    expect(dbGet('SELECT id FROM tags WHERE id = ?', ['t2'])).toBeDefined()
  })

  it('事务中抛出错误时自动回滚', () => {
    expect(() => {
      dbTransaction(() => {
        dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', ['t1', 'tmp', '#000'])
        // 重复主键触发约束错误
        dbRun('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', ['t1', 'dup', '#000'])
      })
    }).toThrow()

    expect(dbGet('SELECT id FROM tags WHERE id = ?', ['t1'])).toBeUndefined()
  })
})
