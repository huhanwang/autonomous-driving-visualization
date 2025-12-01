// Frontend/vite.config.ts

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
// ❌ 删除: import path from 'node:path' (不需要它了，统一用 fileURLToPath)

import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const driverName = env.VITE_DATA_DRIVER || 'pack'

  console.log(`🚗 Loading Data Driver: [${driverName}]`)
  
  // 构建驱动文件的绝对路径
  const driverPath = fileURLToPath(new URL(`./src/drivers/${driverName}/index.ts`, import.meta.url))
  console.log(`📍 Driver Path: ${driverPath}`) // 打印出来方便调试

  return {
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
        // ✅ [修复 1] 优先匹配更具体的别名
        '@/driver': driverPath,
        
        // ✅ [修复 2] 使用统一的 URL 转换方式，不再混用 path.resolve
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: 5173,
      host: true,
    }
  }
})