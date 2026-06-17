<template>
  <div class="transfer-view">
    <div class="transfer-view__inner">
      <div class="transfer-view__header">
        <h2>传输列表</h2>
        <n-space>
          <n-button @click="transferStore.clearCompleted">清除已完成</n-button>
        </n-space>
      </div>

      <n-tabs v-model:value="activeTab" type="line">
        <n-tab-pane name="all" tab="全部" />
        <n-tab-pane name="running" :tab="`传输中 (${transferStore.runningTasks.length})`" />
        <n-tab-pane name="completed" :tab="`已完成 (${transferStore.completedTasks.length})`" />
        <n-tab-pane name="failed" :tab="`失败 (${transferStore.failedTasks.length})`" />
      </n-tabs>

      <n-empty v-if="!filteredTasks.length" description="暂无任务" />

      <div class="transfer-list">
        <div
          v-for="task in filteredTasks"
          :key="task.id"
          class="transfer-item"
        >
          <div class="transfer-item__icon">
            <n-icon
              :component="task.type === 'upload' ? CloudUploadOutline : CloudDownloadOutline"
              :color="statusColor[task.status]"
            />
          </div>

          <div class="transfer-item__body">
            <div class="transfer-item__name">{{ task.fileName ?? task.key }}</div>
            <div class="transfer-item__meta">
              <span>{{ task.bucket }}/{{ task.key }}</span>
              <span v-if="task.status === 'running'">
                · {{ formatSpeed(task.speed ?? 0) }}
                · 剩余 {{ formatEta(task.remainingSecs ?? 0) }}
              </span>
              <span v-if="task.error" class="transfer-item__error">· {{ task.error }}</span>
            </div>

            <n-progress
              v-if="task.status === 'running' || task.status === 'paused'"
              type="line"
              :percentage="task.totalSize ? Math.round((task.transferred / task.totalSize) * 100) : 0"
              :processing="task.status === 'running'"
              :status="statusProgressMap[task.status]"
              :height="4"
              style="margin-top: 4px"
            />
          </div>

          <div class="transfer-item__info">
            <div class="transfer-item__size">{{ formatSize(task.totalSize) }}</div>
            <n-tag :type="statusTagType[task.status]" size="small">
              {{ statusLabel[task.status] }}
            </n-tag>
          </div>

          <div class="transfer-item__actions">
            <n-button
              v-if="task.status === 'running'"
              size="small" text type="warning"
              @click="transferStore.pauseTask(task.id)"
            >
              暂停
            </n-button>
            <n-button
              v-if="task.status === 'paused'"
              size="small" text type="primary"
              @click="transferStore.resumeTask(task.id)"
            >
              继续
            </n-button>
            <n-button
              size="small" text type="error"
              @click="transferStore.cancelTask(task.id)"
            >
              {{ task.status === 'completed' ? '删除' : '取消' }}
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NTabs, NTabPane, NEmpty, NSpace, NButton, NIcon, NTag, NProgress,
} from 'naive-ui'
import { CloudUploadOutline, CloudDownloadOutline } from '@vicons/ionicons5'
import { useTransferStore } from '@/stores/transfer'
import { formatSize, formatSpeed, formatEta } from '@/utils/format'
import type { TransferTask } from '@/types'

const transferStore = useTransferStore()
const activeTab = ref<'all' | 'running' | 'completed' | 'failed'>('all')

onMounted(() => transferStore.loadTasks())

const filteredTasks = computed(() => {
  if (activeTab.value === 'all') return transferStore.tasks
  return transferStore.tasks.filter(t => {
    if (activeTab.value === 'running') return t.status === 'running' || t.status === 'pending' || t.status === 'paused'
    if (activeTab.value === 'completed') return t.status === 'completed'
    if (activeTab.value === 'failed') return t.status === 'failed'
    return true
  })
})

const statusLabel: Record<TransferTask['status'], string> = {
  pending: '等待中', running: '传输中', paused: '已暂停',
  completed: '已完成', failed: '失败', cancelled: '已取消',
}

const statusColor: Record<TransferTask['status'], string> = {
  pending: '#999', running: '#18a058', paused: '#f0a020',
  completed: '#18a058', failed: '#d03050', cancelled: '#999',
}

const statusTagType: Record<TransferTask['status'], 'success' | 'warning' | 'error' | 'default'> = {
  pending: 'default', running: 'success', paused: 'warning',
  completed: 'success', failed: 'error', cancelled: 'default',
}

const statusProgressMap: Record<string, 'default' | 'warning' | 'error' | 'success'> = {
  running: 'default', paused: 'warning', failed: 'error',
}
</script>

<style scoped>
.transfer-view { height: 100%; overflow-y: auto; }
.transfer-view__inner { padding: 24px; max-width: 1000px; margin: 0 auto; }

.transfer-view__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.transfer-view__header h2 { font-size: 22px; font-weight: 700; }

.transfer-list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }

.transfer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid rgba(128,128,128,0.1);
}

.transfer-item__body { flex: 1; min-width: 0; }

.transfer-item__name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-item__meta {
  font-size: 12px;
  opacity: 0.5;
  margin-top: 2px;
}

.transfer-item__error { color: #d03050; }

.transfer-item__info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.transfer-item__size { font-size: 12px; opacity: 0.6; }

.transfer-item__actions { display: flex; gap: 4px; flex-shrink: 0; }
</style>
