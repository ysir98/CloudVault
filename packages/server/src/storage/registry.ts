/**
 * 存储提供商注册表
 *
 * 根据账户的 provider 字段和解密后的 config，
 * 实例化对应的 StorageAdapter 并缓存（避免重复创建 SDK 客户端）。
 */

import type { StorageAdapter, ProviderConfig } from './types'
import { S3Adapter } from './adapters/s3'
import { OssAdapter } from './adapters/oss'
import { CosAdapter } from './adapters/cos'
import { ObsAdapter } from './adapters/obs'
import { QiniuAdapter } from './adapters/qiniu'
import { UpyunAdapter } from './adapters/upyun'

/** 所有支持的提供商标识 */
export type ProviderType = 's3' | 'r2' | 'minio' | 'b2' | 'oss' | 'cos' | 'obs' | 'qiniu' | 'upyun'

/** 缓存键：accountId */
const adapterCache = new Map<string, StorageAdapter>()

/**
 * 根据提供商类型和配置创建适配器实例
 *
 * r2 / minio / b2 均使用 S3 适配器，通过 endpoint 区分
 */
export function createAdapter(provider: ProviderType, cfg: ProviderConfig): StorageAdapter {
  switch (provider) {
    case 's3':
    case 'r2':
    case 'minio':
    case 'b2':
      return new S3Adapter(cfg as Parameters<typeof S3Adapter>[0])

    case 'oss':
      return new OssAdapter(cfg as Parameters<typeof OssAdapter>[0])

    case 'cos':
      return new CosAdapter(cfg as Parameters<typeof CosAdapter>[0])

    case 'obs':
      return new ObsAdapter(cfg as Parameters<typeof ObsAdapter>[0])

    case 'qiniu':
      return new QiniuAdapter(cfg as Parameters<typeof QiniuAdapter>[0])

    case 'upyun':
      return new UpyunAdapter(cfg as Parameters<typeof UpyunAdapter>[0])

    default:
      throw new Error(`Unsupported storage provider: ${provider}`)
  }
}

/**
 * 获取账户对应的适配器（带缓存）
 *
 * @param accountId 账户 ID（用于缓存键）
 * @param provider  提供商类型
 * @param cfg       已解密的配置对象
 */
export function getAdapter(
  accountId: string,
  provider: ProviderType,
  cfg: ProviderConfig,
): StorageAdapter {
  if (!adapterCache.has(accountId)) {
    adapterCache.set(accountId, createAdapter(provider, cfg))
  }
  return adapterCache.get(accountId)!
}

/** 账户配置变更后清除缓存，下次使用时重新创建 */
export function invalidateAdapter(accountId: string): void {
  adapterCache.delete(accountId)
}

/** 获取所有已支持的提供商元数据（供前端展示） */
export function getProviderMeta(): Array<{
  id: ProviderType
  name: string
  protocol: string
  fields: string[]
}> {
  return [
    {
      id: 's3',
      name: 'AWS S3',
      protocol: 's3',
      fields: ['accessKeyId', 'secretAccessKey', 'region', 'cdnDomain'],
    },
    {
      id: 'r2',
      name: 'Cloudflare R2',
      protocol: 's3',
      fields: ['accessKeyId', 'secretAccessKey', 'endpoint', 'cdnDomain'],
    },
    {
      id: 'minio',
      name: 'MinIO',
      protocol: 's3',
      fields: ['accessKeyId', 'secretAccessKey', 'endpoint', 'region'],
    },
    {
      id: 'b2',
      name: 'Backblaze B2',
      protocol: 's3',
      fields: ['accessKeyId', 'secretAccessKey', 'endpoint', 'region'],
    },
    {
      id: 'oss',
      name: '阿里云 OSS',
      protocol: 'oss',
      fields: ['accessKeyId', 'accessKeySecret', 'region', 'cdnDomain'],
    },
    {
      id: 'cos',
      name: '腾讯云 COS',
      protocol: 'cos',
      fields: ['secretId', 'secretKey', 'region', 'cdnDomain'],
    },
    {
      id: 'obs',
      name: '华为云 OBS',
      protocol: 'obs',
      fields: ['accessKeyId', 'secretAccessKey', 'server', 'cdnDomain'],
    },
    {
      id: 'qiniu',
      name: '七牛云 Kodo',
      protocol: 'qiniu',
      // zone 字段保留用于兼容旧配置，SDK 会自动查询 bucket 实际区域
      fields: ['accessKey', 'secretKey', 'cdnDomain'],
    },
    {
      id: 'upyun',
      name: '又拍云 USS',
      protocol: 'upyun',
      fields: ['operator', 'password', 'cdnDomain'],
    },
  ]
}
