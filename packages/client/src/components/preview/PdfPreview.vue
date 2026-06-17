<template>
  <div class="pdf-preview">
    <!-- 用 iframe 嵌入浏览器原生 PDF 渲染器 -->
    <iframe
      v-if="url"
      :src="url"
      class="pdf-preview__iframe"
      title="PDF 预览"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ url: string }>()
</script>

<style scoped>
.pdf-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.pdf-preview__iframe {
  flex: 1;
  border: none;
  background: #fff;
}
</style>
