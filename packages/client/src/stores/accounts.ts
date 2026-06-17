/**
 * 账户 Store
 *
 * 管理所有云存储账户的状态，包括 Bucket 列表缓存和当前选中的账户。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { accountApi } from '@/api/accounts'
import type { Account, Bucket, Provider } from '@/types'

export const useAccountStore = defineStore('accounts', () => {
  const accounts = ref<Account[]>([])
  const providers = ref<Provider[]>([])
  /** key: accountId, value: Bucket[] */
  const bucketsMap = ref<Record<string, Bucket[]>>({})
  const loading = ref(false)

  const sortedAccounts = computed(() =>
    [...accounts.value].sort((a, b) => a.sortOrder - b.sortOrder),
  )

  async function loadProviders() {
    providers.value = await accountApi.getProviders()
  }

  async function loadAccounts() {
    loading.value = true
    try {
      accounts.value = await accountApi.list()
    } finally {
      loading.value = false
    }
  }

  async function createAccount(data: { name: string; provider: string; config: Record<string, string> }) {
    const account = await accountApi.create(data)
    accounts.value.push(account)
    return account
  }

  async function updateAccount(
    id: string,
    data: Partial<{ name: string; provider: string; config: Record<string, string> }>,
  ) {
    const updated = await accountApi.update(id, data)
    const idx = accounts.value.findIndex(a => a.id === id)
    if (idx !== -1) accounts.value[idx] = updated
    // 清除该账户的 Bucket 缓存
    delete bucketsMap.value[id]
    return updated
  }

  async function removeAccount(id: string) {
    await accountApi.remove(id)
    accounts.value = accounts.value.filter(a => a.id !== id)
    delete bucketsMap.value[id]
  }

  async function testConnection(id: string) {
    return accountApi.test(id)
  }

  async function loadBuckets(accountId: string, forceRefresh = false) {
    if (!forceRefresh && bucketsMap.value[accountId]) {
      return bucketsMap.value[accountId]
    }
    const buckets = await accountApi.listBuckets(accountId)
    bucketsMap.value[accountId] = buckets
    return buckets
  }

  function getBuckets(accountId: string): Bucket[] {
    return bucketsMap.value[accountId] ?? []
  }

  function getAccount(id: string): Account | undefined {
    return accounts.value.find(a => a.id === id)
  }

  function getProvider(providerId: string): Provider | undefined {
    return providers.value.find(p => p.id === providerId)
  }

  return {
    accounts,
    providers,
    bucketsMap,
    loading,
    sortedAccounts,
    loadProviders,
    loadAccounts,
    createAccount,
    updateAccount,
    removeAccount,
    testConnection,
    loadBuckets,
    getBuckets,
    getAccount,
    getProvider,
  }
})
