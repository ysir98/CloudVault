/**
 * S3 兼容适配器
 *
 * 覆盖以下服务商（均实现 S3 协议）：
 *   - AWS S3
 *   - Cloudflare R2  (endpoint 自定义)
 *   - MinIO          (endpoint 自定义 + forcePathStyle=true)
 *   - Backblaze B2   (endpoint 自定义)
 */

import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  PutObjectCommand,
  PutObjectAclCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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
  S3Config,
} from '../types'

export class S3Adapter implements StorageAdapter {
  readonly provider = 's3'
  readonly supportsPresignedPut = true
  private client: S3Client
  private cfg: S3Config

  constructor(cfg: S3Config) {
    this.cfg = cfg
    this.client = new S3Client({
      region: cfg.region || 'us-east-1',
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
      forcePathStyle: cfg.forcePathStyle ?? false,
    })
  }

  async listBuckets(): Promise<Bucket[]> {
    const res = await this.client.send(new ListBucketsCommand({}))
    return (res.Buckets ?? []).map((b) => ({
      name: b.Name!,
      creationDate: b.CreationDate,
    }))
  }

  async listObjects(bucket: string, options: ListOptions = {}): Promise<ListResult> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: options.prefix,
        Delimiter: options.delimiter ?? '/',
        ContinuationToken: options.marker,
        MaxKeys: options.maxKeys ?? 1000,
      }),
    )

    const objects: ObjectMeta[] = []

    // 普通文件
    for (const obj of res.Contents ?? []) {
      objects.push({
        key: obj.Key!,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified!,
        etag: obj.ETag?.replace(/"/g, ''),
        contentType: undefined,
        isDir: false,
      })
    }

    // 虚拟目录（CommonPrefixes）
    for (const cp of res.CommonPrefixes ?? []) {
      objects.push({
        key: cp.Prefix!,
        size: 0,
        lastModified: new Date(0),
        isDir: true,
      })
    }

    return {
      objects,
      nextMarker: res.NextContinuationToken,
      isTruncated: res.IsTruncated ?? false,
    }
  }

  async headObject(bucket: string, key: string): Promise<ObjectMeta> {
    const res = await this.client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    )
    return {
      key,
      size: res.ContentLength ?? 0,
      lastModified: res.LastModified!,
      etag: res.ETag?.replace(/"/g, ''),
      contentType: res.ContentType,
      isDir: key.endsWith('/'),
    }
  }

  async initiateMultipartUpload(
    bucket: string,
    key: string,
    options?: UploadOptions,
  ): Promise<string> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: options?.contentType,
        Metadata: options?.metadata,
      }),
    )
    return res.UploadId!
  }

  async getPresignedPartUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expires = 3600,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: expires },
    )
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            PartNumber: p.PartNumber,
            ETag: p.ETag,
          })),
        },
      }),
    )
  }

  async abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      }),
    )
  }

  async getPresignedPutUrl(
    bucket: string,
    key: string,
    options?: PresignOptions,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: options?.contentType,
      }),
      { expiresIn: options?.expires ?? 3600 },
    )
  }

  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expires = 3600,
  ): Promise<string> {
    // 优先使用 CDN 域名（若配置）
    if (this.cfg.cdnDomain) {
      return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
    }
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expires },
    )
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    // S3 单次最多删除 1000 个，按批处理
    const BATCH = 1000
    for (let i = 0; i < keys.length; i += BATCH) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.slice(i, i + BATCH).map((k) => ({ Key: k })),
            Quiet: true,
          },
        }),
      )
    }
  }

  async copyObject(
    srcBucket: string,
    srcKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: destBucket,
        Key: destKey,
        CopySource: `${srcBucket}/${srcKey}`,
      }),
    )
  }

  async createFolder(bucket: string, prefix: string): Promise<void> {
    const key = prefix.endsWith('/') ? prefix : `${prefix}/`
    await this.client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: '' }),
    )
  }

  async setObjectAcl(bucket: string, key: string, acl: AclType): Promise<void> {
    const aclMap: Record<AclType, string> = {
      private: 'private',
      'public-read': 'public-read',
      'public-read-write': 'public-read-write',
    }
    await this.client.send(
      new PutObjectAclCommand({
        Bucket: bucket,
        Key: key,
        ACL: aclMap[acl] as Parameters<typeof PutObjectAclCommand>[0]['ACL'],
      }),
    )
  }

  async uploadBuffer(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }),
    )
  }

  getCdnUrl(bucket: string, key: string): string | null {
    if (!this.cfg.cdnDomain) return null
    return `${this.cfg.cdnDomain.replace(/\/$/, '')}/${key}`
  }
}
