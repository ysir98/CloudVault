/**
 * 又拍云 USS 适配器
 *
 * 又拍云使用 REST API，upyun npm 包封装了基础操作。
 * 不支持标准 S3 分片协议，大文件通过表单上传 Token 处理。
 */

import UpYun from 'upyun'
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
  UpyunConfig,
} from '../types'
import crypto from 'crypto'

export class UpyunAdapter implements StorageAdapter {
  readonly provider = 'upyun'
  /** 又拍云使用自有表单 API，不支持标准预签名 PUT，需走服务端代理 */
  readonly supportsPresignedPut = false
  private cfg: UpyunConfig
  // 客户端按 bucket 缓存
  private clients: Map<string, UpYun.Client> = new Map()

  constructor(cfg: UpyunConfig) {
    this.cfg = cfg
  }

  private getClient(bucket: string): UpYun.Client {
    if (!this.clients.has(bucket)) {
      const service = new UpYun.Service(bucket, this.cfg.operator, this.cfg.password)
      this.clients.set(bucket, new UpYun.Client(service))
    }
    return this.clients.get(bucket)!
  }

  async listBuckets(): Promise<Bucket[]> {
    // 又拍云无法通过 API 列出服务（Bucket），返回空列表而非抛出异常，
    // 由前端引导用户在账户配置中手动填写服务名称。
    console.warn('[UpyunAdapter] listBuckets: 又拍云不支持 API 列出服务，请在账户配置中手动指定服务名称')
    return []
  }

  async listObjects(bucket: string, options: ListOptions = {}): Promise<ListResult> {
    const client = this.getClient(bucket)
    const path = `/${options.prefix ?? ''}`

    const res = await client.listDir(path, {
      limit: options.maxKeys ?? 1000,
      iter: options.marker,
    }) as {
      files: Array<{ name: string; type: string; size: number; time: number }>
      iter: string
      is_end: boolean
    }

    const objects: ObjectMeta[] = []
    const prefix = options.prefix ?? ''

    for (const f of res.files ?? []) {
      const key = prefix ? `${prefix}${f.name}` : f.name
      if (f.type === 'F') {
        objects.push({ key: `${key}/`, size: 0, lastModified: new Date(f.time * 1000), isDir: true })
      } else {
        objects.push({
          key,
          size: f.size,
          lastModified: new Date(f.time * 1000),
          isDir: false,
        })
      }
    }

    return {
      objects,
      nextMarker: res.iter !== 'g2gCZAAEbmV4dAJh' ? res.iter : undefined,
      isTruncated: !res.is_end,
    }
  }

  async headObject(bucket: string, key: string): Promise<ObjectMeta> {
    const client = this.getClient(bucket)
    const res = await client.headFile(`/${key}`) as Record<string, string>
    return {
      key,
      size: parseInt(res['x-upyun-file-size'] ?? '0', 10),
      lastModified: new Date(parseInt(res['x-upyun-file-date'] ?? '0', 10) * 1000),
      contentType: res['content-type'],
      isDir: key.endsWith('/'),
    }
  }

  /**
   * 又拍云大文件上传使用"表单 API + 签名"，无标准分片协议。
   * 此处返回签名表单参数（JSON 字符串），客户端用此直传。
   */
  async initiateMultipartUpload(
    bucket: string,
    key: string,
    _options?: UploadOptions,
  ): Promise<string> {
    return this.generateFormToken(bucket, key)
  }

  async getPresignedPartUrl(
    _bucket: string,
    _key: string,
    _uploadId: string,
    _partNumber: number,
    _expires?: number,
  ): Promise<string> {
    throw new Error('又拍云不支持标准分片上传协议，请使用表单上传 Token')
  }

  async completeMultipartUpload(
    _bucket: string,
    _key: string,
    _uploadId: string,
    _parts: CompletedPart[],
  ): Promise<void> {
    // 又拍云表单上传一步完成，无需 complete 操作
  }

  async abortMultipartUpload(
    _bucket: string,
    _key: string,
    _uploadId: string,
  ): Promise<void> {
    // 无需处理
  }

  async getPresignedPutUrl(
    bucket: string,
    key: string,
    _options?: PresignOptions,
  ): Promise<string> {
    const token = await this.generateFormToken(bucket, key)
    return `upyun://upload?token=${encodeURIComponent(token)}&key=${encodeURIComponent(key)}`
  }

  async getPresignedDownloadUrl(
    _bucket: string,
    key: string,
    _expires = 3600,
  ): Promise<string> {
    if (!this.cfg.cdnDomain) {
      throw new Error('又拍云下载需要配置 CDN 域名')
    }
    return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    const client = this.getClient(bucket)
    for (const key of keys) {
      await client.deleteFile(`/${key}`)
    }
  }

  async copyObject(
    srcBucket: string,
    srcKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<void> {
    const srcClient = this.getClient(srcBucket)
    const destClient = this.getClient(destBucket)

    // 又拍云无服务端复制 API，需下载后重新上传
    const stream = await srcClient.getFile(`/${srcKey}`) as NodeJS.ReadableStream
    await destClient.putFile(`/${destKey}`, stream)
  }

  async createFolder(bucket: string, prefix: string): Promise<void> {
    const client = this.getClient(bucket)
    const key = prefix.endsWith('/') ? prefix : `${prefix}/`
    await client.makeDir(`/${key}`)
  }

  async setObjectAcl(_bucket: string, _key: string, _acl: AclType): Promise<void> {
    throw new Error('又拍云不支持单对象 ACL 设置')
  }

  /** 服务端代理上传：通过又拍云 REST API 推送 Buffer */
  async uploadBuffer(bucket: string, key: string, buffer: Buffer, _contentType: string): Promise<void> {
    await this.getClient(bucket).putFile(`/${key}`, buffer)
  }

  getCdnUrl(_bucket: string, key: string): string | null {
    if (!this.cfg.cdnDomain) return null
    return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
  }

  /** 生成又拍云表单上传策略签名 */
  private generateFormToken(bucket: string, _key: string, expires = 3600): string {
    const expiration = Math.floor(Date.now() / 1000) + expires
    const policy = Buffer.from(
      JSON.stringify({ bucket, expiration }),
    ).toString('base64')

    const sign = crypto
      .createHmac('sha1', this.cfg.password)
      .update(`${this.cfg.operator}&${expiration}&${policy}`)
      .digest('base64')

    return `UPYUN ${this.cfg.operator}:${sign}:${policy}`
  }
}
