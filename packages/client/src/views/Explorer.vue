<template>
  <div class="explorer">
    <!-- 工具栏 -->
    <FileToolbar
      :selected-count="fileStore.selectedKeys.size"
      :view-mode="fileStore.viewMode"
      :sort-field="fileStore.sortField"
      :sort-order="fileStore.sortOrder"
      @upload="handleUpload"
      @mkdir="showMkdirDialog"
      @delete="handleDelete"
      @copy="showCopyDialog"
      @move="showMoveDialog"
      @download-selected="handleDownloadSelected"
      @clear-selection="fileStore.clearSelection"
      @view-mode="fileStore.viewMode = $event"
      @sort="fileStore.sortField = $event[0]; fileStore.sortOrder = $event[1]"
    />

    <!-- 文件列表 -->
    <div
      class="explorer__content"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <FileList
        v-if="fileStore.viewMode === 'list'"
        :items="fileStore.sortedObjects"
        :selected-keys="fileStore.selectedKeys"
        :loading="fileStore.loading"
        :has-more="fileStore.hasMore"
        :show-thumbnails="true"
        :account-id="accountId"
        :bucket="bucket"
        :favorite-keys="fileStore.favoriteKeys"
        @toggle-select="fileStore.toggleSelect"
        @select-all="fileStore.selectAll"
        @clear-selection="fileStore.clearSelection"
        @range-select="fileStore.rangeSelect"
        @navigate="navigateTo"
        @preview="openPreview"
        @download="downloadFile"
        @toggle-favorite="f => fileStore.toggleFavorite(accountId, bucket, f.key)"
        @contextmenu="showContextMenu"
        @load-more="fileStore.loadMore"
      />

      <FileGrid
        v-else
        :items="fileStore.sortedObjects"
        :selected-keys="fileStore.selectedKeys"
        :loading="fileStore.loading"
        :account-id="accountId"
        :bucket="bucket"
        @toggle-select="fileStore.toggleSelect"
        @clear-selection="fileStore.clearSelection"
        @range-select="fileStore.rangeSelect"
        @navigate="navigateTo"
        @preview="openPreview"
        @download="downloadFile"
        @contextmenu="showContextMenu"
      />
    </div>

    <!-- 右键菜单 -->
    <FileContextMenu
      :show="ctxMenu.show"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :file="ctxMenu.file"
      :is-favorite="ctxMenu.file ? fileStore.isFavorite(accountId, bucket, ctxMenu.file.key) : false"
      @close="ctxMenu.show = false"
      @action="handleContextAction"
    />

    <!-- 新建文件夹 Dialog -->
    <n-modal v-model:show="mkdirVisible" preset="dialog" title="新建文件夹">
      <n-input v-model:value="mkdirName" placeholder="文件夹名称" @keyup.enter="createFolder" />
      <template #action>
        <n-button @click="mkdirVisible = false">取消</n-button>
        <n-button type="primary" :loading="mkdirLoading" @click="createFolder">创建</n-button>
      </template>
    </n-modal>

    <!-- 重命名 Dialog -->
    <n-modal v-model:show="renameVisible" preset="dialog" title="重命名">
      <n-input v-model:value="renameTo" @keyup.enter="doRename" />
      <template #action>
        <n-button @click="renameVisible = false">取消</n-button>
        <n-button type="primary" :loading="renameLoading" @click="doRename">确认</n-button>
      </template>
    </n-modal>

    <!-- 分享 Modal -->
    <ShareModal
      v-if="shareFile"
      :file="shareFile"
      :account-id="accountId"
      :bucket="bucket"
      @close="shareFile = null"
    />

    <!-- 复制/移动 Modal -->
    <CopyMoveModal
      v-if="copyMoveMode"
      :mode="copyMoveMode"
      :keys="Array.from(fileStore.selectedKeys)"
      :account-id="accountId"
      :bucket="bucket"
      @close="copyMoveMode = null"
      @done="onCopyMoveDone"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NModal, NInput, NButton, useMessage, useDialog,
} from 'naive-ui'
import hotkeys from 'hotkeys-js'
import FileToolbar from '@/components/file/FileToolbar.vue'
import FileList from '@/components/file/FileList.vue'
import FileGrid from '@/components/file/FileGrid.vue'
import FileContextMenu from '@/components/file/FileContextMenu.vue'
import ShareModal from '@/components/modals/ShareModal.vue'
import CopyMoveModal from '@/components/modals/CopyMoveModal.vue'
import { useFileStore } from '@/stores/files'
import { useTransferStore } from '@/stores/transfer'
import { useUiStore } from '@/stores/ui'
import { fileApi } from '@/api/files'
import { transferApi } from '@/api/transfer'
import type { FileObject } from '@/types'
import { keyToName, keyToPrefix } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const fileStore = useFileStore()
const transferStore = useTransferStore()
const uiStore = useUiStore()

