<template>
  <div class="trash-view">
    <div class="trash-view__inner">
      <div class="trash-view__header">
        <h2>回收站</h2>
        <n-space>
          <n-button
            :disabled="!selectedIds.size"
            @click="restoreSelected"
          >
            恢复选中
          </n-button>
          <n-button
            type="error"
            :disabled="!items.length"
            @click="confirmEmpty"
          >
            清空回收站
          </n-button>
        </n-space>
      </div>

      <n-spin :show="loading">
        <n-empty v-if="!items.length && !loading" description="回收站为空" />

        <n-data-table
          v-if="items.length"
          :columns="columns"
          :data="items"
          :row-key="(row) => row.id"
          :checked-row-keys="Array.from(selectedIds)"
          @update:checked-row-keys="selectedIds = new Set($event as string[])"
          size="small"
        />
      </n-spin>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue'
import { useRoute } from 'vue-router'
import {
  NDataTable, NSpin, NEmpty, NButton, NSpace, NTag, useDialog, useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { fileApi } from '@/api/files'
import { formatSize, formatDate, keyToName } from '@/utils/format'
import type { TrashItem } from '@/types'

const route = useRoute()
const dialog = useDialog()
const message = useMessage()

const accountId = computed(() => route.params.accountId as string)
const items = ref<TrashItem[]>([])
const loading = ref(false)
const selectedIds = ref<Set<string>>(new Set())

const columns: DataTableColumns<TrashItem> = [
  { type: 'selection' },
  {
    title: '文件名',
    key: 'key',
    render: (row) => keyToName(row.originalKey),
  },
  { title: '原始路径', key: 'originalKey', ellipsis: true },
  { title: '所在 Bucket', key: 'bucket' },
  {
    title: '大小',
    key: 'size',
    render: (row) => row.size ? formatSize(row.size) : '—',
    width: 80,
  },
  {
    title: '删除时间',
    key: 'deletedAt',
    render: (row) => formatDate(row.deletedAt),
    width: 150,
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    render: (row) => h(NSpace, null, {
      default: () => [
        h(NButton, {
          size: 'tiny',
          onClick: () => restoreOne(row.id),
        }, { default: () => '恢复' }),
        h(NButton, {
          size: 'tiny', type: 'error',
          onClick: () => deleteOne(row.id),
        }, { default: () => '彻底删除' }),
      ],
    }),
  },
]

async function load() {
  loading.value = true
  try {
    items.value = await fileApi.listTrash(accountId.value)
  } finally {
    loading.value = false
  }
}

async function restoreOne(id: string) {
  await fileApi.restoreFromTrash(accountId.value, [id])
  await load()
  message.success('恢复成功')
}

async function restoreSelected() {
  await fileApi.restoreFromTrash(accountId.value, Array.from(selectedIds.value))
  selectedIds.value.clear()
  await load()
  message.success('已恢复')
}

async function deleteOne(id: string) {
  dialog.warning({
    title: '彻底删除',
    content: '彻底删除后无法恢复，确认吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await fileApi.emptyTrash(accountId.value, [id])
      await load()
    },
  })
}

function confirmEmpty() {
  dialog.warning({
    title: '清空回收站',
    content: `确认彻底删除回收站中所有 ${items.value.length} 个文件？此操作不可撤销。`,
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      await fileApi.emptyTrash(accountId.value)
      await load()
      message.success('回收站已清空')
    },
  })
}

onMounted(load)
</script>

<style scoped>
.trash-view { height: 100%; overflow-y: auto; }
.trash-view__inner { padding: 24px; max-width: 1000px; margin: 0 auto; }

.trash-view__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.trash-view__header h2 { font-size: 22px; font-weight: 700; }
</style>
