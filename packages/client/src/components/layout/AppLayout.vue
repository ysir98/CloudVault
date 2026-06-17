<template>
  <div class="app-layout" :class="{ dark: uiStore.isDark }">
    <!-- 侧边栏 -->
    <Sidebar class="app-layout__sidebar" :class="{ collapsed: uiStore.sidebarCollapsed }" />

    <!-- 主区域 -->
    <div class="app-layout__main">
      <TopBar />
      <div class="app-layout__content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </div>

    <!-- 传输浮窗（右下角常驻） -->
    <TransferFloat />

    <!-- 文件预览 Modal -->
    <PreviewModal
      v-if="uiStore.previewFile"
      :file="uiStore.previewFile"
      @close="uiStore.closePreview"
    />

    <!-- 全局命令面板 Ctrl+K -->
    <CommandPalette
      v-if="uiStore.cmdPaletteVisible"
      @close="uiStore.closeCmdPalette"
    />
  </div>
</template>

<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import TopBar from './TopBar.vue'
import TransferFloat from './TransferFloat.vue'
import PreviewModal from '@/components/preview/PreviewModal.vue'
import CommandPalette from './CommandPalette.vue'
import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-color, #f5f5f5);
}

.app-layout.dark {
  --bg-color: #101014;
  --text-color: #e0e0e0;
}

.app-layout__sidebar {
  width: 240px;
  flex-shrink: 0;
  transition: width 0.2s ease;
  overflow: hidden;
}

.app-layout__sidebar.collapsed {
  width: 64px;
}

.app-layout__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.app-layout__content {
  flex: 1;
  overflow: hidden;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 移动端适配 */
@media (max-width: 768px) {
  .app-layout__sidebar {
    position: fixed;
    z-index: 100;
    height: 100vh;
    transform: translateX(0);
  }

  .app-layout__sidebar.collapsed {
    width: 0;
    transform: translateX(-100%);
  }
}
</style>
