<template>
  <div class="favorites-view">
    <div class="favorites-view__inner">
      <h2 class="favorites-view__title">收藏夹</h2>
      <n-empty v-if="!fileStore.favorites.length" description="暂无收藏" />

      <div v-else class="favorites-list">
        <div
          v-for="fav in fileStore.favorites"
          :key="fav.id"
          class="fav-item"
        >
          <n-icon :component="StarFilled" color="#f0a020" />
          <div class="fav-item__info" @click="navigate(fav)">
            <span class="fav-item__name">{{ fav.displayName ?? keyToName(fav.key) }}</span>
            <span class="fav-item__path">{{ fav.bucket }} / {{ fav.key }}</span>
          </div>
          <n-button
            size="tiny"
            text
            type="error"
            @click="fileStore.toggleFavorite(fav.accountId, fav.bucket, fav.key)"
          >
            取消收藏
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NEmpty, NIcon, NButton } from 'naive-ui'
import { Star as StarFilled } from '@vicons/ionicons5'
import { useFileStore } from '@/stores/files'
import { keyToName } from '@/utils/format'
import type { FavoriteItem } from '@/types'

const router = useRouter()
const fileStore = useFileStore()

onMounted(() => fileStore.loadFavorites())

function navigate(fav: FavoriteItem) {
  const prefix = fav.key.includes('/')
    ? fav.key.substring(0, fav.key.lastIndexOf('/') + 1)
    : ''
  router.push({
    name: 'Explorer',
    params: { accountId: fav.accountId, bucket: fav.bucket },
    query: { prefix },
  })
}
</script>

<style scoped>
.favorites-view { height: 100%; overflow-y: auto; }
.favorites-view__inner { padding: 24px; max-width: 900px; margin: 0 auto; }
.favorites-view__title { font-size: 22px; font-weight: 700; margin-bottom: 20px; }

.favorites-list { display: flex; flex-direction: column; gap: 8px; }

.fav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid rgba(128,128,128,0.1);
  transition: background 0.15s;
}

.fav-item:hover { background: rgba(128,128,128,0.05); }

.fav-item__info { flex: 1; cursor: pointer; min-width: 0; }

.fav-item__name {
  font-size: 14px;
  font-weight: 500;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fav-item__path {
  font-size: 12px;
  opacity: 0.5;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
