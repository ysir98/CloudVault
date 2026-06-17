<template>
  <!-- 列表视图：虚拟滚动支持大量文件 -->
  <div class="file-list" ref="containerRef">
    <!-- 表头 -->
    <div class="file-list__header">
      <n-checkbox
        :checked="allSelected"
        :indeterminate="partialSelected"
        @update:checked="toggleAll"
      />
      <span class="file-list__col file-list__col--name">名称</span>
      <span class="file-list__col file-list__col--size">大小</span>
      <span class="file-list__col file-list__col--date">修改时间</span>
      <span class="file-list__col file-list__col--actions" />
    </div>

    <!-- 虚拟滚动列表 -->
    <n-virtual-list
      :items="items"
      :item-size="44"
      :padding-bottom="80"
      key-field="key"
    >
      <template #default="{ item }: { item: FileObject }">
        <div
          class="file-list__row"
          :class="{
            selected: selectedKeys.has(item.key),
            dir: item.isDir,
          }"
          @click="handleRowClick(item, $event)"
          @dblclick="handleRowDblClick(item)"
          @contextmenu.prevent="emit('contextmenu', item, $event)"
        >
          <n-checkbox
            :checked="selectedKeys.has(item.key)"
            @click.stop
            @update:checked="emit('toggle-select', item.key)"
          />

          <!-- 图标 + 名称 -->
          <div class="file-list__col file-list__col--name">
            <!-- 图片缩略图 -->
            <img
              v-if="isImage(item) && showThumbnails"
              :src="getThumbnailUrl(item)"
              class="file-list__thumb"
              loading="lazy"
              @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
            />
            <n-icon v-else :component="getIcon(item)" class="file-list__icon" />
            <span class="file-list__name" :title="displayName(item)">
              {{ displayName(item) }}
            </span>
          </div>

          <span class="file-list__col file-list__col--size">
            {{ item.isDir ? '—' : formatSize(item.size) }}
          </span>

          <span class="file-list__col file-list__col--date">
            {{ formatDate(item.lastModified) }}
          </span>

          <!-- 行内快捷操作（hover 时显示） -->
          <div class="file-list__col file-list__col--actions" @click.stop>
            <n-button
              size="tiny"
              text
              :title="isFav(item) ? '取消收藏' : '收藏'"
              @click="emit('toggle-favorite', item)"
            >
              <template #icon>
                <n-icon
                  :component="isFav(item) ? Star : StarOutline"
                  :color="isFav(item) ? '#f0a020' : undefined"
                />
              </template>
            </n-button>

            <n-button
              v-if="!item.isDir"
              size="tiny"
              text
              title="预览"
              @click="emit('preview', item)"
            >
              <template #icon><n-icon :component="EyeOutline" /></template>
            </n-button>

            <n-button
              v-if="!item.isDir"
              size="tiny"
              text
              title="下载"
              @click="emit('download', item)"
            >
              <template #icon><n-icon :component="DownloadOutline" /></template>
            </n-button>

            <n-button
              size="tiny"
              text
              title="更多操作"
              @click="emit('contextmenu', item, $event)"
            >
              <template #icon><n-icon :component="EllipsisHorizontalOutline" /></template>
            </n-button>
          </div>
        </div>
      </template>
    </n-virtual-list>

    <!-- 加载更多 -->
    <div v-if="hasMore" class="file-list__load-more">
      <n-button
        :loading="loading"
        text
        @click="emit('load-more')"
      >
        加载更多...
      </n-button>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && !items.length" class="file-list__empty">
      <n-empty description="此目录为空" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NCheckbox, NVirtualList, NIcon, NButton, NEmpty,
} from 'naive-ui'
import {
  FolderOutline, DocumentOutline, StarOutline, Star,
  EyeOutline, DownloadOutline, EllipsisHorizontalOutline,
  ImageOutline, VideocamOutline, MusicalNotesOutline,
} from '@vicons/ionicons5'
import type { FileObject } from '@/types'
import { formatSize, formatDate, keyToName } from '@/utils/format'
import { getFileCategory, isPreviewable } from '@/utils/mime'
import { shareApi } from '@/api/share'
import type { Component } from 'vue'

