// router/index.ts

import { createRouter, createWebHistory } from 'vue-router'
import PlaybackView from '@/views/PlaybackView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'playback',
      component: PlaybackView,
      meta: {
        title: 'Pack数据回放'
      }
    },
    // 可以添加其他路由
    // {
    //   path: '/about',
    //   name: 'about',
    //   component: () => import('@/views/AboutView.vue')
    // }
  ]
})

// 路由守卫 - 设置页面标题
router.beforeEach((to, from, next) => {
  const title = to.meta.title as string
  if (title) {
    document.title = title
  }
  next()
})

export default router