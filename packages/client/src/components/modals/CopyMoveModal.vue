<template>
  <n-modal
    :show="true"
    preset="card"
    :title="mode === 'copy' ? '复制到...' : '移动到...'"
    style="width: 520px; max-width: 95vw"
    @update:show="(v) => !v && emit('close')"
  >
    <n-form label-placement="left" label-width="100" :model="form">
      <!-- 目标账户 -->
      <n-form-item label="目标账户">
        <n-select
          v-model:value="form.accountId"
          :options="accountOptions"
          @update:value="onAccountChange"
        />
      </n-form-item>

      <!-- 目标 Bucket -->
      <n-form-item label="目标 Bucket">
        <n-select
          v-model:value="form.bucket"
          :options="bucketOptions"
          :loading="loadingBuckets"
          :disabled="!form.accountId"
          placeholder="请先选择账户"
        />
      </n-form-item>

      <!-- 目标前缀 -->
      <n-form-item label="目标路径">
        <n-input
          v-model:value="form.prefix"
          placeholder="如 folder/sub/（留空则放在根目录）"
        />
      </n-form-item>

      <!-- 待操作文件列表 -->
      <n-form-item label="文件">
        <div class="copy-move-modal__file-list">
          <div v-for="key in keys" :key="key" class="copy-move-modal__file-item">
            <n-icon :component="DocumentOutline" size="14" />
            <span>{{ keyToName(key) }}</span>
          </div>
        </div>
      </n-form-item>
    </n-form>

    <template #footer>
      <n-space justify="end">
        <n-button @click="emit('close')">取消</n-button>
        <n-button
          type="primary"
          :loading="submitting"
          :disabled="!form.accountId || !form.bucket"
          @click="submit"
        >
          {{ mode === 'copy' ? '复制' : '移动' }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NModal, NForm, NFormItem, NSelect, NInput, NButton, NSpace, NIcon,
  useMessage,
} from 'naive-ui'
import { DocumentOutline } from '@vicons/ionicons5'
import { useAccountStore } from '@/stores/accounts'
import { fileApi } from '@/api/files'
import { keyToName } from '@/utils/format'

const props = defineProps<{
  mode: 'copy' | 'move'
  keys: string[]
  accountId: string
  bucket: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const accountStore = useAccountStore()
const message = useMessage()
const submitting = ref(false)
const loadingBuckets = ref(false)

const form = ref({
  accountId: props.accountId,
  bucket: props.bucket,
  prefix: '',
})

const accountOptions = computed(() =>
  accountStore.sortedAccounts.map(a => ({ label: a.name, value: a.id })),
)

const bucketOptions = computed(() =>
  accountStore.getBuckets(form.value.accountId).map(b => ({ label: b.name, value: b.name })),
)

async function onAccountChange(id: string) {
  form.value.bucket = ''
  form.value.prefix = ''
  loadingBuckets.value = true
  try {
    await accountStore.loadBuckets(id)
  } finally {
    loadingBuckets.value = false
  }
}

async function submit() {
  if (!form.value.accountId || !form.value.bucket) return
  submitting.value = true
  try {
    const items = props.keys.map(key => ({
      srcKey: key,
      destBucket: form.value.bucket,
      destKey: form.value.prefix + keyToName(key),
    }))

    if (props.mode === 'copy') {
      await fileApi.copy(props.accountId, props.bucket, items)
      message.success(`已复制 ${props.keys.length} 个文件`)
    } else {
      await fileApi.move(props.accountId, props.bucket, items)
      message.success(`已移动 ${props.keys.length} 个文件`)
    }
    emit('done')
  } catch (e) {
    message.error((e as Error).message || '操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  // 预加载当前账户的 Bucket 列表
  if (!accountStore.getBuckets(props.accountId).length) {
    accountStore.loadBuckets(props.accountId)
  }
})
</script>

<style scoped>
.copy-move-modal__file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid rgba(128,128,128,0.15);
  border-radius: 6px;
  padding: 6px 8px;
  width: 100%;
}

.copy-move-modal__file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
