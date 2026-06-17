/**
 * 华为云 OBS 适配器
 *
 * 使用 esdk-obs-nodejs（官方 SDK）。
 * OBS SDK 为回调风格，此处统一 Promise 化。
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ObsClient = require('esdk-obs-nodejs')

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
  ObsConfig,
} from '../types'

function p<T>(obs: unknown, method: string, params: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(obs as any)[method](params, (err: Error, result: T) =>
      err ? reject(err) : resolve(result),
    )
  })
}

const ACL_MAP: Record<AclType, string> = {
  private: 'private',
  'public-read': 'public-read',
  'public-read-write': 'public-read-write',
}

export class ObsAdapter implements StorageAdapter {
  readonly provider = 'obs'
  readonly supportsPresignedPut = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any
  private cfg: ObsConfig

  constructor(cfg: ObsConfig) {
    this.cfg = cfg
    this.client = new ObsClient({
      access_key_id: cfg.accessKeyId,
      secret_access_key: cfg.secretAccessKey,
      server: cfg.server,
    })
  }

  async listBuckets(): Promise<Bucket[]> {
    const res = await p<{ InterfaceResult: { Buckets: Array<{ BucketName: string; CreationDate: string }> } }>(
      this.client,
      'listBuckets',
      {},
    )
    return (res.InterfaceResult?.Buckets ?? []).map((b) => ({
      name: b.BucketName,
      creationDate: new Date(b.CreationDate),
    }))
  }

  async listObjects(bucket: string, options: ListOptions = {}): Promise<ListResult> {
    const res = await p<{
      InterfaceResult: {
        Contents: Array<{ Key: string; Size: string; LastModified: string; ETag: string }>
        CommonPrefixes: Array<{ Prefix: string }>
        NextMarker: string
        IsTruncated: string
      }
    }>(this.client, 'listObjects', {
      Bucket: bucket,
      Prefix: options.prefix ?? '',
      Delimiter: options.delimiter ?? '/',
      Marker: options.marker,
      MaxKeys: options.maxKeys ?? 1000,
    })

    const ir = res.InterfaceResult
    const objects: ObjectMeta[] = []

    for (const obj of ir.Contents ?? []) {
      objects.push({
        key: obj.Key,
        size: parseInt(obj.Size, 10),
        lastModified: new Date(obj.LastModified),
        etag: obj.ETag?.replace(/"/g, ''),
        isDir: false,
      })
    }

    for (const cp of ir.CommonPrefixes ?? []) {
      objects.push({ key: cp.Prefix, size: 0, lastModified: new Date(0), isDir: true })
    }

    return {
      objects,
      nextMarker: ir.NextMarker,
      isTruncated: ir.IsTruncated === 'true',
    }
  }

  async headObject(bucket: string, key: string): Promise<ObjectMeta> {
    const res = await p<{ InterfaceResult: Record<string, string> }>(
      this.client,
      'getObjectMetadata',
      { Bucket: bucket, Key: key },
    )
    const ir = res.InterfaceResult
    return {
      key,
      size: parseInt(ir.ContentLength ?? '0', 10),
      lastModified: new Date(ir.LastModified),
      etag: ir.ETag?.replace(/"/g, ''),
      contentType: ir.ContentType,
      isDir: key.endsWith('/'),
    }
  }

  async initiateMultipartUpload(
    bucket: string,
    key: string,
    options?: UploadOptions,
  ): Promise<string> {
    const res = await p<{ InterfaceResult: { UploadId: string } }>(
      this.client,
      'initiateMultipartUpload',
      {
        Bucket: bucket,
        Key: key,
        ContentType: options?.contentType,
      },
    )
    return res.InterfaceResult.UploadId
  }

  async getPresignedPartUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expires = 3600,
  ): Promise<string> {
    const res = await p<{ SignedUrl: string }>(
      this.client,
      'createSignedUrl',
      {
        Method: 'PUT',
        Bucket: bucket,
        Key: key,
        Expires: expires,
        QueryParams: { partNumber: String(partNumber), uploadId },
      },
    )
    return res.SignedUrl
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await p(this.client, 'completeMultipartUpload', {
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      Parts: parts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
    })
  }

  async abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void> {
    await p(this.client, 'abortMultipartUpload', { Bucket: bucket, Key: key, UploadId: uploadId })
  }

  async getPresignedPutUrl(bucket: string, key: string, options?: PresignOptions): Promise<string> {
    const res = await p<{ SignedUrl: string }>(this.client, 'createSignedUrl', {
      Method: 'PUT',
      Bucket: bucket,
      Key: key,
      Expires: options?.expires ?? 3600,
    })
    return res.SignedUrl
  }

  async getPresignedDownloadUrl(bucket: string, key: string, expires = 3600): Promise<string> {
    if (this.cfg.cdnDomain) return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
    const res = await p<{ SignedUrl: string }>(this.client, 'createSignedUrl', {
      Method: 'GET',
      Bucket: bucket,
      Key: key,
      Expires: expires,
    })
    return res.SignedUrl
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    const BATCH = 1000
    for (let i = 0; i < keys.length; i += BATCH) {
      await p(this.client, 'deleteObjects', {
        Bucket: bucket,
        Delete: {
          Objects: keys.slice(i, i + BATCH).map((k) => ({ Key: k })),
          Quiet: true,
        },
      })
    }
  }

  async copyObject(
    srcBucket: string,
    srcKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<void> {
    await p(this.client, 'copyObject', {
      Bucket: destBucket,
      Key: destKey,
      CopySource: `${srcBucket}/${srcKey}`,
    })
  }

  async createFolder(bucket: string, prefix: string): Promise<void> {
    const key = prefix.endsWith('/') ? prefix : `${prefix}/`
    await p(this.client, 'putObject', { Bucket: bucket, Key: key, Body: '' })
  }

  async setObjectAcl(bucket: string, key: string, acl: AclType): Promise<void> {
    await p(this.client, 'setObjectAcl', { Bucket: bucket, Key: key, ACL: ACL_MAP[acl] })
  }

  async uploadBuffer(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<void> {
    await p(this.client, 'putObject', { Bucket: bucket, Key: key, Body: buffer, ContentType: contentType })
  }

  getCdnUrl(_bucket: string, key: string): string | null {
    if (!this.cfg.cdnDomain) return null
    return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
  }
}
