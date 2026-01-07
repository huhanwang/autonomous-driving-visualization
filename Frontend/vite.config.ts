import { defineConfig } from 'vite' // loadEnv 也不需要了，除非你有其他环境变量
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import path from 'node:path' // 建议显式引入 path 模块

import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      // ✅ 直接指向 src/drivers/schema/index.ts
      '@/driver': fileURLToPath(new URL('./src/drivers/schema/index.ts', import.meta.url)),
      
      // 标准 @ 别名
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: '../Backend/build/bin/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
  }
})