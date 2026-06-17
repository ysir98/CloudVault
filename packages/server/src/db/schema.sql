-- CloudVault 数据库 Schema
-- 使用 SQLite，所有时间戳均为 Unix 毫秒整数

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- 账户表：存储各云服务商的连接配置（config 字段 AES-256-GCM 加密）
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  provider    TEXT NOT NULL,  -- 's3'|'oss'|'cos'|'obs'|'qiniu'|'upyun'|'r2'|'b2'|'minio'
  config      TEXT NOT NULL,  -- JSON，已加密（AK/SK 等敏感信息）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- ============================================================
-- Bucket 缓存：加速列出已知 Bucket
-- ============================================================
CREATE TABLE IF NOT EXISTS buckets_cache (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  region      TEXT,
  endpoint    TEXT,
  cached_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buckets_account ON buckets_cache(account_id);

-- ============================================================
-- 文件索引缓存：加速目录列表，避免频繁调用云 API
-- ============================================================
CREATE TABLE IF NOT EXISTS file_index (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  bucket        TEXT NOT NULL,
  key           TEXT NOT NULL,       -- 对象完整 key（含前缀/路径）
  size          INTEGER,
  last_modified INTEGER,
  content_type  TEXT,
  etag          TEXT,
  is_dir        INTEGER NOT NULL DEFAULT 0,
  cached_at     INTEGER NOT NULL,
  UNIQUE(account_id, bucket, key)
);
CREATE INDEX IF NOT EXISTS idx_file_index_path ON file_index(account_id, bucket, key);
CREATE INDEX IF NOT EXISTS idx_file_index_modified ON file_index(account_id, bucket, last_modified);

-- ============================================================
-- 标签系统
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#4CAF50'
);

CREATE TABLE IF NOT EXISTS file_tags (
  account_id  TEXT NOT NULL,
  bucket      TEXT NOT NULL,
  key         TEXT NOT NULL,
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, bucket, key, tag_id)
);

-- ============================================================
-- 收藏夹
-- ============================================================
CREATE TABLE IF NOT EXISTS favorites (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  bucket      TEXT NOT NULL,
  key         TEXT NOT NULL,
  display_name TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE(account_id, bucket, key)
);

-- ============================================================
-- 传输任务队列（断点续传状态持久化）
-- ============================================================
CREATE TABLE IF NOT EXISTS transfer_tasks (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,          -- 'upload' | 'download'
  account_id  TEXT NOT NULL,
  bucket      TEXT NOT NULL,
  key         TEXT NOT NULL,
  file_name   TEXT NOT NULL,          -- 本地文件名（上传）或目标文件名（下载）
  file_path   TEXT,                   -- 本地绝对路径（下载目标）
  total_size  INTEGER NOT NULL DEFAULT 0,
  transferred INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending|running|paused|completed|failed|cancelled
  upload_id   TEXT,                   -- 分片上传 UploadId（断点续传）
  parts       TEXT,                   -- JSON：已完成的 part 列表 [{PartNumber, ETag}]
  error       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON transfer_tasks(status, created_at);

-- ============================================================
-- 回收站（逻辑删除，保存原始 key）
-- ============================================================
CREATE TABLE IF NOT EXISTS trash (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  bucket        TEXT NOT NULL,
  key           TEXT NOT NULL,          -- 删除后移动到的临时 key
  original_key  TEXT NOT NULL,          -- 原始 key，用于恢复
  size          INTEGER,
  deleted_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trash_account ON trash(account_id, deleted_at DESC);

-- ============================================================
-- 分享链接记录
-- ============================================================
CREATE TABLE IF NOT EXISTS share_links (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  bucket      TEXT NOT NULL,
  key         TEXT NOT NULL,
  url         TEXT NOT NULL,
  expires_at  INTEGER,
  password    TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shares_account ON share_links(account_id, created_at DESC);
