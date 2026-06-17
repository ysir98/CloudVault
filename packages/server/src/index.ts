/**
 * CloudVault 服务端入口
 *
 * 使用 Fastify 构建 REST API 服务，本地运行（127.0.0.1），
 * 仅供同机的前端（Web/PWA）调用，不暴露到公网。
 */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import fs from 'fs'
import path from 'path'
import { config } from './config'
import { getDb, closeDb } from './db'
import { accountRoutes } from './routes/accounts'
import { fileRoutes } from './routes/files'
import { transferRoutes } from './routes/transfer'
import { shareRoutes } from './routes/share'
import { previewRoutes } from './routes/preview'

async function bootstrap() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // 不记录请求体（防止凭证出现在日志中）
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
      },
    },
  })

  // CORS：仅允许同源（本地开发时允许 localhost:5173）
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production'
      ? false
      : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // 文件上传（multipart），用于服务端中转上传场景
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024,  // 单次中转最大 100MB（大文件走直传）
    },
  })

  // 生产模式：同时托管前端静态文件
  if (process.env.NODE_ENV === 'production' && fs.existsSync(config.staticDir)) {
    await app.register(staticFiles, {
      root: config.staticDir,
      prefix: '/',
      // SPA fallback：所有未匹配的路由返回 index.html
    })

    app.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html')
    })
  }

  // 健康检查
  app.get('/api/health', async () => ({
    status: 'ok',
    version: process.env.npm_package_version ?? '1.0.0',
    timestamp: Date.now(),
  }))

  // 注册业务路由
  await app.register(accountRoutes)
  await app.register(fileRoutes)
  await app.register(transferRoutes)
  await app.register(shareRoutes)
  await app.register(previewRoutes)

  // 全局错误处理
  app.setErrorHandler((error, _req, reply) => {
    const statusCode = (error as NodeJS.ErrnoException & { statusCode?: number }).statusCode ?? 500
    app.log.error({ err: error.message, stack: error.stack }, 'Unhandled error')
    reply.code(statusCode).send({ error: error.message })
  })

  // 初始化数据库
  getDb()

  try {
    await app.listen({ port: config.port, host: config.host })
    console.log(`\n  CloudVault Server running at http://${config.host}:${config.port}\n`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  // 优雅退出
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down...`)
    await app.close()
    closeDb()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // 防止第三方 SDK（如七牛）的未捕获 Promise rejection 将整个服务 crash
  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason: String(reason) }, 'Unhandled promise rejection (ignored to keep server alive)')
  })
}

bootstrap()
