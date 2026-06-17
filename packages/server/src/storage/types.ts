/**
 * 存储适配器统一接口定义
 *
 * 所有云存储提供商都须实现 StorageAdapter 接口，
 * 上层业务代码只依赖此接口，无需感知具体服务商。
 */

// ----------------------------------------------------------------
// 通用数据结构
// ----------------------------------------------------------------

export interface Bucket {
  name: string
  region?: string
  creationDate?: Date
}

export interface ObjectMeta {
  key: string
  size: number
  lastModified: Date
  etag?: string
  contentType?: string
  /** 是否为虚拟目录（key 以 / 结尾） */
  isDir: boolean
}

export interface ListResult {
  objects: ObjectMeta[]
  /** 下一页的起始标记（undefined 表示已到末页） */
  nextMarker?: string
  isTruncated: boolean
}

export interface ListOptions {
  prefix?: string        // 目录前缀
  delimiter?: string     // 目录分隔符，通常为 '/'
  marker?: string        // 分页起始
  maxKeys?: number       // 单次最多返回数量
}

export interface UploadOptions {
  contentType?: string
  metadata?: Record<string, string>
}

export interface PresignOptions {
  expires?: number         // 秒，默认 3600
  contentType?: string
}

export interface CompletedPart {
  PartNumber: number
  ETag: string
}

export type AclType = 'private' | 'public-read' | 'public-read-write'

// ----------------------------------------------------------------
// 适配器接口
// ----------------------------------------------------------------

export interface StorageAdapter {
  /** 提供商标识，与 accounts.provider 对应 */
  readonly provider: string

  /**
   * 是否支持标准预签名 PUT 直传。
   * false → 客户端直传不可用，initUpload 返回 proxyUpload:true，
   *          文件需上传到本地服务器再由服务端转发（七牛、又拍云）。
   */
  readonly supportsPresignedPut: boolean

  /**
   * 服务端代理上传：接收 Buffer，直接通过 SDK 推送到云存储。
   * 仅在 supportsPresignedPut=false 时使用。
   */
  uploadBuffer(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<void>

  // ---------- Bucket ----------

  listBuckets(): Promise<Bucket[]>

  // ---------- 对象列举 ----------

  listObjects(bucket: string, options?: ListOptions): Promise<ListResult>

  /** 获取单个对象元数据（HEAD 请求） */
  headObject(bucket: string, key: string): Promise<ObjectMeta>

  // ---------- 上传 ----------

  /**
   * 发起分片上传，返回 uploadId（用于后续分片和完成操作）
   * 小文件（< 10MB）可直接使用 getPresignedUploadUrl
   */
  initiateMultipartUpload(
    bucket: string,
    key: string,
    options?: UploadOptions,
  ): Promise<string>

  /** 获取分片上传的预签名 URL（客户端直传单个分片） */
  getPresignedPartUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expires?: number,
  ): Promise<string>

  /** 完成分片上传 */
  completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void>

  /** 中止分片上传（清理已上传分片） */
  abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<void>

  /** 获取小文件直传的预签名 PUT URL */
  getPresignedPutUrl(
    bucket: string,
    key: string,
    options?: PresignOptions,
  ): Promise<string>

  // ---------- 下载 ----------

  /** 获取对象的预签名下载 URL */
  getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expires?: number,
  ): Promise<string>

  // ---------- 对象操作 ----------

  /** 批量删除对象 */
  deleteObjects(bucket: string, keys: string[]): Promise<void>

  /**
   * 服务端复制对象（跨桶/跨路径）
   * 注：部分服务商不支持跨账户复制，此时由外层降级为下载+上传
   */
  copyObject(
    srcBucket: string,
    srcKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<void>

  /** 创建虚拟文件夹（上传一个 0 字节的 key/ 对象） */
  createFolder(bucket: string, prefix: string): Promise<void>

  // ---------- 权限 ----------

  setObjectAcl(bucket: string, key: string, acl: AclType): Promise<void>

  // ---------- CDN ----------

  /**
   * 返回对象的 CDN 加速 URL（若该服务商/配置支持）
   * 不支持时返回 null，由调用方决定降级策略
   */
  getCdnUrl(bucket: string, key: string): string | null
}

// ----------------------------------------------------------------
// 账户配置类型（每个提供商的 config 字段解密后的结构）
// ----------------------------------------------------------------

export interface S3Config {
  accessKeyId: string
  secretAccessKey: string
  region: string
  endpoint?: string      // 自定义端点（MinIO / R2 / B2）
  forcePathStyle?: boolean
  cdnDomain?: string
}

export interface OssConfig {
  accessKeyId: string
  accessKeySecret: string
  region: string         // 如 'oss-cn-hangzhou'
  endpoint?: string
  cdnDomain?: string
}

export interface CosConfig {
  secretId: string
  secretKey: string
  region: string         // 如 'ap-guangzhou'
  cdnDomain?: string
}

export interface ObsConfig {
  accessKeyId: string
  secretAccessKey: string
  server: string         // 如 'obs.cn-north-4.myhuaweicloud.com'
  cdnDomain?: string
}

export interface QiniuConfig {
  accessKey: string
  secretKey: string
  zone?: string          // 已废弃：SDK 自动查询 bucket 区域，无需手动指定
  cdnDomain?: string     // 七牛绑定的 CDN 域名（下载必须）
}

export interface UpyunConfig {
  operator: string       // 操作员账号
  password: string
  cdnDomain?: string
}

export type ProviderConfig =
  | S3Config
  | OssConfig
  | CosConfig
  | ObsConfig
  | QiniuConfig
  | UpyunConfig
