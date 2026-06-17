<template>
  <div class="file-toolbar">
    <!-- 普通操作行（始终显示） -->
    <div class="file-toolbar__left">
      <n-upload
        multiple
        directory-dnd
        :show-file-list="false"
        @change="handleUploadChange"
      >
        <n-button type="primary" size="small">
          <template #icon><n-icon :component="CloudUploadOutline" /></template>
          上传文件
        </n-button>
      </n-upload>

      <n-button size="small" @click="emit('mkdir')">
        <template #icon><n-icon :component="FolderOpenOutline" /></template>
        新建文件夹
      </n-button>
    </div>

    <!-- 批量操作区（选中时浮出在工具栏右侧独占一行） -->
    <transition name="toolbar-slide">
      <div v-if="selectedCount > 0" class="file-toolbar__batch">
        <span class="file-toolbar__selected-hint">已选 {{ selectedCount }} 项</span>

        <n-button size="small" @click="emit('download-selected')">
          <template #icon><n-icon :component="DownloadOutline" /></template>
          下载
        </n-button>

        <n-button size="small" @click="emit('copy')">
          <template #icon><n-icon :component="CopyOutline" /></template>
          复制
        </n-button>

        <n-button size="small" @click="emit('move')">
          <template #icon><n-icon :component="SwapHorizontalOutline" /></template>
          移动
        </n-button>

        <n-button size="small" type="error" @click="emit('delete')">
          <template #icon><n-icon :component="TrashOutline" /></template>
          删除
        </n-button>

        <n-button size="small" quaternary @click="emit('clear-selection')">
          取消
        </n-button>
      </div>
    </transition>

    <!-- 右侧：排序 + 视图 -->
    <div class="file-toolbar__right">
      <n-dropdown :options="sortOptions" @select="handleSort">
        <n-button size="small" text>
          <template #icon><n-icon :component="SwapVerticalOutline" /></template>
          {{ sortLabel }}
        </n-button>
      </n-dropdown>

      <n-button-group size="small">
        <n-button
          :type="viewMode === 'list' ? 'primary' : 'default'"
          @click="emit('view-mode', 'list')"
        >
          <template #icon><n-icon :component="ListOutline" /></template>
        </n-button>
        <n-button
          :type="viewMode === 'grid' ? 'primary' : 'default'"
          @click="emit('view-mode', 'grid')"
        >
          <template #icon><n-icon :component="GridOutline" /></template>
        </n-button>
      </n-button-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NButtonGroup, NUpload, NIcon, NDropdown, type UploadFileInfo } from 'naive-ui'
import {
  CloudUploadOutline, FolderOpenOutline, TrashOutline,
  CopyOutline, ListOutline, GridOutline, SwapVerticalOutline,
  SwapHorizontalOutline, DownloadOutline,
} from '@vicons/ionicons5'
import type { ViewMode, SortField, SortOrder } from '@/types'

const props = defineProps<{
  selectedCount: number
  viewMode: ViewMode
  sortField: SortField
  sortOrder: SortOrder
}>()

const emit = defineEmits<{
  (e: 'upload', files: File[]): void
  (e: 'mkdir'): void
  (e: 'delete'): void
  (e: 'copy'): void
  (e: 'move'): void
  (e: 'download-selected'): void
  (e: 'clear-selection'): void
  (e: 'view-mode', mode: ViewMode): void
  (e: 'sort', field: SortField, order: SortOrder): void
}>()

const sortOptions = [
  { label: '名称 A-Z', key: 'name:asc' },
  { label: '名称 Z-A', key: 'name:desc' },
  { label: '大小 升序', key: 'size:asc' },
  { label: '大小 降序', key: 'size:desc' },
  { label: '修改时间 升序', key: 'lastModified:asc' },
  { label: '修改时间 降序', key: 'lastModified:desc' },
]

const sortLabel = computed(() => {
  const fieldLabel: Record<SortField, string> = {
    name: '名称', size: '大小', lastModified: '修改时间', type: '类型',
  }
  return `${fieldLabel[props.sortField]} ${props.sortOrder === 'asc' ? '↑' : '↓'}`
})

function handleSort(key: string) {
  const [field, order] = key.split(':') as [SortField, SortOrder]
  emit('sort', field, order)
}

function handleUploadChange({ fileList }: { fileList: UploadFileInfo[] }) {
  const files = fileList.filter(f => f.file).map(f => f.file!)
  if (files.length) emit('upload', files)
}
</script>

<style scoped>
.file-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(128,128,128,0.1);
  flex-shrink: 0;
  min-height: 48px;
}

.file-toolbar__left {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 批量操作区：有选中时插入到左侧和右侧之间，自然占满剩余空间 */
.file-toolbar__batch {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 0 4px;
  border-left: 1px solid rgba(128,128,128,0.15);
  padding-left: 12px;
}

.file-toolbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.file-toolbar__selected-hint {
  font-size: 13px;
  font-weight: 600;
  color: #18a058;
  white-space: nowrap;
}

/* 批量操作滑入动画 */
.toolbar-slide-enter-active { transition: opacity 0.15s, transform 0.15s; }
.toolbar-slide-leave-active { transition: opacity 0.1s, transform 0.1s; }
.toolbar-slide-enter-from { opacity: 0; transform: translateX(-8px); }
.toolbar-slide-leave-to  { opacity: 0; transform: translateX(-8px); }
</style>
