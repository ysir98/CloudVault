/**
 * 阿里云 OSS 适配器
 *
 * 通过 ali-oss SDK 实现统一接口。
 * 阿里云 OSS 的分片上传用的是 InitiateMultipartUpload / UploadPart 协议，
 * 但预签名 URL 通过 OSS SDK 的 signatureUrl 方法生成。
 */

import OSS from 'ali-oss'
import type {
  StorageAdapter,
  Bucket,
  ObjectMeta,
  ListOptions,
  ListResult,
  UploadOptions,
  PresignOptions,
  CompletedPart,
  AclType,
  OssConfig,
} from '../types'

/** ali-oss 的 ACL 值映射 */
const ACL_MAP: Record<AclType, OSS.ACLType> = {
  private: 'private',
  'public-read': 'public-read',
  'public-read-write': 'public-read-write',
}

export class OssAdapter implements StorageAdapter {
  readonly provider = 'oss'
  readonly supportsPresignedPut = true
  private client: OSS
  private cfg: OssConfig

  constructor(cfg: OssConfig) {
    this.cfg = cfg
    this.client = new OSS({
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      region: cfg.region,
      ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
    })
  }

  /** 切换到目标 bucket（ali-oss 客户端是有状态的） */
  private use(bucket: string): OSS {
    this.client.useBucket(bucket)
    return this.client
  }

  async listBuckets(): Promise<Bucket[]> {
    const res = await this.client.listBuckets({})
    return (res.buckets ?? []).map((b: OSS.BucketInfo) => ({
      name: b.name,
      region: b.region,
      creationDate: new Date(b.creationDate),
    }))
  }

  async listObjects(bucket: string, options: ListOptions = {}): Promise<ListResult> {
    const oss = this.use(bucket)
    const res = await oss.list(
      {
        prefix: options.prefix,
        delimiter: options.delimiter ?? '/',
        marker: options.marker,
        'max-keys': options.maxKeys ?? 1000,
      },
      {},
    )

    const objects: ObjectMeta[] = []

    for (const obj of res.objects ?? []) {
      objects.push({
        key: obj.name,
        size: obj.size,
        lastModified: new Date(obj.lastModified),
        etag: obj.etag?.replace(/"/g, ''),
        contentType: obj.type,
        isDir: false,
      })
    }

    for (const prefix of res.prefixes ?? []) {
      objects.push({
        key: prefix,
        size: 0,
        lastModified: new Date(0),
        isDir: true,
      })
    }

    return {
      objects,
      nextMarker: res.nextMarker,
      isTruncated: res.isTruncated,
    }
  }

  async headObject(bucket: string, key: string): Promise<ObjectMeta> {
    const res = await this.use(bucket).head(key)
    return {
      key,
      size: parseInt(String(res.res.headers['content-length'] ?? '0'), 10),
      lastModified: new Date(res.res.headers['last-modified'] as string),
      etag: (res.res.headers['etag'] as string)?.replace(/"/g, ''),
      contentType: res.res.headers['content-type'] as string,
      isDir: key.endsWith('/'),
    }
  }

  async initiateMultipartUpload(
    bucket: string,
    key: string,
    options?: UploadOptions,
  ): Promise<string> {
    const res = await this.use(bucket).initMultipartUpload(key, {
      mime: options?.contentType,
      meta: options?.metadata,
    })
    return res.uploadId
  }

  async getPresignedPartUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expires = 3600,
  ): Promise<string> {
    return this.use(bucket).signatureUrl(key, {
      method: 'PUT',
      expires,
      subResource: {
        partNumber: String(partNumber),
        uploadId,
      },
    })
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.use(bucket).completeMultipartUpload(
      key,
      uploadId,
      parts.map((p) => ({ number: p.PartNumber, etag: p.ETag })),
    )
  }

  async abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<void> {
    await this.use(bucket).abortMultipartUpload(key, uploadId)
  }

  async getPresignedPutUrl(
    bucket: string,
    key: string,
    options?: PresignOptions,
  ): Promise<string> {
    return this.use(bucket).signatureUrl(key, {
      method: 'PUT',
      expires: options?.expires ?? 3600,
      'Content-Type': options?.contentType,
    })
  }

  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expires = 3600,
  ): Promise<string> {
    if (this.cfg.cdnDomain) {
      return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
    }
    return this.use(bucket).signatureUrl(key, { expires })
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    const BATCH = 1000
    for (let i = 0; i < keys.length; i += BATCH) {
      await this.use(bucket).deleteMulti(keys.slice(i, i + BATCH), { quiet: true })
    }
  }

  async copyObject(
    srcBucket: string,
    srcKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<void> {
    this.use(destBucket)
    await this.client.copy(destKey, srcKey, srcBucket)
  }

  async createFolder(bucket: string, prefix: string): Promise<void> {
    const key = prefix.endsWith('/') ? prefix : `${prefix}/`
    await this.use(bucket).put(key, Buffer.alloc(0))
  }

  async setObjectAcl(bucket: string, key: string, acl: AclType): Promise<void> {
    await this.use(bucket).putACL(key, ACL_MAP[acl])
  }

  async uploadBuffer(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.use(bucket).put(key, buffer, { headers: { 'Content-Type': contentType } })
  }

  getCdnUrl(_bucket: string, key: string): string | null {
    if (!this.cfg.cdnDomain) return null
    return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
  }
}
