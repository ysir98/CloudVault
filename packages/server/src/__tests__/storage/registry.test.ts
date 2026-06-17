/**
 * storage/registry 模块单元测试
 *
 * 覆盖：createAdapter 类型、getAdapter 缓存、invalidateAdapter、getProviderMeta。
 * 注意：不实际连接任何云服务，只验证适配器实例类型和注册表行为。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createAdapter, getAdapter, invalidateAdapter, getProviderMeta,
  type ProviderType,
} from '../../storage/registry'
import { S3Adapter } from '../../storage/adapters/s3'
import { OssAdapter } from '../../storage/adapters/oss'
import { CosAdapter } from '../../storage/adapters/cos'
import { QiniuAdapter } from '../../storage/adapters/qiniu'
import { UpyunAdapter } from '../../storage/adapters/upyun'

// 最小有效配置（不会真正发请求）
const mockS3Cfg = { accessKeyId: 'ak', secretAccessKey: 'sk', region: 'us-east-1' }
const mockOssCfg = { accessKeyId: 'ak', accessKeySecret: 'sk', region: 'oss-cn-hangzhou' }
const mockCosCfg = { secretId: 'sid', secretKey: 'sk', region: 'ap-guangzhou' }
const mockQiniuCfg = { accessKey: 'ak', secretKey: 'sk', zone: 'z0', cdnDomain: 'https://cdn.example.com' }
const mockUpyunCfg = { operator: 'op', password: 'pw' }

describe('createAdapter', () => {
  it('provider=s3 → S3Adapter', () => {
    expect(createAdapter('s3', mockS3Cfg)).toBeInstanceOf(S3Adapter)
  })

  it('provider=r2 → S3Adapter（S3 兼容协议）', () => {
    expect(createAdapter('r2', mockS3Cfg)).toBeInstanceOf(S3Adapter)
  })

  it('provider=minio → S3Adapter', () => {
    expect(createAdapter('minio', { ...mockS3Cfg, endpoint: 'http://localhost:9000' }))
      .toBeInstanceOf(S3Adapter)
  })

  it('provider=b2 → S3Adapter', () => {
    expect(createAdapter('b2', { ...mockS3Cfg, endpoint: 'https://s3.us-west-002.backblazeb2.com' }))
      .toBeInstanceOf(S3Adapter)
  })

  it('provider=oss → OssAdapter', () => {
    expect(createAdapter('oss', mockOssCfg)).toBeInstanceOf(OssAdapter)
  })

  it('provider=cos → CosAdapter', () => {
    expect(createAdapter('cos', mockCosCfg)).toBeInstanceOf(CosAdapter)
  })

  it('provider=qiniu → QiniuAdapter', () => {
    expect(createAdapter('qiniu', mockQiniuCfg)).toBeInstanceOf(QiniuAdapter)
  })

  it('provider=upyun → UpyunAdapter', () => {
    expect(createAdapter('upyun', mockUpyunCfg)).toBeInstanceOf(UpyunAdapter)
  })

  it('未知 provider 抛出错误', () => {
    expect(() => createAdapter('unknown' as ProviderType, mockS3Cfg)).toThrow('Unsupported storage provider')
  })
})

describe('getAdapter 缓存', () => {
  const accountId = 'test-cache-account'

  beforeEach(() => {
    invalidateAdapter(accountId)
  })

  it('同一 accountId 返回同一实例（缓存命中）', () => {
    const a1 = getAdapter(accountId, 's3', mockS3Cfg)
    const a2 = getAdapter(accountId, 's3', mockS3Cfg)
    expect(a1).toBe(a2)
  })

  it('invalidateAdapter 后返回新实例', () => {
    const a1 = getAdapter(accountId, 's3', mockS3Cfg)
    invalidateAdapter(accountId)
    const a2 = getAdapter(accountId, 's3', mockS3Cfg)
    expect(a1).not.toBe(a2)
  })
})

describe('getProviderMeta', () => {
  const meta = getProviderMeta()

  it('返回 9 个提供商', () => {
    expect(meta).toHaveLength(9)
  })

  it('每个提供商有必要字段', () => {
    for (const p of meta) {
      expect(p.id, `${p.id} 缺少 id`).toBeTruthy()
      expect(p.name, `${p.id} 缺少 name`).toBeTruthy()
      expect(p.protocol, `${p.id} 缺少 protocol`).toBeTruthy()
      expect(Array.isArray(p.fields), `${p.id} fields 应为数组`).toBe(true)
      expect(p.fields.length, `${p.id} 至少有 1 个字段`).toBeGreaterThan(0)
    }
  })

  it('包含所有预期的提供商 ID', () => {
    const ids = meta.map(p => p.id)
    const expected: ProviderType[] = ['s3', 'r2', 'minio', 'b2', 'oss', 'cos', 'obs', 'qiniu', 'upyun']
    for (const id of expected) {
      expect(ids, `应包含 ${id}`).toContain(id)
    }
  })

  it('OSS 包含 accessKeyId 和 accessKeySecret 字段', () => {
    const oss = meta.find(p => p.id === 'oss')!
    expect(oss.fields).toContain('accessKeyId')
    expect(oss.fields).toContain('accessKeySecret')
  })

  it('七牛云包含 cdnDomain 字段', () => {
    const qiniu = meta.find(p => p.id === 'qiniu')!
    expect(qiniu.fields).toContain('cdnDomain')
  })
})

describe('适配器接口契约', () => {
  const INTERFACE_METHODS = [
    'listBuckets', 'listObjects', 'headObject',
    'initiateMultipartUpload', 'getPresignedPartUrl',
    'completeMultipartUpload', 'abortMultipartUpload',
    'getPresignedPutUrl', 'getPresignedDownloadUrl',
    'deleteObjects', 'copyObject', 'createFolder',
    'setObjectAcl', 'getCdnUrl',
  ]

  it('S3Adapter 实现所有接口方法', () => {
    const adapter = createAdapter('s3', mockS3Cfg)
    for (const method of INTERFACE_METHODS) {
      expect(typeof (adapter as Record<string, unknown>)[method], `S3Adapter.${method} 应为函数`)
        .toBe('function')
    }
  })

  it('UpyunAdapter 实现所有接口方法', () => {
    const adapter = createAdapter('upyun', mockUpyunCfg)
    for (const method of INTERFACE_METHODS) {
      expect(typeof (adapter as Record<string, unknown>)[method], `UpyunAdapter.${method} 应为函数`)
        .toBe('function')
    }
  })

  it('UpyunAdapter.listBuckets 返回空数组而非抛出', async () => {
    const adapter = createAdapter('upyun', mockUpyunCfg)
    const buckets = await adapter.listBuckets()
    expect(Array.isArray(buckets)).toBe(true)
    expect(buckets).toHaveLength(0)
  })

  it('S3Adapter.getCdnUrl 无 cdnDomain 时返回 null', () => {
    const adapter = createAdapter('s3', mockS3Cfg)
    expect(adapter.getCdnUrl('bucket', 'key/file.txt')).toBeNull()
  })

  it('S3Adapter.getCdnUrl 有 cdnDomain 时返回拼接 URL', () => {
    const adapter = createAdapter('s3', { ...mockS3Cfg, cdnDomain: 'https://cdn.example.com' })
    expect(adapter.getCdnUrl('bucket', 'images/photo.jpg')).toBe('https://cdn.example.com/images/photo.jpg')
  })

  it('QiniuAdapter.getCdnUrl 有 cdnDomain 时正确拼接', () => {
    const adapter = createAdapter('qiniu', mockQiniuCfg)
    expect(adapter.getCdnUrl('bucket', 'video.mp4')).toBe('https://cdn.example.com/video.mp4')
  })
})
