<template>
  <div class="text-preview">
    <div class="text-preview__toolbar">
      <span class="text-preview__lang">{{ detectedLang }}</span>
      <div class="text-preview__toolbar-actions">
        <n-button
          v-if="!editMode && isEditable"
          size="small"
          @click="enterEdit"
        >
          编辑
        </n-button>
        <template v-if="editMode">
          <n-button size="small" type="primary" :loading="saving" @click="saveContent">保存</n-button>
          <n-button size="small" @click="cancelEdit">取消</n-button>
        </template>
        <n-button size="small" text @click="copyContent" title="复制内容">
          <template #icon><n-icon :component="CopyOutline" /></template>
        </n-button>
      </div>
    </div>

    <n-spin :show="loading" class="text-preview__spin">
      <!-- 编辑模式：textarea -->
      <textarea
        v-if="editMode"
        v-model="editContent"
        class="text-preview__editor"
        spellcheck="false"
      />

      <!-- 预览模式：highlight.js 高亮 -->
      <div
        v-else
        class="text-preview__code-wrap"
        v-html="highlightedContent"
      />
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NButton, NIcon, NSpin, useMessage } from 'naive-ui'
import { CopyOutline } from '@vicons/ionicons5'
import hljs from 'highlight.js'
import { marked } from 'marked'
import { shareApi } from '@/api/share'
import { isTextEditable } from '@/utils/mime'

const props = defineProps<{
  url: string
  fileKey: string
  accountId?: string
  bucket?: string
}>()

const message = useMessage()
const loading = ref(true)
const rawContent = ref('')
const editMode = ref(false)
const editContent = ref('')
const saving = ref(false)

const isEditable = computed(() =>
  !!(props.accountId && props.bucket) && isTextEditable(props.fileKey),
)

const isMarkdown = computed(() => props.fileKey.toLowerCase().endsWith('.md'))

const detectedLang = computed(() => {
  const ext = props.fileKey.split('.').pop()?.toLowerCase() ?? ''
  return ext || 'text'
})

const highlightedContent = computed(() => {
  if (!rawContent.value) return ''

  if (isMarkdown.value) {
    // Markdown 渲染
    return `<div class="markdown-body">${marked.parse(rawContent.value)}</div>`
  }

  try {
    const result = hljs.highlightAuto(rawContent.value, [detectedLang.value])
    return `<pre><code class="hljs">${result.value}</code></pre>`
  } catch {
    const escaped = rawContent.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<pre><code>${escaped}</code></pre>`
  }
})

async function loadContent() {
  if (!props.accountId || !props.bucket) return
  loading.value = true
  try {
    rawContent.value = await shareApi.getTextContent(props.accountId, props.bucket, props.fileKey)
  } catch {
    rawContent.value = '// 加载失败，请检查网络连接'
  } finally {
    loading.value = false
  }
}

function enterEdit() {
  editContent.value = rawContent.value
  editMode.value = true
}

function cancelEdit() {
  editMode.value = false
  editContent.value = ''
}

async function saveContent() {
  if (!props.accountId || !props.bucket) return
  saving.value = true
  try {
    await shareApi.saveTextContent(props.accountId, props.bucket, props.fileKey, editContent.value)
    rawContent.value = editContent.value
    editMode.value = false
    message.success('保存成功')
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function copyContent() {
  await navigator.clipboard.writeText(rawContent.value)
  message.success('已复制到剪贴板')
}

watch(() => [props.url, props.fileKey], loadContent, { immediate: true })
</script>

<style scoped>
.text-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #e0e0e0;
}

.text-preview__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.text-preview__lang {
  font-size: 12px;
  opacity: 0.5;
  font-family: monospace;
}

.text-preview__toolbar-actions {
  display: flex;
  gap: 8px;
}

.text-preview__spin {
  flex: 1;
  overflow: hidden;
}

.text-preview__code-wrap {
  height: 100%;
  overflow: auto;
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
}

.text-preview__code-wrap pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.text-preview__editor {
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: #e0e0e0;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: 16px;
  resize: none;
}

/* Markdown 基础样式 */
:deep(.markdown-body) {
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
  line-height: 1.8;
}

:deep(.markdown-body) h1, :deep(.markdown-body) h2 { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; }
:deep(.markdown-body) code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
:deep(.markdown-body) pre code { background: none; padding: 0; }
:deep(.markdown-body) pre { background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; overflow-x: auto; }
:deep(.markdown-body) a { color: #18a058; }
</style>
