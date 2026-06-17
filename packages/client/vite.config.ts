import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // 缓存所有静态资源
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // 网络优先策略（保证 API 请求始终走网络）
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'CloudVault',
        short_name: 'CloudVault',
        description: '多云对象存储统一管理客户端',
        theme_color: '#18a058',
        background_color: '#101014',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发时将 /api 请求代理到本地 Node 服务
      '/api': {
        target: 'http://127.0.0.1:3721',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // 按模块拆分 chunk，减少首屏加载体积
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-ui': ['naive-ui'],
          'vendor-media': ['video.js'],
          'vendor-pdf': ['pdfjs-dist'],
          'vendor-code': ['highlight.js', 'marked'],
        },
      },
    },
  },
})
