import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const driverName = env.VITE_DATA_DRIVER || 'pack'

  console.log(`🚗 Loading Data Driver: [${driverName}]`)
  
  // 构建驱动文件的绝对路径
  const driverPath = fileURLToPath(new URL(`./src/drivers/${driverName}/index.ts`, import.meta.url))
  console.log(`📍 Driver Path: ${driverPath}`)

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
        // ✅ [修复 1] 优先匹配更具体的别名 (@/driver 指向动态计算的路径)
        '@/driver': driverPath,
        
        // ✅ [修复 2] 标准 @ 别名，指向 src 目录
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    // 👇 新增/修改 Build 配置 👇
    build: {
      // 1. 设置输出路径: 从 Frontend 跳出到 Backend/3rdparty/dist
      outDir: '../Backend/3rdparty/dist',

      // 2. 允许清空输出目录 (因为该目录在项目根目录 Frontend 之外，必须显式开启)
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      host: true,
    }
  }
})