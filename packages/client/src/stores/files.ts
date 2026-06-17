/**
 * 文件浏览 Store
 *
 * 管理当前浏览路径、文件列表、选中项、视图模式和排序。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fileApi } from '@/api/files'
import type {
  FileObject, ListResult, Tag, FavoriteItem, ViewMode, SortField, SortOrder,
} from '@/types'

export const useFileStore = defineStore('files', () => {
  // ---- 当前路径 ----
  const currentAccountId = ref('')
  const currentBucket = ref('')
  const currentPrefix = ref('')

  // ---- 文件列表 ----
  const objects = ref<FileObject[]>([])
  const nextMarker = ref<string | undefined>()
  const hasMore = ref(false)
  const loading = ref(false)

  // ---- 选中 ----
  const selectedKeys = ref<Set<string>>(new Set())

  // ---- 视图 ----
  const viewMode = ref<ViewMode>('list')
  const sortField = ref<SortField>('name')
  const sortOrder = ref<SortOrder>('asc')

  // ---- 标签 ----
  const tags = ref<Tag[]>([])

  // ---- 收藏 ----
  const favorites = ref<FavoriteItem[]>([])
  const favoriteKeys = computed(() =>
    new Set(favorites.value.map(f => `${f.accountId}:${f.bucket}:${f.key}`)),
  )

  /** 当前路径面包屑列表 */
  const breadcrumbs = computed(() => {
    const parts = currentPrefix.value.split('/').filter(Boolean)
    const crumbs = [{ label: currentBucket.value, prefix: '' }]
    let accumulated = ''
    for (const part of parts) {
      accumulated += `${part}/`
      crumbs.push({ label: part, prefix: accumulated })
    }
    return crumbs
  })

  /** 排序后的文件列表（目录优先） */
  const sortedObjects = computed(() => {
    const dirs = objects.value.filter(o => o.isDir)
    const files = objects.value.filter(o => !o.isDir)

    const sortFn = (a: FileObject, b: FileObject): number => {
      let cmp = 0
      switch (sortField.value) {
        case 'name':
          cmp = a.key.localeCompare(b.key)
          break
        case 'size':
          cmp = a.size - b.size
          break
        case 'lastModified':
          cmp = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime()
          break
        case 'type':
          cmp = (a.contentType ?? '').localeCompare(b.contentType ?? '')
          break
      }
      return sortOrder.value === 'asc' ? cmp : -cmp
    }

    return [...dirs.sort(sortFn), ...files.sort(sortFn)]
  })

  /** 已选中的文件对象列表 */
  const selectedObjects = computed(() =>
    objects.value.filter(o => selectedKeys.value.has(o.key)),
  )

  async function navigate(accountId: string, bucket: string, prefix = '') {
    currentAccountId.value = accountId
    currentBucket.value = bucket
    currentPrefix.value = prefix
    selectedKeys.value.clear()
    await loadFiles()
  }

  async function loadFiles(append = false) {
    if (!currentAccountId.value || !currentBucket.value) return
    loading.value = true
    try {
      const result: ListResult = await fileApi.list(
        currentAccountId.value,
        currentBucket.value,
        {
          prefix: currentPrefix.value,
          marker: append ? nextMarker.value : undefined,
          maxKeys: 200,
        },
      )

      objects.value = append ? [...objects.value, ...result.objects] : result.objects
      nextMarker.value = result.nextMarker
      hasMore.value = result.isTruncated
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (hasMore.value && !loading.value) {
      await loadFiles(true)
    }
  }

  async function refresh() {
    nextMarker.value = undefined
    await loadFiles(false)
  }

  // ---- 选中管理 ----

  function toggleSelect(key: string) {
    if (selectedKeys.value.has(key)) {
      selectedKeys.value.delete(key)
    } else {
      selectedKeys.value.add(key)
    }
  }

  function selectAll() {
    objects.value.forEach(o => selectedKeys.value.add(o.key))
  }

  function clearSelection() {
    selectedKeys.value.clear()
  }

  function rangeSelect(fromKey: string, toKey: string) {
    const keys = sortedObjects.value.map(o => o.key)
    const from = keys.indexOf(fromKey)
    const to = keys.indexOf(toKey)
    if (from === -1 || to === -1) return
    const [start, end] = from < to ? [from, to] : [to, from]
    keys.slice(start, end + 1).forEach(k => selectedKeys.value.add(k))
  }

  // ---- 标签 ----

  async function loadTags() {
    tags.value = await fileApi.listTags()
  }

  // ---- 收藏 ----

  async function loadFavorites() {
    favorites.value = await fileApi.listFavorites()
  }

  function isFavorite(accountId: string, bucket: string, key: string): boolean {
    return favoriteKeys.value.has(`${accountId}:${bucket}:${key}`)
  }

  async function toggleFavorite(accountId: string, bucket: string, key: string) {
    if (isFavorite(accountId, bucket, key)) {
      await fileApi.removeFavorite(accountId, bucket, key)
      favorites.value = favorites.value.filter(
        f => !(f.accountId === accountId && f.bucket === bucket && f.key === key),
      )
    } else {
      await fileApi.addFavorite(accountId, bucket, key)
      await loadFavorites()
    }
  }

  return {
    // state
    currentAccountId, currentBucket, currentPrefix,
    objects, nextMarker, hasMore, loading,
    selectedKeys, viewMode, sortField, sortOrder,
    tags, favorites, favoriteKeys,
    // computed
    breadcrumbs, sortedObjects, selectedObjects,
    // actions
    navigate, loadFiles, loadMore, refresh,
    toggleSelect, selectAll, clearSelection, rangeSelect,
    loadTags, loadFavorites, isFavorite, toggleFavorite,
  }
})
