<template>
  <div class="preview-overlay" @click.self="emit('close')">
    <div class="preview-modal">
      <!-- 顶部工具栏 -->
      <div class="preview-modal__header">
        <div class="preview-modal__title">
          <n-icon :component="getIcon()" class="preview-modal__icon" />
          <span>{{ fileName }}</span>
          <n-tag v-if="fileMeta" size="small" round>{{ formatSize(fileMeta.size) }}</n-tag>
        </div>

        <div class="preview-modal__actions">
          <!-- 上下切换（图片用） -->
          <n-button v-if="hasSiblings" text @click="emit('prev')" title="上一个">
            <template #icon><n-icon :component="ChevronBack" /></template>
          </n-button>
          <n-button v-if="hasSiblings" text @click="emit('next')" title="下一个">
            <template #icon><n-icon :component="ChevronForward" /></template>
          </n-button>

          <!-- 下载 -->
          <n-button text @click="download" title="下载">
            <template #icon><n-icon :component="DownloadOutline" /></template>
          </n-button>

          <!-- 分享 -->
          <n-button text @click="emit('share')" title="分享">
            <template #icon><n-icon :component="ShareSocialOutline" /></template>
          </n-button>

          <!-- 关闭 -->
          <n-button text @click="emit('close')" title="关闭 (Esc)">
            <template #icon><n-icon :component="CloseOutline" /></template>
          </n-button>
        </div>
      </div>

      <!-- 预览内容区 -->
      <div class="preview-modal__body">
        <n-spin :show="loading">
          <!-- 图片 -->
          <ImagePreview
            v-if="category === 'image'"
            :url="contentUrl"
            :file-name="fileName"
          />

          <!-- 视频 -->
          <VideoPreview
            v-else-if="category === 'video'"
            :url="contentUrl"
            :file-name="fileName"
          />

          <!-- 音频 -->
          <AudioPreview
            v-else-if="category === 'audio'"
            :url="contentUrl"
            :file-name="fileName"
          />

          <!-- PDF -->
          <PdfPreview
            v-else-if="isPdf"
            :url="contentUrl"
          />

          <!-- 文本 / 代码 -->
          <TextPreview
            v-else-if="isText"
            :url="contentUrl"
            :file-key="file.key"
            :account-id="file.accountId"
            :bucket="file.bucket"
          />

          <!-- 不支持预览 -->
          <div v-else class="preview-modal__unsupported">
            <n-icon :component="DocumentOutline" size="64" :depth="3" />
            <p>此文件类型不支持在线预览</p>
            <n-button type="primary" @click="download">下载文件</n-button>
          </div>
        </n-spin>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { NButton, NIcon, NSpin, NTag } from 'naive-ui'
import {
  CloseOutline, DownloadOutline, ShareSocialOutline,
  DocumentOutline, ChevronBackOutline as ChevronBack,
  ChevronForwardOutline as ChevronForward,
  ImageOutline, VideocamOutline, MusicalNotesOutline,
} from '@vicons/ionicons5'
import ImagePreview from './ImagePreview.vue'
import VideoPreview from './VideoPreview.vue'
import AudioPreview from './AudioPreview.vue'
import TextPreview from './TextPreview.vue'
import PdfPreview from './PdfPreview.vue'
import { transferApi } from '@/api/transfer'
import { fileApi } from '@/api/files'
import { getFileCategory } from '@/utils/mime'
import { formatSize, keyToName } from '@/utils/format'
import type { FileObject } from '@/types'
import type { Component } from 'vue'

const props = defineProps<{
  file: { accountId: string; bucket: string; key: string; contentType?: string; size?: number }
  hasSiblings?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'share'): void
}>()

const loading = ref(true)
const contentUrl = ref('')
const fileMeta = ref<FileObject | null>(null)

const fileName = computed(() => keyToName(props.file.key))
const category = computed(() => getFileCategory(props.file.key, props.file.contentType))
const isPdf = computed(() => props.file.key.toLowerCase().endsWith('.pdf'))
const isText = computed(() => {
  const cat = category.value
  return cat === 'code' || (cat === 'document' && !isPdf.value)
})

function getIcon(): Component {
  return { image: ImageOutline, video: VideocamOutline, audio: MusicalNotesOutline }[category.value]
    ?? DocumentOutline
}

async function loadPreview() {
  loading.value = true
  try {
    // 文本类型不需要预加载 URL（TextPreview 内部自己 fetch）
    if (!isText.value) {
      contentUrl.value = await transferApi.getDownloadUrl(
        props.file.accountId,
        props.file.bucket,
        props.file.key,
        7200,
      )
    }
    fileMeta.value = await fileApi.stat(props.file.accountId, props.file.bucket, props.file.key)
  } finally {
    loading.value = false
  }
}

async function download() {
  const url = contentUrl.value || await transferApi.getDownloadUrl(
    props.file.accountId, props.file.bucket, props.file.key,
  )
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.value
  a.click()
}

watch(() => props.file, loadPreview, { immediate: true })

// 方向键切换文件
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') emit('prev')
  else if (e.key === 'ArrowRight') emit('next')
  else if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
}

.preview-modal {
  width: 90vw;
  height: 90vh;
  max-width: 1200px;
  background: #1a1a2e;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
}

.preview-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.preview-modal__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
}

.preview-modal__title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-modal__icon { flex-shrink: 0; }

.preview-modal__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.preview-modal__body {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-modal__unsupported {
  text-align: center;
  color: rgba(255,255,255,0.6);
}

.preview-modal__unsupported p {
  margin: 16px 0;
}

@media (max-width: 768px) {
  .preview-modal { width: 100vw; height: 100vh; border-radius: 0; }
}
</style>
