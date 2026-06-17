<template>
  <!-- 网格视图（缩略图模式） -->
  <div class="file-grid">
    <div
      v-for="item in items"
      :key="item.key"
      class="file-grid__item"
      :class="{ selected: selectedKeys.has(item.key), dir: item.isDir }"
      @click="handleClick(item, $event)"
      @dblclick="handleDblClick(item)"
      @contextmenu.prevent="emit('contextmenu', item, $event)"
    >
      <!-- 选中复选框 -->
      <n-checkbox
        class="file-grid__checkbox"
        :checked="selectedKeys.has(item.key)"
        @click.stop
        @update:checked="emit('toggle-select', item.key)"
      />

      <!-- 缩略图 / 图标 -->
      <div class="file-grid__preview">
        <img
          v-if="isImage(item) && !imageError[item.key]"
          :src="getThumbnailUrl(item)"
          class="file-grid__img"
          loading="lazy"
          @error="imageError[item.key] = true"
        />
        <div v-else class="file-grid__icon-wrap" :style="{ background: getCategoryColor(item) }">
          <n-icon :component="getIcon(item)" size="32" color="#fff" />
        </div>
      </div>

      <!-- 文件名 -->
      <div class="file-grid__name" :title="keyToName(item.key)">
        {{ keyToName(item.key) }}
      </div>

      <!-- 文件大小（非目录） -->
      <div class="file-grid__meta">
        {{ item.isDir ? '文件夹' : formatSize(item.size) }}
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && !items.length" class="file-grid__empty">
      <n-empty description="此目录为空" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NCheckbox, NIcon, NEmpty } from 'naive-ui'
import {
  FolderOutline, DocumentOutline, ImageOutline,
  VideocamOutline, MusicalNotesOutline,
} from '@vicons/ionicons5'
import type { FileObject } from '@/types'
import { formatSize, keyToName } from '@/utils/format'
import { getFileCategory, isPreviewable } from '@/utils/mime'
import { shareApi } from '@/api/share'
import type { Component } from 'vue'

const props = defineProps<{
  items: FileObject[]
  selectedKeys: Set<string>
  loading: boolean
  accountId: string
  bucket: string
}>()

const emit = defineEmits<{
  (e: 'toggle-select', key: string): void
  (e: 'clear-selection'): void
  (e: 'range-select', from: string, to: string): void
  (e: 'navigate', item: FileObject): void
  (e: 'preview', item: FileObject): void
  (e: 'download', item: FileObject): void
  (e: 'contextmenu', item: FileObject, event: MouseEvent): void
}>()

const imageError = ref<Record<string, boolean>>({})
const lastClickedKey = ref<string | null>(null)

function isImage(item: FileObject): boolean {
  return getFileCategory(item.key, item.contentType) === 'image'
}

function getThumbnailUrl(item: FileObject): string {
  return shareApi.getThumbnailUrl(props.accountId, props.bucket, item.key, 160)
}

function getIcon(item: FileObject): Component {
  if (item.isDir) return FolderOutline
  const cat = getFileCategory(item.key, item.contentType)
  return {
    image: ImageOutline, video: VideocamOutline,
    audio: MusicalNotesOutline, document: DocumentOutline,
  }[cat] ?? DocumentOutline
}

function getCategoryColor(item: FileObject): string {
  if (item.isDir) return '#f0a020'
  const colors: Record<string, string> = {
    image: '#18a058', video: '#2080f0',
    audio: '#d03050', document: '#8a2be2',
    code: '#18a058', archive: '#888',
  }
  return colors[getFileCategory(item.key, item.contentType)] ?? '#888'
}

function handleClick(item: FileObject, event: MouseEvent) {
  if (event.shiftKey && lastClickedKey.value) {
    emit('range-select', lastClickedKey.value, item.key)
  } else if (event.ctrlKey || event.metaKey) {
    emit('toggle-select', item.key)
  } else {
    emit('clear-selection')
    emit('toggle-select', item.key)
  }
  lastClickedKey.value = item.key
}

function handleDblClick(item: FileObject) {
  if (item.isDir) {
    emit('navigate', item)
  } else if (isPreviewable(item.key, item.contentType)) {
    emit('preview', item)
  } else {
    emit('download', item)
  }
}
</script>

<style scoped>
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  align-content: start;
}

.file-grid__item {
  position: relative;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: background 0.15s;
  border: 2px solid transparent;
}

.file-grid__item:hover { background: rgba(128,128,128,0.08); }
.file-grid__item.selected {
  background: rgba(24, 160, 88, 0.1);
  border-color: rgba(24, 160, 88, 0.4);
}

.file-grid__checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  opacity: 0;
  transition: opacity 0.1s;
}

.file-grid__item:hover .file-grid__checkbox,
.file-grid__item.selected .file-grid__checkbox {
  opacity: 1;
}

.file-grid__preview {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
}

.file-grid__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-grid__icon-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.file-grid__name {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.file-grid__meta {
  font-size: 11px;
  opacity: 0.5;
  text-align: center;
  margin-top: 2px;
}

.file-grid__empty {
  grid-column: 1 / -1;
  padding: 60px 0;
  display: flex;
  justify-content: center;
}
</style>
