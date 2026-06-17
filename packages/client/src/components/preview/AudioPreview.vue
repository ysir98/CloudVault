<template>
  <div class="audio-preview">
    <div class="audio-preview__artwork">
      <n-icon :component="MusicalNotesOutline" size="80" color="rgba(255,255,255,0.2)" />
    </div>
    <div class="audio-preview__title">{{ fileName }}</div>
    <audio
      ref="audioRef"
      class="audio-preview__player"
      controls
      autoplay
      :src="url"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NIcon } from 'naive-ui'
import { MusicalNotesOutline } from '@vicons/ionicons5'

defineProps<{ url: string; fileName: string }>()

const audioRef = ref<HTMLAudioElement>()
</script>

<style scoped>
.audio-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 40px;
  color: #fff;
}

.audio-preview__artwork {
  width: 200px;
  height: 200px;
  border-radius: 16px;
  background: rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  justify-content: center;
}

.audio-preview__title {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  max-width: 400px;
}

.audio-preview__player {
  width: 360px;
  max-width: 90vw;
  outline: none;
}
</style>