const props = defineProps<{
  items: FileObject[]
  selectedKeys: Set<string>
  loading: boolean
  hasMore: boolean
  showThumbnails?: boolean
  accountId: string
  bucket: string
  favoriteKeys?: Set<string>
}>()

const emit = defineEmits<{
  (e: 'toggle-select', key: string): void
  (e: 'select-all'): void
  (e: 'clear-selection'): void
  (e: 'range-select', from: string, to: string): void
  (e: 'navigate', item: FileObject): void
  (e: 'preview', item: FileObject): void
  (e: 'download', item: FileObject): void
  (e: 'toggle-favorite', item: FileObject): void
  (e: 'contextmenu', item: FileObject, event: MouseEvent): void
  (e: 'load-more'): void
}>()

const lastClickedKey = ref<string | null>(null)

const allSelected = computed(
  () => props.items.length > 0 && props.items.every(i => props.selectedKeys.has(i.key)),
)
const partialSelected = computed(
  () => !allSelected.value && props.items.some(i => props.selectedKeys.has(i.key)),
)

function toggleAll(checked: boolean) {
  if (checked) emit('select-all')
  else emit('clear-selection')
}

function displayName(item: FileObject): string {
  return keyToName(item.key)
}

function getIcon(item: FileObject): Component {
  if (item.isDir) return FolderOutline
  const cat = getFileCategory(item.key, item.contentType)
  const map: Record<string, Component> = {
    image: ImageOutline,
    video: VideocamOutline,
    audio: MusicalNotesOutline,
    document: DocumentOutline,
    code: DocumentOutline,
  }
  return map[cat] ?? DocumentOutline
}

function isImage(item: FileObject): boolean {
  return getFileCategory(item.key, item.contentType) === 'image'
}

function getThumbnailUrl(item: FileObject): string {
  return shareApi.getThumbnailUrl(props.accountId, props.bucket, item.key, 40)
}

function isFav(item: FileObject): boolean {
  return props.favoriteKeys?.has(`${props.accountId}:${props.bucket}:${item.key}`) ?? false
}

function handleRowClick(item: FileObject, event: MouseEvent) {
  if (event.shiftKey && lastClickedKey.value) {
    emit('range-select', lastClickedKey.value, item.key)
  } else if (event.ctrlKey || event.metaKey) {
    emit('toggle-select', item.key)
  } else {
    // 单击：仅选中（不导航，双击才导航）
    emit('clear-selection')
    emit('toggle-select', item.key)
  }
  lastClickedKey.value = item.key
}

function handleRowDblClick(item: FileObject) {
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
.file-list {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.file-list__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
  border-bottom: 1px solid rgba(128,128,128,0.1);
  flex-shrink: 0;
}

.file-list__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.1s;
  height: 44px;
  border-bottom: 1px solid rgba(128,128,128,0.05);
}

.file-list__row:hover { background: rgba(128,128,128,0.06); }
.file-list__row.selected { background: rgba(24, 160, 88, 0.08); }

.file-list__col { overflow: hidden; }

.file-list__col--name {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.file-list__col--size { width: 80px; flex-shrink: 0; font-size: 12px; }
.file-list__col--date { width: 140px; flex-shrink: 0; font-size: 12px; }
.file-list__col--actions {
  width: 120px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;           /* 从 2px 改为 6px，操作按钮间距更宽松 */
  padding-right: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

/* 行内按钮略加大点击区域 */
.file-list__col--actions .n-button {
  width: 24px;
  height: 24px;
}

.file-list__row:hover .file-list__col--actions,
.file-list__row.selected .file-list__col--actions { opacity: 1; }

.file-list__thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.file-list__icon { flex-shrink: 0; }

.file-list__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.file-list__row.dir .file-list__name { font-weight: 500; }

.file-list__load-more {
  padding: 12px;
  text-align: center;
}

.file-list__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
