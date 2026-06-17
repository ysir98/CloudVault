/**
 * stores/files 单元测试
 *
 * Mock fileApi，专注测试 store 内部状态管理逻辑。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFileStore } from '../../stores/files'
import type { FileObject } from '../../types'

// vi.hoisted 确保变量在 vi.mock 工厂提升后依然可访问
const mockObjects = vi.hoisted<FileObject[]>(() => [
  { key: 'folder/', size: 0, lastModified: new Date('2024-01-01'), isDir: true },
  { key: 'b-file.txt', size: 2048, lastModified: new Date('2024-01-03'), contentType: 'text/plain', isDir: false },
  { key: 'a-image.jpg', size: 512000, lastModified: new Date('2024-01-02'), contentType: 'image/jpeg', isDir: false },
])

vi.mock('../../api/files', () => ({
  fileApi: {
    list: vi.fn().mockImplementation(() => Promise.resolve({
      objects: mockObjects,
      isTruncated: false,
    })),
    listTags: vi.fn().mockResolvedValue([]),
    listFavorites: vi.fn().mockImplementation(() => Promise.resolve([
      { id: 'fav-1', accountId: 'acc-1', bucket: 'bucket-a', key: 'photo.jpg', createdAt: 1000 },
    ])),
    addFavorite: vi.fn().mockResolvedValue(undefined),
    removeFavorite: vi.fn().mockResolvedValue(undefined),
  },
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('navigate', () => {
  it('切换路径后更新 currentAccountId / currentBucket / currentPrefix', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'my-bucket', 'folder/')
    expect(store.currentAccountId).toBe('acc-1')
    expect(store.currentBucket).toBe('my-bucket')
    expect(store.currentPrefix).toBe('folder/')
  })

  it('navigate 时清空选中', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'bucket-a', '')
    store.toggleSelect('folder/')
    expect(store.selectedKeys.size).toBe(1)

    await store.navigate('acc-1', 'bucket-b', '')
    expect(store.selectedKeys.size).toBe(0)
  })

  it('navigate 后加载文件列表', async () => {
    const { fileApi } = await import('../../api/files')
    const store = useFileStore()
    await store.navigate('acc-1', 'test-bucket', '')
    expect(fileApi.list).toHaveBeenCalledWith('acc-1', 'test-bucket', expect.objectContaining({ prefix: '' }))
    expect(store.objects).toHaveLength(mockObjects.length)
  })
})

describe('选中管理', () => {
  it('toggleSelect 切换单个项目', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'b', '')

    store.toggleSelect('folder/')
    expect(store.selectedKeys.has('folder/')).toBe(true)

    store.toggleSelect('folder/')
    expect(store.selectedKeys.has('folder/')).toBe(false)
  })

  it('selectAll 选中全部', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'b', '')

    store.selectAll()
    expect(store.selectedKeys.size).toBe(mockObjects.length)
  })

  it('clearSelection 清空选中', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'b', '')

    store.selectAll()
    store.clearSelection()
    expect(store.selectedKeys.size).toBe(0)
  })

  it('selectedObjects 返回选中文件对象', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'b', '')

    store.toggleSelect('b-file.txt')
    store.toggleSelect('a-image.jpg')

    expect(store.selectedObjects).toHaveLength(2)
    expect(store.selectedObjects.map(o => o.key)).toContain('b-file.txt')
  })

  it('rangeSelect 选中区间内的所有文件', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'b', '')

    // sortedObjects: folder/ → a-image.jpg → b-file.txt
    const sorted = store.sortedObjects
    const first = sorted[0].key
    const last = sorted[2].key

    store.rangeSelect(first, last)
    expect(store.selectedKeys.size).toBe(3)
  })
})

describe('sortedObjects', () => {
  it('目录排在文件前面', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'b', '')

    const sorted = store.sortedObjects
    const firstDir = sorted.findIndex(o => o.isDir)
    const firstFile = sorted.findIndex(o => !o.isDir)

    expect(firstDir).toBeLessThan(firstFile)
  })

  it('默认按名称升序排列文件', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'b', '')
    store.sortField = 'name'
    store.sortOrder = 'asc'

    const files = store.sortedObjects.filter(o => !o.isDir)
    expect(files[0].key).toBe('a-image.jpg')
    expect(files[1].key).toBe('b-file.txt')
  })

  it('按大小降序排列', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'b', '')
    store.sortField = 'size'
    store.sortOrder = 'desc'

    const files = store.sortedObjects.filter(o => !o.isDir)
    expect(files[0].size).toBeGreaterThanOrEqual(files[1].size)
  })
})

describe('breadcrumbs', () => {
  it('根目录只有 Bucket 面包屑', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'my-bucket', '')
    expect(store.breadcrumbs).toHaveLength(1)
    expect(store.breadcrumbs[0].label).toBe('my-bucket')
  })

  it('子目录正确生成面包屑', async () => {
    const store = useFileStore()
    await store.navigate('acc-1', 'my-bucket', 'folder/sub/')
    // Bucket + folder + sub = 3 级
    expect(store.breadcrumbs).toHaveLength(3)
    expect(store.breadcrumbs[1].label).toBe('folder')
    expect(store.breadcrumbs[2].label).toBe('sub')
  })
})

describe('收藏夹', () => {
  it('loadFavorites 加载收藏', async () => {
    const store = useFileStore()
    await store.loadFavorites()
    expect(store.favorites).toHaveLength(1)
  })

  it('isFavorite 根据 favoriteKeys computed 判断', async () => {
    const store = useFileStore()
    await store.loadFavorites()

    expect(store.isFavorite('acc-1', 'bucket-a', 'photo.jpg')).toBe(true)
    expect(store.isFavorite('acc-1', 'bucket-a', 'other.jpg')).toBe(false)
  })

  it('toggleFavorite — 已收藏时调用 removeFavorite', async () => {
    const { fileApi } = await import('../../api/files')
    const store = useFileStore()
    await store.loadFavorites()

    await store.toggleFavorite('acc-1', 'bucket-a', 'photo.jpg')

    expect(fileApi.removeFavorite).toHaveBeenCalledWith('acc-1', 'bucket-a', 'photo.jpg')
  })

  it('toggleFavorite — 未收藏时调用 addFavorite', async () => {
    const { fileApi } = await import('../../api/files')
    const store = useFileStore()
    await store.loadFavorites()

    await store.toggleFavorite('acc-1', 'bucket-a', 'new-file.txt')

    // store 调用 addFavorite 时不传 displayName（可选参数），断言只验证前 3 个参数
    expect(fileApi.addFavorite).toHaveBeenCalledWith('acc-1', 'bucket-a', 'new-file.txt')
  })
})
