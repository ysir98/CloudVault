<template>
  <div class="video-preview">
    <video
      ref="videoRef"
      class="video-preview__player"
      controls
      autoplay
      preload="metadata"
      :src="url"
      @error="onError"
    >
      您的浏览器不支持 HTML5 视频播放
    </video>
    <div v-if="error" class="video-preview__error">
      <p>无法播放此视频格式，请尝试下载后使用本地播放器</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ url: string; fileName: string }>()

const videoRef = ref<HTMLVideoElement>()
const error = ref(false)

function onError() { error.value = true }
</script>

<style scoped>
.video-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

.video-preview__player {
  max-width: 100%;
  max-height: 100%;
  outline: none;
}

.video-preview__error {
  color: rgba(255,255,255,0.6);
  text-align: center;
  padding: 24px;
}
</style>
