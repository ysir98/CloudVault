/**
 * API 客户端基础配置
 *
 * 统一处理：
 *   - 网络错误自动重试（最多 3 次，指数退避）
 *   - HTTP 错误格式化
 */

import axios, { type AxiosError } from 'axios'

export const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// 响应拦截器：自动重试 + 统一错误处理
http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as typeof error.config & {
      _retryCount?: number
    }

    // ECONNREFUSED / 网络错误最多重试 3 次（server 可能还在启动）
    const isNetworkError = !error.response && error.code !== 'ECONNABORTED'
    const retryCount = config?._retryCount ?? 0

    if (isNetworkError && retryCount < 3 && config) {
      config._retryCount = retryCount + 1
      // 指数退避：500ms / 1000ms / 2000ms
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, retryCount)))
      return http(config)
    }

    const msg = error.response?.data
      ? (error.response.data as { error?: string }).error ?? '请求失败'
      : error.message ?? '服务器连接失败，请确认后端服务已启动'

    const enhanced = new Error(msg)
    ;(enhanced as Error & { status: number }).status = error.response?.status ?? 0
    return Promise.reject(enhanced)
  },
)

export * from './accounts'
export * from './files'
export * from './transfer'
export * from './share'
