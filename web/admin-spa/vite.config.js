import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import checker from 'vite-plugin-checker'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:3000'
  const httpProxy = env.VITE_HTTP_PROXY || env.HTTP_PROXY || env.http_proxy
  // 使用环境变量配置基础路径，如果未设置则使用默认值
  const basePath = env.VITE_APP_BASE_URL || (mode === 'development' ? '/admin/' : '/admin-next/')

  // 创建代理配置
  const proxyConfig = {
    target: apiTarget,
    changeOrigin: true,
    secure: false
  }

  // 如果设置了代理，动态导入并配置 agent（仅在开发模式下）
  if (httpProxy && mode === 'development') {
    console.log(`Using HTTP proxy: ${httpProxy}`)
    // Vite 的 proxy 使用 http-proxy，它支持通过环境变量自动使用代理
    // 设置环境变量让 http-proxy 使用代理
    process.env.HTTP_PROXY = httpProxy
    process.env.HTTPS_PROXY = httpProxy
  }

  console.log(
    `${mode === 'development' ? 'Starting dev server' : 'Building'} with base path: ${basePath}`
  )

  return {
    base: basePath,
    plugins: [
      vue(),
      checker({
        eslint: {
          lintCommand: 'eslint "./src/**/*.{js,vue}" --cache=false',
          dev: {
            logLevel: ['error', 'warning']
          }
        }
      }),
      AutoImport({
        resolvers: [ElementPlusResolver()],
        imports: ['vue', 'vue-router', 'pinia']
      }),
      Components({
        resolvers: [ElementPlusResolver()]
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: 3001,
      host: true,
      open: true,
      proxy: {
        // 统一的 API 代理规则 - 开发环境所有 API 请求都加 /webapi 前缀
        '/webapi': {
          ...proxyConfig,
          rewrite: (path) => path.replace(/^\/webapi/, ''), // 转发时去掉 /webapi 前缀
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log(
                'Proxying:',
                req.method,
                req.url,
                '->',
                options.target + req.url.replace(/^\/webapi/, '')
              )
            })
            proxy.on('error', (err) => {
              console.log('Proxy error:', err)
            })
          }
        },
        // API Stats 专用代理规则
        '/apiStats': {
          ...proxyConfig,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log(
                'API Stats Proxying:',
                req.method,
                req.url,
                '->',
                options.target + req.url
              )
            })
          }
        }
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          manualChunks(id) {
            // 将 vue 相关的库打包到一起
            if (id.includes('node_modules')) {
              if (id.includes('element-plus')) {
                return 'element-plus'
              }
              if (id.includes('chart.js')) {
                return 'chart'
              }
              if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) {
                return 'vue-vendor'
              }
              return 'vendor'
            }
          }
        }
      }
    }
  }
})
