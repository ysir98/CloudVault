import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import App from './App.vue'
import hotkeys from 'hotkeys-js'

// 字体（vfonts CSS 直接在包根目录，无 lib/ 子目录）
import 'vfonts/Inter.css'
import 'vfonts/FiraCode.css'
// highlight.js 代码高亮暗色主题
import 'highlight.js/styles/github-dark.css'
// 全局基础样式（reset / 滚动条 / 焦点轮廓等）
import './styles/global.css'

// 全局快捷键：允许在 input/textarea 内触发（TextPreview 编辑模式下需要）
hotkeys.filter = () => true

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
