/**
 * SQLite 数据库初始化模块
 *
 * 使用 better-sqlite3 同步 API，在服务启动时自动建表，
 * 并通过 WAL 模式提升并发读性能。
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { config } from '../config'

let _db: Database.Database | null = null

/** 获取全局唯一的数据库连接（懒初始化） */
export function getDb(): Database.Database {
  if (_db) return _db

  // ':memory:' 是 SQLite 内存模式，不需要创建目录
  if (config.dbPath !== ':memory:') {
    const dbDir = path.dirname(config.dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
  }

  _db = new Database(config.dbPath, {
    // 非详细模式下不输出 SQL 语句（敏感信息保护）
    verbose: config.logLevel === 'trace' ? console.log : undefined,
  })

  // 读取并执行 Schema
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')
  _db.exec(schema)

  return _db
}

/** 关闭数据库连接（进程退出时调用） */
export function closeDb(): void {
  _db?.close()
  _db = null
}

// ----------------------------------------------------------------
// 通用查询辅助函数
// ----------------------------------------------------------------

export function dbGet<T>(sql: string, params?: unknown[]): T | undefined {
  const stmt = getDb().prepare(sql)
  return stmt.get(...(params ?? [])) as T | undefined
}

export function dbAll<T>(sql: string, params?: unknown[]): T[] {
  const stmt = getDb().prepare(sql)
  return stmt.all(...(params ?? [])) as T[]
}

export function dbRun(
  sql: string,
  params?: unknown[],
): Database.RunResult {
  const stmt = getDb().prepare(sql)
  return stmt.run(...(params ?? []))
}

/** 在事务中执行一组操作 */
export function dbTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)()
}
