import path from 'path'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: path.resolve(process.cwd(), '../../.env') })
loadDotenv({ path: path.resolve(process.cwd(), '.env') })

const DEV_SECRET = 'dev_secret_32bytes_replace_me_xx'
const isProd = process.env.NODE_ENV === 'production'

export const config = {
  port: parseInt(process.env.SERVER_PORT ?? '3721', 10),
  host: process.env.SERVER_HOST ?? '127.0.0.1',

  /** SQLite 数据库文件路径（':memory:' 为内存模式，用于测试） */
  dbPath: process.env.DB_PATH === ':memory:'
    ? ':memory:'
    : path.resolve(process.env.DB_PATH ?? './data/cloudvault.db'),

  /**
   * AK/SK 加密主密钥（32 字节 hex）
   * 生产环境务必通过 CRYPTO_SECRET 环境变量注入，启动时若使用默认值则拒绝启动。
   */
  cryptoSecret: (() => {
    const secret = process.env.CRYPTO_SECRET ?? DEV_SECRET
    if (isProd && secret === DEV_SECRET) {
      throw new Error(
        '[CloudVault] 生产环境必须设置 CRYPTO_SECRET 环境变量，不得使用默认密钥！',
      )
    }
    return secret
  })(),

  /** 缩略图缓存目录 */
  thumbCacheDir: path.resolve(process.env.THUMB_CACHE_DIR ?? './cache/thumbs'),

  /** 日志级别 */
  logLevel: (process.env.LOG_LEVEL ?? 'info') as
    | 'trace' | 'debug' | 'info' | 'warn' | 'error',

  /** 前端构建产物目录（生产模式静态服务） */
  staticDir: path.resolve(process.env.STATIC_DIR ?? '../client/dist'),
}
