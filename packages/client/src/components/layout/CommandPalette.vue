<template>
  <div class="cmd-overlay" @click.self="emit('close')">
    <div class="cmd-palette">
      <n-input
        ref="inputRef"
        v-model:value="query"
        placeholder="搜索文件、跳转账户... (Esc 关闭)"
        clearable
        size="large"
        :loading="searching"
        @input="handleInput"
      >
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>

      <div class="cmd-results" v-if="results.length || quickActions.length">
        <!-- 快捷操作 -->
        <div v-if="quickActions.length && !query" class="cmd-group">
          <div class="cmd-group__title">快捷操作</div>
          <div
            v-for="action in quickActions"
            :key="action.key"
            class="cmd-item"
            :class="{ active: activeIdx === getIdx(action.key) }"
            @click="action.handler"
            @mouseenter="activeIdx = getIdx(action.key)"
          >
            <n-icon :component="action.icon" class="cmd-item__icon" />
            <div class="cmd-item__content">
              <span class="cmd-item__label">{{ action.label }}</span>
              <span v-if="action.desc" class="cmd-item__desc">{{ action.desc }}</span>
            </div>
            <kbd v-if="action.shortcut" class="cmd-item__kbd">{{ action.shortcut }}</kbd>
          </div>
        </div>

        <!-- 搜索结果 -->
        <div v-if="results.length" class="cmd-group">
          <div class="cmd-group__title">文件搜索结果</div>
          <div
            v-for="(item, i) in results.slice(0, 8)"
            :key="`${item.bucket}:${item.key}`"
            class="cmd-item"
            :class="{ active: activeIdx === i }"
            @click="openFile(item)"
            @mouseenter="activeIdx = i"
          >
            <n-icon :component="DocumentOutline" class="cmd-item__icon" />
            <div class="cmd-item__content">
              <span class="cmd-item__label">{{ keyToName(item.key) }}</span>
              <span class="cmd-item__desc">{{ item.bucket }}/{{ item.key }}</span>
            </div>
            <span class="cmd-item__size">{{ formatSize(item.size) }}</span>
          </div>
        </div>

        <!-- 无结果 -->
        <div v-if="query && !results.length && !searching" class="cmd-empty">
          未找到 "{{ query }}" 相关文件
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { NInput, NIcon } from 'naive-ui'
import {
  SearchOutline, DocumentOutline, SettingsOutline,
  StarOutline, CloudUploadOutline, MoonOutline,
} from '@vicons/ionicons5'
import { fileApi } from '@/api/files'
import { useAccountStore } from '@/stores/accounts'
import { useUiStore } from '@/stores/ui'
import { formatSize, keyToName } from '@/utils/format'
import type { FileObject } from '@/types'
import type { Component } from 'vue'

const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const accountStore = useAccountStore()
const uiStore = useUiStore()

const query = ref('')
const results = ref<FileObject[]>([])
const searching = ref(false)
const activeIdx = ref(0)
const inputRef = ref()

let searchTimer: ReturnType<typeof setTimeout>

interface QuickAction {
  key: string
  label: string
  desc?: string
  icon: Component
  shortcut?: string
  handler: () => void
}

const quickActions = computed<QuickAction[]>(() => [
  {
    key: 'toggle-theme',
    label: '切换深色/浅色主题',
    icon: MoonOutline,
    shortcut: 'Ctrl+Shift+D',
    handler: () => { uiStore.toggleTheme(); emit('close') },
  },
  {
    key: 'goto-settings',
    label: '打开设置',
    icon: SettingsOutline,
    handler: () => { router.push('/settings'); emit('close') },
  },
  {
    key: 'goto-favorites',
    label: '打开收藏夹',
    icon: StarOutline,
    handler: () => { router.push('/favorites'); emit('close') },
  },
  {
    key: 'goto-transfer',
    label: '打开传输列表',
    icon: CloudUploadOutline,
    handler: () => { router.push('/transfer'); emit('close') },
  },
])

function getIdx(key: string) {
  return quickActions.value.findIndex(a => a.key === key)
}

async function handleInput() {
  clearTimeout(searchTimer)
  if (!query.value.trim()) {
    results.value = []
    return
  }

  searching.value = true
  searchTimer = setTimeout(async () => {
    try {
      const accountIds = accountStore.accounts.map(a => a.id)
      const allResults: FileObject[] = []

      for (const accountId of accountIds.slice(0, 3)) {
        const res = await fileApi.search(accountId, { q: query.value })
        allResults.push(...res.map(r => ({ ...r, accountId })))
        if (allResults.length >= 20) break
      }

      results.value = allResults.slice(0, 20)
    } finally {
      searching.value = false
    }
  }, 300)
}

function openFile(item: FileObject) {
  if (!item.accountId) return
  router.push({
    name: 'Explorer',
    params: { accountId: item.accountId, bucket: item.bucket! },
    query: { prefix: item.key.substring(0, item.key.lastIndexOf('/') + 1) },
  })
  emit('close')
}

onMounted(() => {
  inputRef.value?.focus()

  // 方向键导航
  document.addEventListener('keydown', handleKeydown)
})

function handleKeydown(e: KeyboardEvent) {
  const total = (query.value ? results.value.length : quickActions.value.length)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = (activeIdx.value + 1) % total
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = (activeIdx.value - 1 + total) % total
  } else if (e.key === 'Enter') {
    if (query.value && results.value[activeIdx.value]) {
      openFile(results.value[activeIdx.value])
    } else {
      quickActions.value[activeIdx.value]?.handler()
    }
  }
}

// 组件卸载时移除事件监听
import { onUnmounted } from 'vue'
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.cmd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  backdrop-filter: blur(4px);
}

.cmd-palette {
  width: 600px;
  max-width: 90vw;
  background: var(--bg, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  overflow: hidden;
}

.dark .cmd-palette { --bg: #1e1e2e; }

.cmd-results {
  max-height: 400px;
  overflow-y: auto;
  padding: 4px 0 8px;
}

.cmd-group { padding: 4px 0; }

.cmd-group__title {
  padding: 4px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
}

.cmd-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s;
}

.cmd-item.active, .cmd-item:hover {
  background: rgba(24, 160, 88, 0.1);
}

.cmd-item__icon { flex-shrink: 0; opacity: 0.7; }

.cmd-item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cmd-item__label { font-size: 14px; font-weight: 500; }

.cmd-item__desc {
  font-size: 12px;
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cmd-item__size { font-size: 12px; opacity: 0.5; flex-shrink: 0; }

.cmd-item__kbd {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(128,128,128,0.3);
  background: rgba(128,128,128,0.1);
  font-family: inherit;
  flex-shrink: 0;
}

.cmd-empty {
  padding: 24px 16px;
  text-align: center;
  opacity: 0.5;
  font-size: 14px;
}
</style>
