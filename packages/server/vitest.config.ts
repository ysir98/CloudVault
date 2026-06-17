import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/index.ts'],
    },
    // 每个测试文件独立的 SQLite 数据库（通过 env 覆盖路径）
    env: {
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      CRYPTO_SECRET: 'test_secret_32bytes_replace_00000',
    },
  },
})
