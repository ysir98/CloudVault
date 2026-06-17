<template>
  <n-config-provider
    :theme="uiStore.theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-message-provider>
            <AppContent />
          </n-message-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { defineComponent, h } from 'vue'
import {
  NConfigProvider, NLoadingBarProvider, NDialogProvider,
  NNotificationProvider, NMessageProvider,
  zhCN, dateZhCN,
  type GlobalThemeOverrides,
} from 'naive-ui'
import { useUiStore } from '@/stores/ui'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useRouter } from 'vue-router'
import { onMounted } from 'vue'
import { useAccountStore } from '@/stores/accounts'
import { useFileStore } from '@/stores/files'
import { useTransferStore } from '@/stores/transfer'
import hotkeys from 'hotkeys-js'

const uiStore = useUiStore()

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#18a058',
    primaryColorHover: '#36ad6a',
    primaryColorPressed: '#0c7a43',
    primaryColorSuppl: '#36ad6a',
  },
}

// 内层组件，可以访问 Naive UI 提供的 API
const AppContent = defineComponent({
  name: 'AppContent',
  setup() {
    const router = useRouter()
    const accountStore = useAccountStore()
    const fileStore = useFileStore()
    const transferStore = useTransferStore()
    const uiStore = useUiStore()

    onMounted(async () => {
      await Promise.all([
        accountStore.loadProviders(),
        accountStore.loadAccounts(),
        fileStore.loadTags(),
        fileStore.loadFavorites(),
        transferStore.loadTasks(),
      ])
    })

    // 全局快捷键
    hotkeys('ctrl+k, command+k', (e) => {
      e.preventDefault()
      uiStore.openCmdPalette()
    })

    hotkeys('ctrl+shift+d, command+shift+d', (e) => {
      e.preventDefault()
      uiStore.toggleTheme()
    })

    hotkeys('escape', () => {
      uiStore.closeCmdPalette()
      uiStore.closePreview()
    })

    return () => h(AppLayout)
  },
})
</script>
