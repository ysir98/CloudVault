/**
 * 腾讯云 COS 适配器
 *
 * 使用 cos-nodejs-sdk-v5。COS SDK 为回调风格，统一 Promise 化。
 */

import COS from 'cos-nodejs-sdk-v5'
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
  CosConfig,
} from '../types'

/** 将 COS SDK 回调方法 Promise 化 */
function promisify<T>(
  fn: (params: unknown, cb: (err: Error | null, data: T) => void) => void,
  params: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn(params, (err, data) => (err ? reject(err) : resolve(data)))
  })
}

const ACL_MAP: Record<AclType, string> = {
  private: 'private',
  'public-read': 'public-read',
  'public-read-write': 'public-read-write',
}

export class CosAdapter implements StorageAdapter {
  readonly provider = 'cos'
  readonly supportsPresignedPut = true
  private client: COS
  private cfg: CosConfig

  constructor(cfg: CosConfig) {
    this.cfg = cfg
    this.client = new COS({
      SecretId: cfg.secretId,
      SecretKey: cfg.secretKey,
    })
  }

  async listBuckets(): Promise<Bucket[]> {
    const res = await promisify<COS.GetServiceResult>(
      this.client.getService.bind(this.client),
      {},
    )
    return (res.Buckets ?? []).map((b) => ({
      name: b.Name,
      region: b.Location,
      creationDate: new Date(b.CreationDate),
    }))
  }

  async listObjects(bucket: string, options: ListOptions = {}): Promise<ListResult> {
    const res = await promisify<COS.GetBucketResult>(
      this.client.getBucket.bind(this.client),
      {
        Bucket: bucket,
        Region: this.cfg.region,
        Prefix: options.prefix ?? '',
        Delimiter: options.delimiter ?? '/',
        Marker: options.marker,
        MaxKeys: options.maxKeys ?? 1000,
      },
    )

    const objects: ObjectMeta[] = []

    for (const obj of res.Contents ?? []) {
      objects.push({
        key: obj.Key,
        size: parseInt(String(obj.Size), 10),
        lastModified: new Date(obj.LastModified),
        etag: obj.ETag?.replace(/"/g, ''),
        isDir: false,
      })
    }

    for (const cp of res.CommonPrefixes ?? []) {
      objects.push({
        key: cp.Prefix,
        size: 0,
        lastModified: new Date(0),
        isDir: true,
      })
    }

    return {
      objects,
      nextMarker: res.NextMarker,
      isTruncated: res.IsTruncated === 'true',
    }
  }

  async headObject(bucket: string, key: string): Promise<ObjectMeta> {
    const res = await promisify<COS.HeadObjectResult>(
      this.client.headObject.bind(this.client),
      { Bucket: bucket, Region: this.cfg.region, Key: key },
    )
    return {
      key,
      size: parseInt(String(res.headers['content-length'] ?? '0'), 10),
      lastModified: new Date(res.headers['last-modified'] as string),
      etag: (res.headers['etag'] as string)?.replace(/"/g, ''),
      contentType: res.headers['content-type'] as string,
      isDir: key.endsWith('/'),
    }
  }

  async initiateMultipartUpload(
    bucket: string,
    key: string,
    options?: UploadOptions,
  ): Promise<string> {
    const res = await promisify<COS.InitMultipartUploadResult>(
      this.client.multipartInit.bind(this.client),
      {
        Bucket: bucket,
        Region: this.cfg.region,
        Key: key,
        Headers: options?.contentType ? { 'Content-Type': options.contentType } : {},
      },
    )
    return res.UploadId
  }

  async getPresignedPartUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expires = 3600,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.getObjectUrl(
        {
          Bucket: bucket,
          Region: this.cfg.region,
          Key: key,
          Method: 'PUT',
          Expires: expires,
          Query: { partNumber: String(partNumber), uploadId },
          Sign: true,
        },
        (err, data) => (err ? reject(err) : resolve(data.Url)),
      )
    })
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await promisify(this.client.multipartComplete.bind(this.client), {
      Bucket: bucket,
      Region: this.cfg.region,
      Key: key,
      UploadId: uploadId,
      Parts: parts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
    })
  }

  async abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<void> {
    await promisify(this.client.multipartAbort.bind(this.client), {
      Bucket: bucket,
      Region: this.cfg.region,
      Key: key,
      UploadId: uploadId,
    })
  }

  async getPresignedPutUrl(
    bucket: string,
    key: string,
    options?: PresignOptions,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.getObjectUrl(
        {
          Bucket: bucket,
          Region: this.cfg.region,
          Key: key,
          Method: 'PUT',
          Expires: options?.expires ?? 3600,
          Sign: true,
        },
        (err, data) => (err ? reject(err) : resolve(data.Url)),
      )
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
    return new Promise((resolve, reject) => {
      this.client.getObjectUrl(
        {
          Bucket: bucket,
          Region: this.cfg.region,
          Key: key,
          Method: 'GET',
          Expires: expires,
          Sign: true,
        },
        (err, data) => (err ? reject(err) : resolve(data.Url)),
      )
    })
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    const BATCH = 1000
    for (let i = 0; i < keys.length; i += BATCH) {
      await promisify(this.client.deleteMultipleObject.bind(this.client), {
        Bucket: bucket,
        Region: this.cfg.region,
        Objects: keys.slice(i, i + BATCH).map((k) => ({ Key: k })),
        Quiet: 'true',
      })
    }
  }

  async copyObject(
    srcBucket: string,
    srcKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<void> {
    await promisify(this.client.putObjectCopy.bind(this.client), {
      Bucket: destBucket,
      Region: this.cfg.region,
      Key: destKey,
      CopySource: `${srcBucket}.cos.${this.cfg.region}.myqcloud.com/${srcKey}`,
    })
  }

  async createFolder(bucket: string, prefix: string): Promise<void> {
    const key = prefix.endsWith('/') ? prefix : `${prefix}/`
    await promisify(this.client.putObject.bind(this.client), {
      Bucket: bucket,
      Region: this.cfg.region,
      Key: key,
      Body: '',
    })
  }

  async setObjectAcl(bucket: string, key: string, acl: AclType): Promise<void> {
    await promisify(this.client.putObjectAcl.bind(this.client), {
      Bucket: bucket,
      Region: this.cfg.region,
      Key: key,
      ACL: ACL_MAP[acl],
    })
  }

  async uploadBuffer(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<void> {
    await promisify(this.client.putObject.bind(this.client), {
      Bucket: bucket, Region: this.cfg.region, Key: key,
      Body: buffer, ContentType: contentType,
    })
  }

  getCdnUrl(_bucket: string, key: string): string | null {
    if (!this.cfg.cdnDomain) return null
    return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
  }
}
