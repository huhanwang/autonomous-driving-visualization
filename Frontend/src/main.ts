import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'splitpanes/dist/splitpanes.css'

import App from './App.vue'
import '@/assets/styles/main.css'


const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(ElementPlus)

// main.ts
import { DataBus } from '@/core'

// 创建单例
const dataBus = new DataBus({
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:9002',
  reconnect: true,
  // 修改为：读取自定义的 VITE_DEBUG 变量，如果是字符串 'true' 才开启
  debug: false
})

// 挂载到全局
if (import.meta.env.DEV) {
  ;(window as any).dataBus = dataBus
}

console.log('✅ DataBus initialized')

// ✨ 将 dataBus 挂载到全局（方便调试）
if (import.meta.env.DEV) {
  ;(window as any).dataBus = dataBus
}

app.mount('#app')