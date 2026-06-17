/**
 * stores/ui 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from '../../stores/ui'

beforeEach(() => {
  setActivePinia(createPinia())
  // 重置 localStorage
  localStorage.clear()
})

describe('主题切换', () => {
  it('初始主题读取 localStorage', () => {
    localStorage.setItem('theme', 'dark')
    setActivePinia(createPinia())
    const store = useUiStore()
    expect(store.isDark).toBe(true)
  })

  it('初始无 localStorage 时默认浅色', () => {
    const store = useUiStore()
    expect(store.isDark).toBe(false)
  })

  it('toggleTheme 切换深浅色', () => {
    const store = useUiStore()
    expect(store.isDark).toBe(false)
    store.toggleTheme()
    expect(store.isDark).toBe(true)
    store.toggleTheme()
    expect(store.isDark).toBe(false)
  })

  it('toggleTheme 持久化到 localStorage', () => {
    const store = useUiStore()
    store.toggleTheme()
    expect(localStorage.getItem('theme')).toBe('dark')
    store.toggleTheme()
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('深色主题时 theme 返回 darkTheme 对象（非 null）', () => {
    const store = useUiStore()
    store.isDark = true
    expect(store.theme).not.toBeNull()
  })

  it('浅色主题时 theme 返回 null', () => {
    const store = useUiStore()
    store.isDark = false
    expect(store.theme).toBeNull()
  })
})

describe('命令面板', () => {
  it('初始隐藏', () => {
    const store = useUiStore()
    expect(store.cmdPaletteVisible).toBe(false)
  })

  it('openCmdPalette 显示面板', () => {
    const store = useUiStore()
    store.openCmdPalette()
    expect(store.cmdPaletteVisible).toBe(true)
  })

  it('closeCmdPalette 隐藏面板', () => {
    const store = useUiStore()
    store.openCmdPalette()
    store.closeCmdPalette()
    expect(store.cmdPaletteVisible).toBe(false)
  })
})

describe('侧边栏', () => {
  it('初始展开（sidebarCollapsed = false）', () => {
    const store = useUiStore()
    expect(store.sidebarCollapsed).toBe(false)
  })

  it('toggleSidebar 切换状态', () => {
    const store = useUiStore()
    store.toggleSidebar()
    expect(store.sidebarCollapsed).toBe(true)
    store.toggleSidebar()
    expect(store.sidebarCollapsed).toBe(false)
  })
})

describe('文件预览', () => {
  const mockFile = {
    accountId: 'acc-1',
    bucket: 'my-bucket',
    key: 'photo.jpg',
    contentType: 'image/jpeg',
    size: 1024000,
  }

  it('初始无预览文件', () => {
    const store = useUiStore()
    expect(store.previewFile).toBeNull()
  })

  it('openPreview 设置预览文件', () => {
    const store = useUiStore()
    store.openPreview(mockFile)
    expect(store.previewFile).toEqual(mockFile)
  })

  it('closePreview 清除预览文件', () => {
    const store = useUiStore()
    store.openPreview(mockFile)
    store.closePreview()
    expect(store.previewFile).toBeNull()
  })

  it('可以切换预览不同文件', () => {
    const store = useUiStore()
    store.openPreview(mockFile)
    const another = { ...mockFile, key: 'video.mp4' }
    store.openPreview(another)
    expect(store.previewFile?.key).toBe('video.mp4')
  })
})

describe('传输浮窗', () => {
  it('初始收起', () => {
    const store = useUiStore()
    expect(store.transferPanelExpanded).toBe(false)
  })

  it('toggleTransferPanel 切换', () => {
    const store = useUiStore()
    store.toggleTransferPanel()
    expect(store.transferPanelExpanded).toBe(true)
    store.toggleTransferPanel()
    expect(store.transferPanelExpanded).toBe(false)
  })
})
