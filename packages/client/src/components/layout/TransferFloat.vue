<template>
  <div class="transfer-float" :class="{ expanded: uiStore.transferPanelExpanded }">
    <!-- 迷你浮窗 header -->
    <div class="transfer-float__header" @click="uiStore.toggleTransferPanel">
      <div class="transfer-float__icon">
        <n-spin v-if="running.length" size="small" />
        <n-icon v-else :component="CloudUploadOutline" />
      </div>
      <div class="transfer-float__summary">
        <span v-if="running.length">
          传输中 {{ running.length }} 个 · {{ totalProgress }}%
        </span>
        <span v-else-if="transferStore.tasks.length">
          {{ transferStore.tasks.length }} 个任务
        </span>
        <span v-else>传输队列</span>
      </div>
      <!-- 总进度条 -->
      <div v-if="running.length" class="transfer-float__progress-bar">
        <div
          class="transfer-float__progress-fill"
          :style="{ width: `${totalProgress}%` }"
        />
      </div>
      <n-icon :component="expanded ? ChevronDown : ChevronUp" size="16" />
    </div>

    <!-- 展开后的任务列表 -->
    <transition name="expand">
      <div v-if="uiStore.transferPanelExpanded" class="transfer-float__list">
        <div class="transfer-float__list-header">
          <span class="transfer-float__list-title">传输任务</span>
          <div class="transfer-float__list-actions">
            <n-button size="tiny" text @click.stop="transferStore.clearCompleted">
              清除已完成
            </n-button>
            <n-button size="tiny" text @click.stop="router.push('/transfer')">
              查看全部
            </n-button>
          </div>
        </div>

        <n-scrollbar style="max-height: 280px">
          <div v-if="!recentTasks.length" class="transfer-float__empty">
            暂无传输任务
          </div>
          <div
            v-for="task in recentTasks"
            :key="task.id"
            class="transfer-task-item"
          >
            <div class="transfer-task-item__info">
              <span class="transfer-task-item__name" :title="task.fileName">
                {{ task.fileName }}
              </span>
              <span class="transfer-task-item__status">
                <template v-if="task.status === 'running'">
                  {{ formatSpeed(task.speed ?? 0) }} · 剩余 {{ formatEta(task.remainingSecs ?? 0) }}
                </template>
                <template v-else>{{ statusLabel[task.status] }}</template>
              </span>
            </div>
            <n-progress
              v-if="task.status === 'running' || task.status === 'paused'"
              type="line"
              :percentage="task.totalSize ? Math.round((task.transferred / task.totalSize) * 100) : 0"
              :processing="task.status === 'running'"
              :status="task.status === 'paused' ? 'warning' : 'default'"
              :height="4"
              :show-indicator="false"
            />
            <div class="transfer-task-item__actions">
              <n-button
                size="tiny"
                text
                :type="task.status === 'running' ? 'warning' : 'primary'"
                @click.stop="toggleTask(task)"
                v-if="task.status === 'running' || task.status === 'paused'"
              >
                {{ task.status === 'running' ? '暂停' : '继续' }}
              </n-button>
              <n-button
                size="tiny"
                text
                type="error"
                @click.stop="transferStore.cancelTask(task.id)"
              >
                取消
              </n-button>
            </div>
          </div>
        </n-scrollbar>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon, NSpin, NScrollbar, NButton, NProgress } from 'naive-ui'
import {
  CloudUploadOutline,
  ChevronDownOutline as ChevronDown,
  ChevronUpOutline as ChevronUp,
} from '@vicons/ionicons5'
import { useUiStore } from '@/stores/ui'
import { useTransferStore } from '@/stores/transfer'
import { formatSpeed, formatEta } from '@/utils/format'
import type { TransferTask } from '@/types'

const router = useRouter()
const uiStore = useUiStore()
const transferStore = useTransferStore()

const expanded = computed(() => uiStore.transferPanelExpanded)
const running = computed(() => transferStore.runningTasks)
const totalProgress = computed(() => transferStore.totalProgress)

const recentTasks = computed(() =>
  transferStore.tasks.slice(0, 20),
)

const statusLabel: Record<TransferTask['status'], string> = {
  pending: '等待中',
  running: '传输中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

async function toggleTask(task: TransferTask) {
  if (task.status === 'running') {
    await transferStore.pauseTask(task.id)
  } else {
    await transferStore.resumeTask(task.id)
  }
}
</script>

<style scoped>
.transfer-float {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 300px;
  background: var(--bg, #fff);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.15);
  border: 1px solid rgba(128,128,128,0.15);
  z-index: 500;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.transfer-float:hover {
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}

.transfer-float__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
}

.transfer-float__icon { flex-shrink: 0; }

.transfer-float__summary {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-float__progress-bar {
  height: 4px;
  background: rgba(128,128,128,0.2);
  border-radius: 2px;
  overflow: hidden;
  width: 60px;
  flex-shrink: 0;
}

.transfer-float__progress-fill {
  height: 100%;
  background: #18a058;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.transfer-float__list {
  border-top: 1px solid rgba(128,128,128,0.1);
}

.transfer-float__list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 4px;
}

.transfer-float__list-title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
}

.transfer-float__list-actions {
  display: flex;
  gap: 8px;
}

.transfer-float__empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
}

.transfer-task-item {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(128,128,128,0.06);
}

.transfer-task-item__info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.transfer-task-item__name {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.transfer-task-item__status {
  font-size: 11px;
  opacity: 0.5;
  flex-shrink: 0;
}

.transfer-task-item__actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
}

/* 展开/收起动画 */
.expand-enter-active, .expand-leave-active {
  transition: max-height 0.25s ease, opacity 0.2s;
  overflow: hidden;
}
.expand-enter-from, .expand-leave-to { max-height: 0; opacity: 0; }
.expand-enter-to, .expand-leave-from { max-height: 400px; opacity: 1; }

@media (max-width: 480px) {
  .transfer-float { width: calc(100vw - 32px); right: 16px; bottom: 16px; }
}
</style>
