import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/user'
import i18n from './i18n'
import './assets/styles/main.css'
import './assets/styles/global.css'

// 创建Vue应用
const app = createApp(App)

// 使用Pinia状态管理
const pinia = createPinia()
app.use(pinia)

// 使用路由
app.use(router)

// 使用Vue I18n
app.use(i18n)

// 使用Element Plus - 语言配置在 App.vue 中通过 ElConfigProvider 处理
app.use(ElementPlus)

// 设置axios拦截器
const userStore = useUserStore()
userStore.setupAxiosInterceptors()

// 挂载应用
app.mount('#app')
