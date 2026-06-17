# CloudVault — 项目文档

多云对象存储统一管理客户端（个人 Web/PWA 端）。

## 说明

存储服务对接
  - 支持主流对象存储：AWS S3、阿里云 OSS、腾讯云 COS、华为云 OBS、MinIO、七牛云、又拍云、Backblaze B2、Cloudflare R2
  - 统一的存储抽象层，屏蔽不同服务商的 API 差异
  - 多账户管理，支持同时连接多个存储服务
  - 连接配置的安全存储（AK/SK 加密保存）

  文件操作
  - 上传：单文件、多文件、文件夹批量上传，断点续传
  - 下载：单文件、批量下载，断点续传
  - 删除：单个/批量删除，回收站机制
  - 移动/复制：跨文件夹、跨存储桶操作
  - 重命名：文件和文件夹重命名
  - 搜索：按名称、类型、大小、时间范围搜索

  文件组织
  - 文件夹层级管理
  - 标签分类系统（自定义标签）
  - 收藏夹功能
  - 文件元数据查看（大小、修改时间、Content-Type、ETag）

  文件预览
  - 图片预览（jpg/png/gif/webp/svg）
  - 视频播放（mp4/webm/mkv，支持字幕）
  - 音频播放（mp3/flac/wav/aac）
  - 文档预览（pdf/txt/md，代码高亮显示）
  - 在线编辑文本文件与刷新

  权限与分享
  - 生成临时访问链接（可设置过期时间/访问密码）
  - 公开/私有权限设置
  - CDN 加速链接生成

  数据持久化
  - 本地数据库（SQLite / IndexedDB）存储配置和缓存
  - 文件索引缓存（加速列表加载）
  - 上传/下载任务队列持久化

  性能
  - 大文件分片上传/下载（10MB+ 自动分片）
  - 并发控制（可配置同时传输任务数）
  - 缩略图生成与缓存
  - 虚拟滚动（大量文件列表）

  用户体验
  - 传输进度实时显示（速度、剩余时间）
  - 后台传输（关闭窗口后继续）
  - 拖拽上传
  - AWS SDK（兼容 S3 协议的服务）
  - 各云服务商官方 SDK
  - 统一的适配器模式封装 
  - 快捷键支持
  - 暗色/亮色主题

  数据持久化
  - 本地数据库（SQLite / IndexedDB）存储配置和缓存
  - 文件索引缓存（加速列表加载）
  - 上传/下载任务队列持久化

  安全性
  - 本地凭证加密存储
  - HTTPS 传输
  - 敏感信息不记录日志

  跨平台
  - Android 浏览器端
  - Web 浏览器端





## 技术栈

| 层次 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite + Pinia + Naive UI |
| 后端 | Node.js + Fastify + better-sqlite3 |
| 存储适配 | AWS SDK v3 (S3 兼容) + ali-oss + cos-nodejs-sdk-v5 + esdk-obs-nodejs + qiniu + upyun |
| 加密 | AES-256-GCM（Node.js crypto 内置） |
| PWA | vite-plugin-pwa + Workbox |

## 项目结构

```
cloudvault/
├── packages/
│   ├── server/        # Fastify REST API 服务（本地运行，127.0.0.1:3721）
│   │   └── src/
│   │       ├── crypto/        # AK/SK 加密/解密
│   │       ├── db/            # SQLite schema + 查询工具
│   │       ├── storage/
│   │       │   ├── types.ts         # StorageAdapter 统一接口
│   │       │   ├── adapters/        # 各服务商实现
│   │       │   └── registry.ts      # 适配器注册/缓存
│   │       ├── routes/        # API 路由（accounts/files/transfer/share/preview）
│   │       ├── config.ts      # 环境变量读取
│   │       └── index.ts       # Fastify 入口
│   └── client/        # Vue 3 SPA（开发 localhost:5173）
│       └── src/
│           ├── api/           # axios 封装（accounts/files/transfer/share）
│           ├── stores/        # Pinia（accounts/files/transfer/ui）
│           ├── router/        # Vue Router
│           ├── types/         # 全局 TypeScript 类型
│           ├── utils/         # format.ts / mime.ts
│           ├── styles/        # global.css（字体/hljs 主题/滚动条）
│           ├── components/
│           │   ├── layout/    # AppLayout / Sidebar / TopBar / TransferFloat / CommandPalette
│           │   ├── file/      # FileList / FileGrid / FileToolbar / FileContextMenu
│           │   ├── preview/   # PreviewModal + Image/Video/Audio/Text/PDF
│           │   └── modals/    # AccountModal / ShareModal
│           └── views/         # Dashboard / Explorer / Settings / Trash / Favorites / Transfer
├── .env               # 本地环境变量（不入 git）
├── .env.example       # 环境变量模板
├── start.bat          # Windows 一键启动
├── start.sh           # Unix 一键启动
└── pnpm-workspace.yaml
```

## 快速开始

### 前置要求
- Node.js >= 18
- pnpm >= 8（`npm install -g pnpm`）

### 首次启动

```bash
# Windows
start.bat

# macOS / Linux
chmod +x start.sh && ./start.sh
```

或手动执行：

```bash
pnpm install        # 安装所有工作区依赖
pnpm dev            # 并发启动 server（3721）和 client（5173）
```

打开浏览器访问：http://localhost:5173

### 生产构建

```bash
pnpm build
# 产物：packages/client/dist/（前端静态文件）
#      packages/server/dist/（Node.js 服务）
```

生产模式下服务端自动托管前端静态文件（`NODE_ENV=production`）。

## 环境变量说明

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SERVER_PORT` | `3721` | 服务端监听端口 |
| `DB_PATH` | `./data/cloudvault.db` | SQLite 数据库路径 |
| `CRYPTO_SECRET` | （必须修改）| AK/SK 加密主密钥，32 字节 hex |
| `THUMB_CACHE_DIR` | `./cache/thumbs` | 缩略图缓存目录 |
| `LOG_LEVEL` | `info` | 日志级别 |

## 存储适配器架构

所有服务商实现 `StorageAdapter` 接口（`src/storage/types.ts`），统一提供：

- `listBuckets()` / `listObjects()` / `headObject()`
- `initiateMultipartUpload()` / `getPresignedPartUrl()` / `completeMultipartUpload()`
- `getPresignedPutUrl()` / `getPresignedDownloadUrl()`
- `deleteObjects()` / `copyObject()` / `createFolder()`
- `setObjectAcl()` / `getCdnUrl()`

上传策略：**客户端直传**（服务端生成预签名 URL，文件流不经过本地服务器）。

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+K` | 打开命令面板 / 搜索 |
| `Ctrl+Shift+D` | 切换深色/浅色主题 |
| `Space` | 预览选中文件（文件浏览器中） |
| `←` `→` | 预览时切换上一个/下一个文件 |
| `Esc` | 关闭弹窗 / 取消命令面板 |
| `Shift+Click` | 范围多选 |
| `Ctrl+Click` | 单项多选 |

## 数据库表

| 表名 | 用途 |
|---|---|
| `accounts` | 账户配置（config 字段 AES-GCM 加密） |
| `buckets_cache` | Bucket 列表缓存 |
| `file_index` | 文件索引缓存（加速搜索） |
| `tags` / `file_tags` | 自定义标签系统 |
| `favorites` | 收藏夹 |
| `transfer_tasks` | 传输队列持久化（断点续传） |
| `trash` | 回收站（软删除） |
| `share_links` | 分享链接记录 |