const accountId = computed(() => route.params.accountId as string)
const bucket = computed(() => route.params.bucket as string)
const prefix = computed(() => (route.query.prefix as string) ?? '')

// 监听路由变化，重新加载文件列表
watch(
  () => [accountId.value, bucket.value, prefix.value],
  () => fileStore.navigate(accountId.value, bucket.value, prefix.value),
  { immediate: true },
)

// ---- 导航 ----

function navigateTo(item: FileObject) {
  if (!item.isDir) return
  router.push({
    name: 'Explorer',
    params: { accountId: accountId.value, bucket: bucket.value },
    query: { prefix: item.key },
  })
}

// ---- 预览 ----

function openPreview(item: FileObject) {
  uiStore.openPreview({
    accountId: accountId.value,
    bucket: bucket.value,
    key: item.key,
    contentType: item.contentType,
    size: item.size,
  })
}

// ---- 下载 ----

async function downloadFile(item: FileObject) {
  try {
    const url = await transferApi.getDownloadUrl(accountId.value, bucket.value, item.key)
    // 直接设置 href 在跨域预签名 URL 下会在当前标签页打开，而非触发下载
    // 改用 fetch → Blob URL，强制触发浏览器下载对话框
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`下载失败: ${resp.status}`)
    const blob = await resp.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = keyToName(item.key)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // 释放 Blob URL 内存（延迟 60s 确保下载已开始）
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  } catch (e) {
    message.error(`下载失败：${(e as Error).message}`)
  }
}

// ---- 批量下载 ----

async function handleDownloadSelected() {
  const files = fileStore.selectedObjects.filter(f => !f.isDir)
  if (!files.length) { message.warning('请选择要下载的文件'); return }
  // 超过 5 个文件逐一下载太多，提示用户
  if (files.length > 5) {
    message.warning('批量下载最多支持 5 个文件，请分批操作')
    return
  }
  for (const file of files) {
    await downloadFile(file)
    // 短暂间隔避免浏览器阻止多个下载
    await new Promise(r => setTimeout(r, 300))
  }
}

// ---- 上传 ----

async function handleUpload(files: File[]) {
  await transferStore.addUpload(accountId.value, bucket.value, prefix.value, files)
  message.success(`已添加 ${files.length} 个文件到上传队列`)
}

async function handleDrop(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length) await handleUpload(files)
}

// ---- 删除 ----

async function handleDelete() {
  const keys = Array.from(fileStore.selectedKeys)
  if (!keys.length) return

  dialog.warning({
    title: '确认删除',
    content: `确认将 ${keys.length} 个文件/文件夹移入回收站？`,
    positiveText: '移入回收站',
    negativeText: '取消',
    onPositiveClick: async () => {
      await fileApi.moveToTrash(accountId.value, bucket.value, keys)
      fileStore.clearSelection()
      await fileStore.refresh()
      message.success(`已移入回收站`)
    },
  })
}

// ---- 新建文件夹 ----

const mkdirVisible = ref(false)
const mkdirName = ref('')
const mkdirLoading = ref(false)

function showMkdirDialog() {
  mkdirName.value = ''
  mkdirVisible.value = true
}

async function createFolder() {
  if (!mkdirName.value.trim()) return
  mkdirLoading.value = true
  try {
    const folderPrefix = prefix.value + mkdirName.value.trim()
    await fileApi.mkdir(accountId.value, bucket.value, folderPrefix)
    mkdirVisible.value = false
    await fileStore.refresh()
    message.success('文件夹创建成功')
  } finally {
    mkdirLoading.value = false
  }
}

// ---- 重命名 ----

const renameVisible = ref(false)
const renameTo = ref('')
const renameTarget = ref<FileObject | null>(null)
const renameLoading = ref(false)

async function doRename() {
  if (!renameTarget.value || !renameTo.value.trim()) return
  const oldKey = renameTarget.value.key
  const parent = keyToPrefix(oldKey)
  const newKey = parent + renameTo.value.trim() + (renameTarget.value.isDir ? '/' : '')

  renameLoading.value = true
  try {
    await fileApi.rename(accountId.value, bucket.value, oldKey, newKey)
    renameVisible.value = false
    await fileStore.refresh()
    message.success('重命名成功')
  } finally {
    renameLoading.value = false
  }
}

// ---- 复制/移动 Modal ----
const copyMoveMode = ref<'copy' | 'move' | null>(null)

function showCopyDialog() {
  if (!fileStore.selectedKeys.size) { message.warning('请先选择文件'); return }
  copyMoveMode.value = 'copy'
}

