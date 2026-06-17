<template>
  <div
    class="image-preview"
    @wheel.prevent="handleWheel"
    @mousedown="startDrag"
  >
    <img
      v-if="url"
      :src="url"
      :alt="fileName"
      class="image-preview__img"
      :style="imgStyle"
      draggable="false"
    />

    <!-- 缩放控制 -->
    <div class="image-preview__controls">
      <n-button circle text @click="zoomOut" title="缩小">
        <template #icon><n-icon :component="RemoveOutline" /></template>
      </n-button>
      <span class="image-preview__zoom">{{ Math.round(scale * 100) }}%</span>
      <n-button circle text @click="zoomIn" title="放大">
        <template #icon><n-icon :component="AddOutline" /></template>
      </n-button>
      <n-button circle text @click="resetView" title="重置">
        <template #icon><n-icon :component="ScanOutline" /></template>
      </n-button>
      <n-button circle text @click="rotate += 90" title="旋转">
        <template #icon><n-icon :component="RefreshOutline" /></template>
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NButton, NIcon } from 'naive-ui'
import { RemoveOutline, AddOutline, ScanOutline, RefreshOutline } from '@vicons/ionicons5'

defineProps<{ url: string; fileName: string }>()

const scale = ref(1)
const rotate = ref(0)
const translateX = ref(0)
const translateY = ref(0)

let isDragging = false
let dragStart = { x: 0, y: 0, tx: 0, ty: 0 }

const imgStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value}) rotate(${rotate.value}deg)`,
  cursor: isDragging ? 'grabbing' : 'grab',
  transition: isDragging ? 'none' : 'transform 0.15s ease',
}))

function zoomIn() { scale.value = Math.min(scale.value * 1.25, 10) }
function zoomOut() { scale.value = Math.max(scale.value / 1.25, 0.1) }
function resetView() { scale.value = 1; rotate.value = 0; translateX.value = 0; translateY.value = 0 }

function handleWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.min(Math.max(scale.value * delta, 0.1), 10)
}

function startDrag(e: MouseEvent) {
  isDragging = true
  dragStart = { x: e.clientX, y: e.clientY, tx: translateX.value, ty: translateY.value }

  const onMove = (ev: MouseEvent) => {
    if (!isDragging) return
    translateX.value = dragStart.tx + (ev.clientX - dragStart.x)
    translateY.value = dragStart.ty + (ev.clientY - dragStart.y)
  }

  const onUp = () => {
    isDragging = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.image-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.image-preview__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
}

.image-preview__controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0,0,0,0.6);
  padding: 6px 12px;
  border-radius: 20px;
  backdrop-filter: blur(8px);
}

.image-preview__zoom {
  font-size: 13px;
  color: #fff;
  min-width: 48px;
  text-align: center;
}
</style>
