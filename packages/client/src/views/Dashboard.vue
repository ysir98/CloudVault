<template>
  <div class="dashboard">
    <div class="dashboard__inner">
      <h2 class="dashboard__title">概览</h2>

      <!-- 账户统计卡片 -->
      <div class="dashboard__cards">
        <n-card
          v-for="account in accountStore.sortedAccounts"
          :key="account.id"
          class="dashboard__card"
          hoverable
        >
          <div class="account-card">
            <div class="account-card__header">
              <n-tag :type="providerTagType(account.provider)" size="small">
                {{ getProviderName(account.provider) }}
              </n-tag>
              <n-space>
                <n-button
                  size="tiny"
                  text
                  :loading="testing[account.id]"
                  @click="testConnection(account.id)"
                >
                  测试连接
                </n-button>
                <n-button size="tiny" text @click="openAccount(account)">
                  <template #icon><n-icon :component="SettingsOutline" /></template>
                </n-button>
              </n-space>
            </div>
            <div class="account-card__name">{{ account.name }}</div>
            <div class="account-card__buckets">
              <div
                v-for="bucket in accountStore.getBuckets(account.id)"
                :key="bucket.name"
                class="account-card__bucket"
                @click="navigateToBucket(account.id, bucket.name)"
              >
                <n-icon :component="FolderOutline" size="14" />
                {{ bucket.name }}
              </div>
              <div
                v-if="!accountStore.getBuckets(account.id).length"
                class="account-card__bucket account-card__bucket--load"
                @click="accountStore.loadBuckets(account.id)"
              >
                <n-icon :component="RefreshOutline" size="14" />
                点击加载 Bucket 列表
              </div>
            </div>
          </div>
        </n-card>

        <!-- 添加账户卡片 -->
        <n-card
          class="dashboard__card dashboard__card--add"
          hoverable
          @click="showAddAccount = true"
        >
          <div class="add-account-card">
            <n-icon :component="AddCircleOutline" size="36" :depth="3" />
            <span>添加存储账户</span>
          </div>
        </n-card>
      </div>

      <!-- 最近访问 -->
      <div class="dashboard__section" v-if="fileStore.favorites.length">
        <h3 class="dashboard__section-title">收藏夹</h3>
        <div class="dashboard__recent-list">
          <div
            v-for="fav in fileStore.favorites.slice(0, 8)"
            :key="fav.id"
            class="recent-item"
            @click="navigateToFav(fav)"
          >
            <n-icon :component="StarFilled" color="#f0a020" />
            <div class="recent-item__info">
              <span class="recent-item__name">{{ fav.displayName ?? keyToName(fav.key) }}</span>
              <span class="recent-item__path">{{ fav.bucket }}/{{ fav.key }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑账户 Modal -->
    <AccountModal
      v-if="showAddAccount || editAccount"
      :account="editAccount"
      @close="showAddAccount = false; editAccount = null"
      @saved="onAccountSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard, NButton, NIcon, NTag, NSpace, useMessage,
} from 'naive-ui'
import {
  FolderOutline, RefreshOutline, AddCircleOutline,
  SettingsOutline, Star as StarFilled,
} from '@vicons/ionicons5'
import { useAccountStore } from '@/stores/accounts'
import { useFileStore } from '@/stores/files'
import AccountModal from '@/components/modals/AccountModal.vue'
import { keyToName } from '@/utils/format'
import type { Account, FavoriteItem } from '@/types'

const router = useRouter()
const message = useMessage()
const accountStore = useAccountStore()
const fileStore = useFileStore()

const showAddAccount = ref(false)
const editAccount = ref<Account | null>(null)
const testing = ref<Record<string, boolean>>({})

onMounted(() => {
  fileStore.loadFavorites()
  // 预加载所有账户的 Bucket
  accountStore.sortedAccounts.forEach(a => accountStore.loadBuckets(a.id))
})

async function testConnection(id: string) {
  testing.value[id] = true
  const result = await accountStore.testConnection(id).finally(() => {
    delete testing.value[id]
  })
  if (result.ok) message.success('连接正常')
  else message.error(`连接失败：${result.error}`)
}

function openAccount(account: Account) {
  editAccount.value = account
}

function navigateToBucket(accountId: string, bucket: string) {
  router.push({ name: 'Explorer', params: { accountId, bucket }, query: { prefix: '' } })
}

function navigateToFav(fav: FavoriteItem) {
  const prefix = fav.key.includes('/') ? fav.key.substring(0, fav.key.lastIndexOf('/') + 1) : ''
  router.push({ name: 'Explorer', params: { accountId: fav.accountId, bucket: fav.bucket }, query: { prefix } })
}

function getProviderName(provider: string): string {
  return accountStore.getProvider(provider)?.name ?? provider
}

function providerTagType(provider: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  const map: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
    s3: 'warning', r2: 'warning', minio: 'info',
    oss: 'success', cos: 'info', obs: 'error',
    qiniu: 'default', upyun: 'default',
  }
  return map[provider] ?? 'default'
}

async function onAccountSaved() {
  showAddAccount.value = false
  editAccount.value = null
  await accountStore.loadAccounts()
}
</script>

<style scoped>
.dashboard {
  height: 100%;
  overflow-y: auto;
}

.dashboard__inner {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.dashboard__title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 20px;
}

.dashboard__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.dashboard__card--add {
  border: 2px dashed rgba(128,128,128,0.3);
  cursor: pointer;
}

.account-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.account-card__name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.account-card__buckets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.account-card__bucket {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(128,128,128,0.1);
  cursor: pointer;
  transition: background 0.15s;
}

.account-card__bucket:hover { background: rgba(24,160,88,0.15); color: #18a058; }
.account-card__bucket--load { opacity: 0.6; }

.add-account-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 120px;
  cursor: pointer;
  opacity: 0.6;
}

.dashboard__section { margin-bottom: 24px; }

.dashboard__section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.dashboard__recent-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid rgba(128,128,128,0.1);
}

.recent-item:hover { background: rgba(128,128,128,0.06); }

.recent-item__info { min-width: 0; }

.recent-item__name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.recent-item__path {
  font-size: 11px;
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
</style>
