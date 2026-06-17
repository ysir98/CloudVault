<template>
  <div class="topbar">
    <!-- 移动端菜单按钮 -->
    <n-button
      class="topbar__menu-btn"
      text
      @click="uiStore.toggleSidebar"
    >
      <template #icon><n-icon :component="MenuOutline" /></template>
    </n-button>

    <!-- 面包屑 / 路径 -->
    <div class="topbar__breadcrumb">
      <template v-if="fileStore.currentBucket">
        <n-breadcrumb>
          <n-breadcrumb-item @click="navigateUp('')">
            {{ currentAccountName }}
          </n-breadcrumb-item>
          <n-breadcrumb-item
            v-for="(crumb, i) in fileStore.breadcrumbs"
            :key="crumb.prefix"
            @click="navigateUp(crumb.prefix)"
            :clickable="i < fileStore.breadcrumbs.length - 1"
          >
            {{ crumb.label }}
          </n-breadcrumb-item>
        </n-breadcrumb>
      </template>
      <span v-else class="topbar__title">{{ route.meta.title }}</span>
    </div>

    <!-- 工具栏右侧 -->
    <div class="topbar__actions">
      <!-- 快捷搜索 -->
      <n-button text @click="uiStore.openCmdPalette">
        <template #icon><n-icon :component="SearchOutline" /></template>
        <span class="topbar__search-hint">搜索 <kbd>Ctrl+K</kbd></span>
      </n-button>

      <!-- 刷新 -->
      <n-button
        v-if="fileStore.currentBucket"
        text
        :loading="fileStore.loading"
        @click="fileStore.refresh"
      >
        <template #icon><n-icon :component="RefreshOutline" /></template>
      </n-button>

      <!-- 主题切换 -->
      <n-button text @click="uiStore.toggleTheme">
        <template #icon>
          <n-icon :component="uiStore.isDark ? SunnyOutline : MoonOutline" />
        </template>
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NIcon, NBreadcrumb, NBreadcrumbItem } from 'naive-ui'
import {
  MenuOutline, SearchOutline, RefreshOutline,
  SunnyOutline, MoonOutline,
} from '@vicons/ionicons5'
import { useUiStore } from '@/stores/ui'
import { useFileStore } from '@/stores/files'
import { useAccountStore } from '@/stores/accounts'

const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const fileStore = useFileStore()
const accountStore = useAccountStore()

const currentAccountName = computed(() => {
  const account = accountStore.getAccount(fileStore.currentAccountId)
  return account?.name ?? fileStore.currentAccountId
})

function navigateUp(prefix: string) {
  router.push({
    name: 'Explorer',
    params: {
      accountId: fileStore.currentAccountId,
      bucket: fileStore.currentBucket,
    },
    query: { prefix },
  })
}
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(128,128,128,0.15);
  flex-shrink: 0;
}

.topbar__menu-btn {
  display: none;
}

.topbar__breadcrumb {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.topbar__title {
  font-weight: 600;
  font-size: 15px;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.topbar__search-hint {
  font-size: 13px;
  opacity: 0.7;
}

.topbar__search-hint kbd {
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid rgba(128,128,128,0.3);
  background: rgba(128,128,128,0.1);
  font-family: inherit;
}

@media (max-width: 768px) {
  .topbar__menu-btn { display: flex; }
  .topbar__search-hint { display: none; }
}
</style>
