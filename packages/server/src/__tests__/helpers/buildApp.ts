/**
 * 测试辅助：构建带完整路由的 Fastify 测试实例
 *
 * 每个路由测试文件通过此函数获取一个独立的 Fastify 实例，
 * 使用内存 SQLite 数据库，云存储操作通过 vi.mock 拦截。
 */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { accountRoutes } from '../../routes/accounts'
import { fileRoutes } from '../../routes/files'
import { transferRoutes } from '../../routes/transfer'
import { shareRoutes } from '../../routes/share'

export async function buildApp() {
  const app = Fastify({ logger: false })

  await app.register(cors, { origin: true })
  await app.register(multipart)

  app.setErrorHandler((error, _req, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    reply.code(statusCode).send({ error: error.message })
  })

  await app.register(accountRoutes)
  await app.register(fileRoutes)
  await app.register(transferRoutes)
  await app.register(shareRoutes)

  await app.ready()
  return app
}

/** 创建测试用账户并返回 id */
export async function createTestAccount(
  app: Awaited<ReturnType<typeof buildApp>>,
  overrides: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/accounts',
    payload: {
      name: 'Test Account',
      provider: 's3',
      config: {
        accessKeyId: 'test-ak',
        secretAccessKey: 'test-sk',
        region: 'us-east-1',
      },
      ...overrides,
    },
  })
  return JSON.parse(res.body).account as { id: string; name: string; provider: string }
}
