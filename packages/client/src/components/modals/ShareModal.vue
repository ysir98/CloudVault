<template>
  <n-modal
    :show="true"
    preset="card"
    title="生成分享链接"
    style="width: 480px; max-width: 95vw"
    @update:show="(v) => !v && emit('close')"
  >
    <n-form label-placement="left" label-width="100">
      <n-form-item label="文件">
        <span class="share-modal__file">{{ keyToName(file.key) }}</span>
      </n-form-item>

      <n-form-item label="有效期">
        <n-select
          v-model:value="expiresIn"
          :options="expiresOptions"
          style="width: 180px"
        />
      </n-form-item>

      <n-form-item label="访问密码">
        <n-input
          v-model:value="password"
          placeholder="可选，留空则不设密码"
          show-password-on="click"
          type="password"
        />
      </n-form-item>
    </n-form>

    <!-- 生成结果 -->
    <div v-if="shareResult" class="share-modal__result">
      <n-divider>分享链接</n-divider>

      <div class="share-modal__url-row">
        <n-input :value="shareResult.url" readonly />
        <n-button @click="copyUrl(shareResult.url)">复制</n-button>
      </div>

      <div v-if="shareResult.cdnUrl" class="share-modal__url-row" style="margin-top: 8px">
        <n-tag type="success" size="small">CDN</n-tag>
        <n-input :value="shareResult.cdnUrl" readonly style="flex:1" />
        <n-button @click="copyUrl(shareResult.cdnUrl!)">复制</n-button>
      </div>

      <div class="share-modal__qr" v-if="qrDataUrl">
        <img :src="qrDataUrl" alt="QR Code" width="120" height="120" />
        <p class="share-modal__qr-hint">手机扫码下载</p>
      </div>

      <div class="share-modal__expiry">
        有效至：{{ new Date(shareResult.expiresAt).toLocaleString('zh-CN') }}
      </div>
    </div>

    <template #footer>
      <n-space justify="end">
        <n-button @click="emit('close')">关闭</n-button>
        <n-button type="primary" :loading="generating" @click="generate">
          {{ shareResult ? '重新生成' : '生成链接' }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  NModal, NForm, NFormItem, NInput, NSelect, NButton, NSpace,
  NDivider, NTag, useMessage,
} from 'naive-ui'
import { shareApi } from '@/api/share'
import { keyToName } from '@/utils/format'
import type { FileObject } from '@/types'

const props = defineProps<{
  file: FileObject
  accountId: string
  bucket: string
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const expiresIn = ref(7200)
const password = ref('')
const generating = ref(false)
const qrDataUrl = ref('')

const shareResult = ref<{
  url: string; cdnUrl: string | null; expiresAt: number
} | null>(null)

const expiresOptions = [
  { label: '1 小时', value: 3600 },
  { label: '2 小时', value: 7200 },
  { label: '24 小时', value: 86400 },
  { label: '7 天', value: 604800 },
  { label: '30 天', value: 2592000 },
]

async function generate() {
  generating.value = true
  qrDataUrl.value = ''
  try {
    const result = await shareApi.create({
      accountId: props.accountId,
      bucket: props.bucket,
      key: props.file.key,
      expiresIn: expiresIn.value,
      password: password.value || undefined,
    })
    shareResult.value = result

    // 生成 QR 码（使用浏览器原生 canvas，无需额外依赖）
    const shareUrl = result.cdnUrl ?? result.url
    await generateQrCode(shareUrl)
  } catch {
    message.error('链接生成失败')
  } finally {
    generating.value = false
  }
}

/** 用 Canvas 绘制简单 QR 码占位图，实际使用时可替换为 qrcode 库 */
async function generateQrCode(url: string) {
  try {
    // 动态导入 qrcode（仅在分享时加载，减少初始包体积）
    const QRCode = await import('qrcode')
    qrDataUrl.value = await QRCode.toDataURL(url, {
      width: 120,
      margin: 1,
      color: { dark: '#000', light: '#fff' },
    })
  } catch {
    // qrcode 未安装时静默忽略，不影响主功能
    qrDataUrl.value = ''
  }
}

async function copyUrl(url: string) {
  await navigator.clipboard.writeText(url)
  message.success('已复制到剪贴板')
}
</script>

<style scoped>
.share-modal__file {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-modal__result { margin-top: 8px; }

.share-modal__url-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.share-modal__qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 16px;
  gap: 4px;
}

.share-modal__qr-hint {
  font-size: 12px;
  opacity: 0.5;
}

.share-modal__expiry {
  font-size: 12px;
  opacity: 0.5;
  margin-top: 8px;
  text-align: right;
}
</style>
