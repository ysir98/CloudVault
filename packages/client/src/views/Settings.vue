<template>
  <div class="settings">
    <div class="settings__inner">
      <h2 class="settings__title">设置</h2>

      <n-tabs type="line" animated>
        <!-- 外观 -->
        <n-tab-pane name="appearance" tab="外观">
          <n-form label-placement="left" label-width="140">
            <n-form-item label="主题">
              <n-switch :value="uiStore.isDark" @update:value="uiStore.toggleTheme">
                <template #checked>深色</template>
                <template #unchecked>浅色</template>
              </n-switch>
            </n-form-item>

            <n-form-item label="默认视图">
              <n-radio-group v-model:value="defaultView">
                <n-radio value="list">列表</n-radio>
                <n-radio value="grid">网格</n-radio>
              </n-radio-group>
            </n-form-item>

            <n-form-item label="显示缩略图">
              <n-switch v-model:value="showThumbnails" />
            </n-form-item>
          </n-form>
        </n-tab-pane>

        <!-- 传输 -->
        <n-tab-pane name="transfer" tab="传输">
          <n-form label-placement="left" label-width="160">
            <n-form-item label="同时传输任务数">
              <n-input-number
                v-model:value="transferStore.concurrency"
                :min="1"
                :max="10"
                style="width: 120px"
              />
            </n-form-item>

            <n-form-item label="分片大小">
              <n-select
                :value="'10MB'"
                :options="[
                  { label: '5 MB', value: '5MB' },
                  { label: '10 MB（默认）', value: '10MB' },
                  { label: '20 MB', value: '20MB' },
                ]"
                style="width: 160px"
              />
            </n-form-item>
          </n-form>
        </n-tab-pane>

        <!-- 账户管理 -->
        <n-tab-pane name="accounts" tab="账户管理">
          <n-space vertical size="large">
            <n-button type="primary" @click="showAddAccount = true">
              <template #icon><n-icon :component="AddOutline" /></template>
              添加账户
            </n-button>

            <n-data-table
              :columns="accountColumns"
              :data="accountStore.sortedAccounts"
              :bordered="false"
              size="small"
            />
          </n-space>
        </n-tab-pane>

        <!-- 关于 -->
        <n-tab-pane name="about" tab="关于">
          <div class="settings__about">
            <div class="settings__about-logo">☁</div>
            <h3>CloudVault</h3>
            <p>v1.0.0</p>
            <p class="settings__about-desc">
              多云对象存储统一管理客户端，支持 AWS S3、阿里云 OSS、腾讯云 COS、华为云 OBS、
              七牛云、又拍云、Cloudflare R2、MinIO、Backblaze B2。
            </p>
            <div class="settings__shortcuts">
              <h4>快捷键</h4>
              <div class="settings__shortcut-list">
                <div v-for="sc in shortcuts" :key="sc.key" class="settings__shortcut-item">
                  <span>{{ sc.desc }}</span>
                  <kbd>{{ sc.key }}</kbd>
                </div>
              </div>
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </div>

    <AccountModal
      v-if="showAddAccount || editAccountData"
      :account="editAccountData"
      @close="showAddAccount = false; editAccountData = null"
      @saved="onAccountSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, h } from 'vue'
import {
  NTabs, NTabPane, NForm, NFormItem, NSwitch, NRadioGroup, NRadio,
  NInputNumber, NSelect, NSpace, NButton, NIcon, NDataTable, useDialog,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { AddOutline, TrashOutline, PencilOutline } from '@vicons/ionicons5'
import { useUiStore } from '@/stores/ui'
import { useTransferStore } from '@/stores/transfer'
import { useAccountStore } from '@/stores/accounts'
import AccountModal from '@/components/modals/AccountModal.vue'
import type { Account } from '@/types'

const uiStore = useUiStore()
const transferStore = useTransferStore()
const accountStore = useAccountStore()
const dialog = useDialog()
const message = useMessage()

const defaultView = ref<'list' | 'grid'>('list')
const showThumbnails = ref(true)
const showAddAccount = ref(false)
const editAccountData = ref<Account | null>(null)

const shortcuts = [
  { key: 'Ctrl+K', desc: '打开命令面板/搜索' },
  { key: 'Ctrl+Shift+D', desc: '切换深色/浅色主题' },
  { key: 'Space', desc: '预览选中文件' },
  { key: '↑ ↓', desc: '选择文件' },
  { key: 'Shift+Click', desc: '范围多选' },
  { key: 'Ctrl+A', desc: '全选' },
  { key: 'Esc', desc: '关闭弹窗/取消选中' },
  { key: 'Delete', desc: '删除选中文件' },
  { key: 'F2', desc: '重命名' },
]

const accountColumns: DataTableColumns<Account> = [
  { title: '名称', key: 'name' },
  {
    title: '提供商',
    key: 'provider',
    render: (row) => accountStore.getProvider(row.provider)?.name ?? row.provider,
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    render: (row) => h('div', { style: 'display:flex;gap:8px' }, [
      h(NButton, {
        size: 'tiny', text: true,
        onClick: () => { editAccountData.value = row },
      }, {
        icon: () => h(NIcon, null, { default: () => h(PencilOutline) }),
      }),
      h(NButton, {
        size: 'tiny', text: true, type: 'error',
        onClick: () => confirmDeleteAccount(row),
      }, {
        icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
      }),
    ]),
  },
]

function confirmDeleteAccount(account: Account) {
  dialog.warning({
    title: '删除账户',
    content: `确认删除账户「${account.name}」？相关的传输任务记录也将一并删除。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await accountStore.removeAccount(account.id)
      message.success('账户已删除')
    },
  })
}

async function onAccountSaved() {
  showAddAccount.value = false
  editAccountData.value = null
  await accountStore.loadAccounts()
}
</script>

<style scoped>
.settings {
  height: 100%;
  overflow-y: auto;
}

.settings__inner {
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
}

.settings__title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 24px;
}

.settings__about {
  text-align: center;
  padding: 24px 0;
}

.settings__about-logo {
  font-size: 64px;
  margin-bottom: 8px;
}

.settings__about h3 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
}

.settings__about-desc {
  max-width: 500px;
  margin: 16px auto;
  line-height: 1.8;
  opacity: 0.7;
}

.settings__shortcuts {
  margin-top: 24px;
  text-align: left;
  max-width: 400px;
  margin-inline: auto;
}

.settings__shortcuts h4 { margin-bottom: 12px; font-size: 14px; font-weight: 600; }

.settings__shortcut-list { display: flex; flex-direction: column; gap: 8px; }

.settings__shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.settings__shortcut-item kbd {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(128,128,128,0.3);
  background: rgba(128,128,128,0.1);
  font-family: inherit;
}
</style>
