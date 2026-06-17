/**
 * UI 全局状态 Store
 *
 * 管理主题、命令面板、快捷键、通知等全局 UI 状态。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { darkTheme, type GlobalTheme } from 'naive-ui'

export const useUiStore = defineStore('ui', () => {
  // 主题（持久化到 localStorage）
  const isDark = ref(localStorage.getItem('theme') === 'dark')

  const theme = computed<GlobalTheme | null>(() => (isDark.value ? darkTheme : null))

  function toggleTheme() {
    isDark.value = !isDark.value
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }

  // 命令面板（Ctrl+K）
  const cmdPaletteVisible = ref(false)

  function openCmdPalette() { cmdPaletteVisible.value = true }
  function closeCmdPalette() { cmdPaletteVisible.value = false }

  // 侧边栏折叠状态
  const sidebarCollapsed = ref(false)

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  // 预览 Modal
  const previewFile = ref<{
    accountId: string; bucket: string; key: string
    contentType?: string; size?: number
  } | null>(null)

  function openPreview(file: NonNullable<typeof previewFile.value>) {
    previewFile.value = file
  }

  function closePreview() {
    previewFile.value = null
  }

  // 传输浮窗展开状态
  const transferPanelExpanded = ref(false)

  function toggleTransferPanel() {
    transferPanelExpanded.value = !transferPanelExpanded.value
  }

  // 全局加载态（用于路由切换等）
  const globalLoading = ref(false)

  return {
    isDark, theme,
    toggleTheme,
    cmdPaletteVisible, openCmdPalette, closeCmdPalette,
    sidebarCollapsed, toggleSidebar,
    previewFile, openPreview, closePreview,
    transferPanelExpanded, toggleTransferPanel,
    globalLoading,
  }
}, {
  persist: false,  // 手动处理持久化（避免持久化函数引用）
})
