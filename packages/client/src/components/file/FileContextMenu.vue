<template>
  <n-dropdown
    trigger="manual"
    :x="x"
    :y="y"
    :show="show"
    :options="menuOptions"
    @clickoutside="emit('close')"
    @select="handleSelect"
  />
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { NDropdown, NIcon } from 'naive-ui'
import {
  EyeOutline, DownloadOutline, CopyOutline, TrashOutline,
  PencilOutline, StarOutline, ShareSocialOutline,
  FolderOpenOutline, LinkOutline,
} from '@vicons/ionicons5'
import type { FileObject } from '@/types'
import { isPreviewable, isTextEditable } from '@/utils/mime'

const props = defineProps<{
  show: boolean
  x: number
  y: number
  file: FileObject | null
  isFavorite?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'action', action: string): void
}>()

function icon(comp: unknown) {
  return () => h(NIcon, null, { default: () => h(comp as Parameters<typeof h>[0]) })
}

const menuOptions = computed(() => {
  if (!props.file) return []

  const items = []

  if (!props.file.isDir && isPreviewable(props.file.key, props.file.contentType)) {
    items.push({ label: '预览', key: 'preview', icon: icon(EyeOutline) })
  }

  if (!props.file.isDir && isTextEditable(props.file.key, props.file.contentType)) {
    items.push({ label: '在线编辑', key: 'edit', icon: icon(PencilOutline) })
  }

  if (!props.file.isDir) {
    items.push({ label: '下载', key: 'download', icon: icon(DownloadOutline) })
  }

  if (props.file.isDir) {
    items.push({ label: '打开', key: 'navigate', icon: icon(FolderOpenOutline) })
  }

  items.push({ type: 'divider', key: 'd1' })

  items.push({ label: '重命名', key: 'rename', icon: icon(PencilOutline) })
  items.push({ label: '复制到...', key: 'copy', icon: icon(CopyOutline) })
  items.push({ label: '移动到...', key: 'move', icon: icon(CopyOutline) })

  if (!props.file.isDir) {
    items.push({ type: 'divider', key: 'd2' })
    items.push({ label: '生成分享链接', key: 'share', icon: icon(ShareSocialOutline) })
    items.push({ label: '复制链接', key: 'copy-link', icon: icon(LinkOutline) })
  }

  items.push({ type: 'divider', key: 'd3' })
  items.push({
    label: props.isFavorite ? '取消收藏' : '收藏',
    key: 'favorite',
    icon: icon(StarOutline),
  })
  items.push({
    label: '移入回收站',
    key: 'trash',
    icon: icon(TrashOutline),
    props: { style: 'color: #d03050' },
  })

  return items
})

function handleSelect(key: string) {
  emit('action', key)
  emit('close')
}
</script>
