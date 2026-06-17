<template>
  <n-layout-sider
    :collapsed="collapsed"
    :collapsed-width="64"
    :width="240"
    show-trigger="arrow-circle"
    collapse-mode="width"
    bordered
    @collapse="uiStore.sidebarCollapsed = true"
    @expand="uiStore.sidebarCollapsed = false"
  >
    <!-- Logo -->
    <div class="sidebar-logo" @click="router.push('/dashboard')">
      <div class="sidebar-logo__icon">☁</div>
      <transition name="fade-x">
        <span v-if="!collapsed" class="sidebar-logo__text">CloudVault</span>
      </transition>
    </div>

    <!-- 导航菜单 -->
    <n-menu
      :collapsed="collapsed"
      :collapsed-width="64"
      :collapsed-icon-size="20"
      :options="menuOptions"
      :value="activeKey"
      @update:value="handleMenuSelect"
    />

    <!-- 账户列表 -->
    <n-divider v-if="!collapsed" style="margin: 8px 0" />
    <div v-if="!collapsed" class="sidebar-accounts">
      <div class="sidebar-section-title">存储账户</div>

      <n-scrollbar style="max-height: 400px">
        <div
          v-for="account in accountStore.sortedAccounts"
          :key="account.id"
          class="sidebar-account"
        >
          <div
            class="sidebar-account__header"
            @click="toggleAccount(account.id)"
          >
            <n-icon :component="CloudOutline" />
            <span class="sidebar-account__name">{{ account.name }}</span>
            <n-icon
              :component="expanded[account.id] ? ChevronDown : ChevronForward"
              size="14"
            />
          </div>

          <transition name="slide-down">
            <div v-if="expanded[account.id]" class="sidebar-account__buckets">
              <div
                v-for="bucket in accountStore.getBuckets(account.id)"
                :key="bucket.name"
                class="sidebar-bucket"
                :class="{ active: isActiveBucket(account.id, bucket.name) }"
                @click="navigateToBucket(account.id, bucket.name)"
              >
                <n-icon :component="FolderOutline" size="14" />
                <span>{{ bucket.name }}</span>
              </div>
              <div
                v-if="!accountStore.getBuckets(account.id).length"
                class="sidebar-bucket sidebar-bucket--loading"
                @click="loadBuckets(account.id)"
              >
                <n-icon :component="RefreshOutline" size="14" />
                <span>加载 Bucket</span>
              </div>
            </div>
          </transition>
        </div>
      </n-scrollbar>

      <!-- 添加账户 -->
      <div class="sidebar-add-account" @click="emit('add-account')">
        <n-icon :component="AddCircleOutline" />
        <span>添加账户</span>
      </div>
    </div>
  </n-layout-sider>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NLayoutSider, NMenu, NIcon, NDivider, NScrollbar,
  type MenuOption,
} from 'naive-ui'
import {
  HomeOutline, StarOutline, TrashOutline, CloudUploadOutline,
  SettingsOutline, CloudOutline, FolderOutline, AddCircleOutline,
  RefreshOutline, ChevronDownOutline as ChevronDown,
  ChevronForwardOutline as ChevronForward,
} from '@vicons/ionicons5'
import { useUiStore } from '@/stores/ui'
import { useAccountStore } from '@/stores/accounts'
import { useFileStore } from '@/stores/files'

const emit = defineEmits<{ (e: 'add-account'): void }>()

const router = useRouter()
const route = useRoute()
const uiStore = useUiStore()
const accountStore = useAccountStore()
const fileStore = useFileStore()

const collapsed = computed(() => uiStore.sidebarCollapsed)

const expanded = ref<Record<string, boolean>>({})

function toggleAccount(id: string) {
  expanded.value[id] = !expanded.value[id]
  if (expanded.value[id] && !accountStore.getBuckets(id).length) {
    loadBuckets(id)
  }
}

async function loadBuckets(accountId: string) {
  await accountStore.loadBuckets(accountId)
}

function isActiveBucket(accountId: string, bucket: string) {
  return (
    route.name === 'Explorer' &&
    route.params.accountId === accountId &&
    route.params.bucket === bucket
  )
}

function navigateToBucket(accountId: string, bucket: string) {
  router.push({
    name: 'Explorer',
    params: { accountId, bucket },
    query: { prefix: '' },
  })
}

const activeKey = computed(() => {
  const name = route.name as string
  if (name === 'Explorer') return `explorer-${route.params.accountId}-${route.params.bucket}`
  return name?.toLowerCase() ?? ''
})

const menuOptions = computed<MenuOption[]>(() => [
  {
    label: '概览',
    key: 'dashboard',
    icon: () => h(NIcon, null, { default: () => h(HomeOutline) }),
  },
  {
    label: '收藏夹',
    key: 'favorites',
    icon: () => h(NIcon, null, { default: () => h(StarOutline) }),
  },
  {
    label: '传输列表',
    key: 'transfer',
    icon: () => h(NIcon, null, { default: () => h(CloudUploadOutline) }),
  },
  {
    label: '设置',
    key: 'settings',
    icon: () => h(NIcon, null, { default: () => h(SettingsOutline) }),
  },
])

function handleMenuSelect(key: string) {
  router.push(`/${key}`)
}
</script>

<style scoped>
.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  cursor: pointer;
  user-select: none;
}

.sidebar-logo__icon {
  font-size: 24px;
  line-height: 1;
}

.sidebar-logo__text {
  font-size: 18px;
  font-weight: 700;
  color: #18a058;
  white-space: nowrap;
}

.sidebar-accounts {
  padding: 0 8px 80px;
}

.sidebar-section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  opacity: 0.5;
  padding: 4px 8px;
  text-transform: uppercase;
}

.sidebar-account {
  margin-bottom: 4px;
}

.sidebar-account__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}

.sidebar-account__header:hover { background: rgba(128,128,128,0.1); }

.sidebar-account__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-account__buckets {
  padding-left: 24px;
}

.sidebar-bucket {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}

.sidebar-bucket:hover, .sidebar-bucket.active {
  background: rgba(24, 160, 88, 0.1);
  color: #18a058;
}

.sidebar-bucket--loading { opacity: 0.6; }

.sidebar-add-account {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #18a058;
  margin-top: 8px;
  transition: background 0.15s;
}

.sidebar-add-account:hover { background: rgba(24, 160, 88, 0.1); }

/* 过渡动画 */
.fade-x-enter-active, .fade-x-leave-active { transition: opacity 0.15s, transform 0.15s; }
.fade-x-enter-from, .fade-x-leave-to { opacity: 0; transform: translateX(-8px); }

.slide-down-enter-active, .slide-down-leave-active { transition: all 0.2s ease; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { max-height: 0; opacity: 0; }
.slide-down-enter-to, .slide-down-leave-from { max-height: 500px; opacity: 1; }
</style>
