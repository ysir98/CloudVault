import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue'),
    meta: { title: '概览' },
  },
  {
    path: '/explorer/:accountId/:bucket',
    name: 'Explorer',
    component: () => import('@/views/Explorer.vue'),
    meta: { title: '文件浏览器' },
  },
  {
    path: '/favorites',
    name: 'Favorites',
    component: () => import('@/views/Favorites.vue'),
    meta: { title: '收藏夹' },
  },
  {
    path: '/trash/:accountId',
    name: 'Trash',
    component: () => import('@/views/Trash.vue'),
    meta: { title: '回收站' },
  },
  {
    path: '/transfer',
    name: 'Transfer',
    component: () => import('@/views/Transfer.vue'),
    meta: { title: '传输列表' },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
    meta: { title: '设置' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} — CloudVault` : 'CloudVault'
})
