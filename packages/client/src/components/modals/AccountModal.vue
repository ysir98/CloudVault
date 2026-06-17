<template>
  <n-modal
    :show="true"
    preset="card"
    :title="account ? '编辑账户' : '添加存储账户'"
    style="width: 560px; max-width: 95vw"
    @update:show="(v) => !v && emit('close')"
  >
    <n-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-placement="left"
      label-width="100"
    >
      <!-- 账户名称 -->
      <n-form-item label="账户名称" path="name">
        <n-input v-model:value="form.name" placeholder="自定义名称，如「我的OSS」" />
      </n-form-item>

      <!-- 提供商 -->
      <n-form-item label="存储服务商" path="provider">
        <n-select
          v-model:value="form.provider"
          :options="providerOptions"
          :disabled="!!account"
          placeholder="选择存储服务商"
          @update:value="resetConfig"
        />
      </n-form-item>

      <!-- 动态配置字段 -->
      <template v-if="form.provider && currentProvider">
        <n-form-item
          v-for="field in currentProvider.fields"
          :key="field"
          :label="fieldLabel(field)"
          :path="`config.${field}`"
        >
          <n-input
            v-model:value="form.config[field]"
            :type="sensitiveFields.has(field) ? 'password' : 'text'"
            :placeholder="fieldPlaceholder(field, form.provider)"
            show-password-on="click"
          />
        </n-form-item>
      </template>
    </n-form>

    <template #footer>
      <n-space justify="end">
        <n-button @click="emit('close')">取消</n-button>
        <n-button
          :loading="testing"
          @click="handleTest"
        >
          测试连接
        </n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          {{ account ? '保存' : '添加' }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NModal, NForm, NFormItem, NInput, NSelect, NButton, NSpace,
  useMessage, type FormInst,
} from 'naive-ui'
import { useAccountStore } from '@/stores/accounts'
import type { Account } from '@/types'

const props = defineProps<{ account: Account | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const accountStore = useAccountStore()
const message = useMessage()
const formRef = ref<FormInst>()
const saving = ref(false)
const testing = ref(false)

interface FormData {
  name: string
  provider: string
  config: Record<string, string>
}

const form = ref<FormData>({ name: '', provider: '', config: {} })

const sensitiveFields = new Set(['secretAccessKey', 'accessKeySecret', 'secretKey', 'password', 'secretId'])

const providerOptions = computed(() =>
  accountStore.providers.map(p => ({ label: p.name, value: p.id })),
)

const currentProvider = computed(() =>
  accountStore.providers.find(p => p.id === form.value.provider),
)

const rules = {
  name: [{ required: true, message: '请输入账户名称', trigger: 'blur' }],
  provider: [{ required: true, message: '请选择存储服务商', trigger: 'change' }],
}

// 初始化表单（编辑模式）
watch(() => props.account, (acc) => {
  if (acc) {
    form.value = { name: acc.name, provider: acc.provider, config: {} }
  }
}, { immediate: true })

function resetConfig() {
  form.value.config = {}
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    accessKeyId: 'Access Key ID',
    secretAccessKey: 'Secret Access Key',
    accessKeySecret: 'Access Key Secret',
    secretId: 'Secret ID',
    secretKey: 'Secret Key',
    accessKey: 'Access Key',
    region: '区域',
    endpoint: '端点 URL',
    server: '服务器地址',
    operator: '操作员',
    password: '密码',
    zone: '存储区',
    cdnDomain: 'CDN 域名',
  }
  return labels[field] ?? field
}

function fieldPlaceholder(field: string, provider: string): string {
  const map: Record<string, Record<string, string>> = {
    endpoint: {
      r2: 'https://<account_id>.r2.cloudflarestorage.com',
      minio: 'http://localhost:9000',
      b2: 'https://s3.<region>.backblazeb2.com',
    },
    region: {
      s3: 'us-east-1',
      oss: 'oss-cn-hangzhou',
      cos: 'ap-guangzhou',
      default: '',
    },
    server: { obs: 'obs.cn-north-4.myhuaweicloud.com' },
    zone: { qiniu: 'z0（华东）/ z1（华北）/ z2（华南）/ na0（北美）' },
    cdnDomain: { default: 'https://cdn.example.com（可选）' },
  }
  return map[field]?.[provider] ?? map[field]?.['default'] ?? ''
}

async function handleTest() {
  if (!props.account) {
    message.warning('请先保存账户后再测试')
    return
  }
  testing.value = true
  const result = await accountStore.testConnection(props.account.id).finally(() => {
    testing.value = false
  })
  if (result.ok) message.success('连接正常')
  else message.error(`连接失败：${result.error}`)
}

async function handleSave() {
  await formRef.value?.validate()
  saving.value = true
  try {
    if (props.account) {
      await accountStore.updateAccount(props.account.id, {
        name: form.value.name,
        config: form.value.config,
      })
    } else {
      await accountStore.createAccount({
        name: form.value.name,
        provider: form.value.provider,
        config: form.value.config,
      })
    }
    message.success(props.account ? '账户已更新' : '账户已添加')
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>
