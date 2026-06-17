/**
 * 七牛云 Kodo 适配器
 *
 * 七牛下载必须绑定自定义域名，无法使用源站域名直接访问私有文件。
 * 上传通过七牛官方 Node SDK 获取 uploadToken，客户端直传。
 */

import qiniu from 'qiniu'
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
  QiniuConfig,
} from '../types'


export class QiniuAdapter implements StorageAdapter {
  readonly provider = 'qiniu'
  /** 七牛使用表单上传 API，不支持标准预签名 PUT，需走服务端代理 */
  readonly supportsPresignedPut = false
  private mac: qiniu.auth.digest.Mac
  private cfg: QiniuConfig
  private bucketManager: qiniu.rs.BucketManager
  /** bucket → 域名缓存（避免每次下载都查 API） */
  private domainCache = new Map<string, string>()

  constructor(cfg: QiniuConfig) {
    this.cfg = cfg
    this.mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)

    // BucketManager 不需要指定 zone，传空 Config 即可
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, new qiniu.conf.Config())
  }

  /** 生成上传 Token */
  private getUploadToken(bucket: string, key?: string, expires = 3600): string {
    const putPolicy = new qiniu.rs.PutPolicy({
      scope: key ? `${bucket}:${key}` : bucket,
      expires,
    })
    return putPolicy.uploadToken(this.mac)
  }

  async listBuckets(): Promise<Bucket[]> {
    return new Promise((resolve, reject) => {
      this.bucketManager.listBucket((err, body) => {
        if (err) return reject(err)
        resolve((body ?? []).map((name: string) => ({ name })))
      })
    })
  }

  async listObjects(bucket: string, options: ListOptions = {}): Promise<ListResult> {
    return new Promise((resolve, reject) => {
      this.bucketManager.listPrefix(
        bucket,
        {
          prefix: options.prefix ?? '',
          marker: options.marker,
          limit: options.maxKeys ?? 1000,
          delimiter: options.delimiter ?? '/',
        },
        (err: Error | null, body: {
          items?: Array<{ key: string; fsize: number; putTime: number; mimeType: string; md5: string }>
          commonPrefixes?: string[]
          marker?: string
        }) => {
          if (err) return reject(err)

          const objects: ObjectMeta[] = []
          for (const item of body.items ?? []) {
            objects.push({
              key: item.key,
              size: item.fsize,
              // 七牛 putTime 单位为 100ns
              lastModified: new Date(Math.floor(item.putTime / 10000)),
              etag: item.md5,
              contentType: item.mimeType,
              isDir: false,
            })
          }
          for (const prefix of body.commonPrefixes ?? []) {
            objects.push({ key: prefix, size: 0, lastModified: new Date(0), isDir: true })
          }

          resolve({ objects, nextMarker: body.marker, isTruncated: !!body.marker })
        },
      )
    })
  }

  async headObject(bucket: string, key: string): Promise<ObjectMeta> {
    return new Promise((resolve, reject) => {
      this.bucketManager.stat(
        bucket,
        key,
        (err: Error | null, body: { fsize: number; putTime: number; mimeType: string; md5: string }) => {
          if (err) return reject(err)
          resolve({
            key,
            size: body.fsize,
            lastModified: new Date(Math.floor(body.putTime / 10000)),
            etag: body.md5,
            contentType: body.mimeType,
            isDir: key.endsWith('/'),
          })
        },
      )
    })
  }

  /**
   * 七牛分片上传（v2）通过 uploadToken 实现，
   * 此处返回 uploadToken 作为"uploadId"供客户端使用。
   */
  async initiateMultipartUpload(
    bucket: string,
    key: string,
    _options?: UploadOptions,
  ): Promise<string> {
    return this.getUploadToken(bucket, key, 7200)
  }

  /**
   * 七牛分片 URL 通过客户端 SDK 直接发起，服务端生成 Token 即可。
   * 此方法返回上传端点（客户端需自行处理分片逻辑）。
   */
  async getPresignedPartUrl(
    bucket: string,
    key: string,
    _uploadId: string,
    _partNumber: number,
    _expires?: number,
  ): Promise<string> {
    // 七牛分片上传端点，客户端通过 uploadToken 直接上传
    return `https://up.qiniup.com`
  }

  async completeMultipartUpload(
    _bucket: string,
    _key: string,
    _uploadId: string,
    _parts: CompletedPart[],
  ): Promise<void> {
    // 七牛分片完成由客户端 SDK 处理，服务端无需额外操作
  }

  async abortMultipartUpload(
    _bucket: string,
    _key: string,
    _uploadId: string,
  ): Promise<void> {
    // 七牛分片上传在过期后自动清理
  }

  /** 返回带 uploadToken 的上传参数 JSON（客户端用此发起直传） */
  async getPresignedPutUrl(
    bucket: string,
    key: string,
    options?: PresignOptions,
  ): Promise<string> {
    const token = this.getUploadToken(bucket, key, options?.expires ?? 3600)
    // 将 token 编码在 URL 中供客户端解析
    return `qiniu://upload?token=${encodeURIComponent(token)}&key=${encodeURIComponent(key)}`
  }

  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expires = 3600,
  ): Promise<string> {
    // 优先使用用户配置的 CDN 域名，否则动态查询 bucket 绑定的域名
    const domain = (this.cfg.cdnDomain ?? await this.resolveBucketDomain(bucket)).replace(/\/$/, '')
    const deadline = Math.floor(Date.now() / 1000) + expires
    // SDK v7.x 签名：privateDownloadUrl(domain, fileName, deadline)
    // 不能拼成 baseUrl 再传两个参数，否则 fileName=deadline，e=undefined
    return this.bucketManager.privateDownloadUrl(domain, key, deadline)
  }

  /**
   * 查询 bucket 可用的下载域名。
   * 优先返回 CDN/自定义域名，其次是七牛分配的测试域名（clouddn.com / qiniudn.com）。
   * 结果缓存在内存中，避免每次下载都调 API。
   */
  private async resolveBucketDomain(bucket: string): Promise<string> {
    if (this.domainCache.has(bucket)) {
      return this.domainCache.get(bucket)!
    }

    const domains: string[] = await new Promise((resolve, reject) => {
      this.bucketManager.listBucketDomains(
        bucket,
        (err: Error | null, body: string[] | null) => {
          if (err) return reject(err)
          resolve(body ?? [])
        },
      )
    })

    if (!domains.length) {
      throw new Error(
        `七牛云 bucket "${bucket}" 未绑定任何域名，请在七牛控制台为该 bucket 绑定域名后重试，` +
        `或在账户配置中填写 cdnDomain 字段`,
      )
    }

    // 优先选自定义域名（不含 qiniu 系统域名），其次选测试域名
    const preferred =
      domains.find(d => !d.includes('qiniudn.com') && !d.includes('clouddn.com') && !d.includes('qnssl.com')) ??
      domains[0]

    const domainWithScheme = preferred.startsWith('http') ? preferred : `https://${preferred}`
    this.domainCache.set(bucket, domainWithScheme)
    return domainWithScheme
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    const BATCH = 1000
    for (let i = 0; i < keys.length; i += BATCH) {
      const operations = keys
        .slice(i, i + BATCH)
        .map((k) => qiniu.rs.deleteOp(bucket, k))

      await new Promise<void>((resolve, reject) => {
        this.bucketManager.batch(
          operations,
          (err: Error | null) => (err ? reject(err) : resolve()),
        )
      })
    }
  }

  async copyObject(
    srcBucket: string,
    srcKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.bucketManager.copy(
        srcBucket,
        srcKey,
        destBucket,
        destKey,
        true,
        (err: Error | null) => (err ? reject(err) : resolve()),
      )
    })
  }

  async createFolder(bucket: string, prefix: string): Promise<void> {
    const key = prefix.endsWith('/') ? prefix : `${prefix}/`
    // 七牛虚拟目录：上传一个空内容的占位对象（key 以 / 结尾）
    await this.uploadBuffer(bucket, key, Buffer.alloc(0), 'application/octet-stream')
  }

  async setObjectAcl(_bucket: string, _key: string, _acl: AclType): Promise<void> {
    // 七牛的访问控制在 Bucket 级别设置，不支持单对象 ACL
    throw new Error('七牛云不支持单对象 ACL 设置，请在控制台设置 Bucket 权限')
  }

  /**
   * 服务端代理上传：通过七牛 SDK putStream 推送 Buffer。
   *
   * ⚠️  Qiniu SDK v7.x 的 put() 方法期望 ReadableStream，传 Buffer 行为未定义。
   *     putStream(token,key,stream,putExtra,cb) 只有5个参数，无 streamLength；
   *     多传一个参数导致 putExtra/callback 错位，回调永不触发。改用 put()。
   */
  async uploadBuffer(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<void> {
    const token = this.getUploadToken(bucket, key)
    // 不指定 zone，让 SDK 通过 API 自动查询 bucket 所在区域
    // 写死 zone 会导致跨区 bucket 上传报 400 "incorrect region"
    const formUploader = new qiniu.form_up.FormUploader(new qiniu.conf.Config())
    const putExtra = new qiniu.form_up.PutExtra()
    // fname 必填，七牛 SDK 在 createMultipartForm 中用 fname.replace() 构建表单
    putExtra.fname = key.split('/').pop() ?? key
    putExtra.mimeType = contentType

    // 使用 put(token, key, buffer, putExtra, cb) 而非 putStream：
    // put() 内部自动将 Buffer 封装成 Readable（fsStream.push(body); fsStream.push(null)）
    // putStream 签名为 (token, key, stream, putExtra, cb)，共 5 个参数，无 streamLength；
    // 若多传一个参数会导致 putExtra/callback 错位，回调永不触发 → 请求卡住。
    await new Promise<void>((resolve, reject) => {
      formUploader.put(
        token,
        key,
        buffer,
        putExtra,
        (err: Error | null, body: unknown, info: { statusCode: number } | null) => {
          if (err) return reject(err)
          if (!info || info.statusCode !== 200) {
            return reject(
              new Error(`七牛云上传失败: HTTP ${info?.statusCode ?? '?'} - ${JSON.stringify(body)}`),
            )
          }
          resolve()
        },
      )
    })
  }

  getCdnUrl(_bucket: string, key: string): string | null {
    if (!this.cfg.cdnDomain) return null
    return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
  }
}