function showMoveDialog() {
  if (!fileStore.selectedKeys.size) { message.warning('请先选择文件'); return }
  copyMoveMode.value = 'move'
}

async function onCopyMoveDone() {
  copyMoveMode.value = null
  fileStore.clearSelection()
  await fileStore.refresh()
}

// ---- 分享 ----

const shareFile = ref<FileObject | null>(null)

// ---- 右键菜单 ----

const ctxMenu = ref({
  show: false, x: 0, y: 0, file: null as FileObject | null,
})

function showContextMenu(item: FileObject, e: MouseEvent) {
  ctxMenu.value = { show: true, x: e.clientX, y: e.clientY, file: item }
}

async function handleContextAction(action: string) {
  const file = ctxMenu.value.file
  if (!file) return

  switch (action) {
    case 'preview': openPreview(file); break
    case 'download': await downloadFile(file); break
    case 'navigate': navigateTo(file); break
    case 'rename':
      renameTarget.value = file
      renameTo.value = keyToName(file.key)
      renameVisible.value = true
      break
    case 'trash':
      await fileApi.moveToTrash(accountId.value, bucket.value, [file.key])
      await fileStore.refresh()
      message.success('已移入回收站')
      break
    case 'favorite':
      await fileStore.toggleFavorite(accountId.value, bucket.value, file.key)
      break
    case 'share':
      shareFile.value = file
      break
    case 'copy':
      // 仅右键单个文件时，先选中再打开 Modal
      fileStore.clearSelection()
      fileStore.toggleSelect(file.key)
      copyMoveMode.value = 'copy'
      break
    case 'move':
      fileStore.clearSelection()
      fileStore.toggleSelect(file.key)
      copyMoveMode.value = 'move'
      break
    case 'copy-link':
      try {
        const url = await transferApi.getDownloadUrl(accountId.value, bucket.value, file.key)
        await navigator.clipboard.writeText(url)
        message.success('链接已复制')
      } catch {
        message.error('复制失败')
      }
      break
  }
}

// ================================================================
// 上传完成 → 自动刷新文件列表 / 失败 → 弹 toast
// 用 watch 监听 tasks 状态变化，不依赖 callback 挂载时序
// ================================================================
watch(
  () => transferStore.tasks.map(t => t.status),
  (newStatuses, oldStatuses) => {
    if (!oldStatuses) return
    transferStore.tasks.forEach((task, i) => {
      const oldStatus = oldStatuses[i]
      const newStatus = newStatuses[i]
      if (oldStatus === newStatus) return
      if (task.type !== 'upload') return
      if (task.accountId !== accountId.value || task.bucket !== bucket.value) return

      if (newStatus === 'completed') {
        fileStore.refresh()
        message.success(`${task.fileName} 上传成功`)
      } else if (newStatus === 'failed') {
        message.error(`${task.fileName} 上传失败：${task.error ?? '未知错误'}`)
      }
    })
  },
)

// ================================================================
// 文件浏览器快捷键（页面级，挂载时注册，卸载时移除）
// ================================================================
onMounted(() => {
  // Space — 预览第一个选中文件
  hotkeys('space', (e) => {
    e.preventDefault()
    const first = fileStore.selectedObjects[0]
    if (first && !first.isDir) openPreview(first)
  })

  // F2 — 重命名第一个选中项
  hotkeys('f2', (e) => {
    e.preventDefault()
    const first = fileStore.selectedObjects[0]
    if (first) {
      renameTarget.value = first
      renameTo.value = keyToName(first.key)
      renameVisible.value = true
    }
  })

  // Delete — 移入回收站
  hotkeys('delete', async (e) => {
    e.preventDefault()
    if (fileStore.selectedKeys.size > 0) await handleDelete()
  })

  // Ctrl+A — 全选
  hotkeys('ctrl+a', (e) => {
    e.preventDefault()
    fileStore.selectAll()
  })
})

onUnmounted(() => {
  hotkeys.unbind('space')
  hotkeys.unbind('f2')
  hotkeys.unbind('delete')
  hotkeys.unbind('ctrl+a')
})

// ================================================================
// 粘贴上传（Ctrl+V 从剪贴板获取文件/截图上传）
// ================================================================
function handlePaste(e: ClipboardEvent) {
  // 若焦点在输入框内则跳过
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

  const items = Array.from(e.clipboardData?.items ?? [])
  const files = items
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((f): f is File => f !== null)

  if (files.length > 0) {
    handleUpload(files)
  }
}

onMounted(() => document.addEventListener('paste', handlePaste))
onUnmounted(() => document.removeEventListener('paste', handlePaste))
</script>

<style scoped>
.explorer {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.explorer__content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
