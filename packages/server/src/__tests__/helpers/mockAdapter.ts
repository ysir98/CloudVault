/**
 * Mock StorageAdapter
 *
 * 供路由测试使用，拦截所有云存储调用，返回可控的测试数据。
 * 通过 vi.mock('../../storage/registry', ...) 替换真实注册表。
 */

import { vi } from 'vitest'
import type { StorageAdapter, Bucket, ObjectMeta, ListResult } from '../../storage/types'

export function createMockAdapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    provider: 'mock',
    supportsPresignedPut: true,
    uploadBuffer: vi.fn<[string, string, Buffer, string], Promise<void>>().mockResolvedValue(undefined),

    listBuckets: vi.fn<[], Promise<Bucket[]>>().mockResolvedValue([
      { name: 'test-bucket', region: 'us-east-1' },
    ]),

    listObjects: vi.fn<[string, object?], Promise<ListResult>>().mockResolvedValue({
      objects: [
        {
          key: 'folder/',
          size: 0,
          lastModified: new Date('2024-01-01'),
          isDir: true,
        },
        {
          key: 'file.txt',
          size: 1024,
          lastModified: new Date('2024-01-02'),
          etag: 'etag123',
          contentType: 'text/plain',
          isDir: false,
        },
      ],
      isTruncated: false,
    }),

    headObject: vi.fn<[string, string], Promise<ObjectMeta>>().mockResolvedValue({
      key: 'file.txt',
      size: 1024,
      lastModified: new Date('2024-01-02'),
      etag: 'etag123',
      contentType: 'text/plain',
      isDir: false,
    }),

    initiateMultipartUpload: vi.fn<[string, string, object?], Promise<string>>()
      .mockResolvedValue('upload-id-123'),

    getPresignedPartUrl: vi.fn<[string, string, string, number, number?], Promise<string>>()
      .mockResolvedValue('https://s3.example.com/presigned-part-url'),

    completeMultipartUpload: vi.fn<[string, string, string, object[]], Promise<void>>()
      .mockResolvedValue(undefined),

    abortMultipartUpload: vi.fn<[string, string, string], Promise<void>>()
      .mockResolvedValue(undefined),

    getPresignedPutUrl: vi.fn<[string, string, object?], Promise<string>>()
      .mockResolvedValue('https://s3.example.com/presigned-put-url'),

    getPresignedDownloadUrl: vi.fn<[string, string, number?], Promise<string>>()
      .mockResolvedValue('https://s3.example.com/presigned-download-url'),

    deleteObjects: vi.fn<[string, string[]], Promise<void>>().mockResolvedValue(undefined),

    copyObject: vi.fn<[string, string, string, string], Promise<void>>().mockResolvedValue(undefined),

    createFolder: vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined),

    setObjectAcl: vi.fn<[string, string, string], Promise<void>>().mockResolvedValue(undefined),

    getCdnUrl: vi.fn<[string, string], string | null>().mockReturnValue(null),

    ...overrides,
  }
}
