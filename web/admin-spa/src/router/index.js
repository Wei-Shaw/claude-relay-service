import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { APP_CONFIG } from '@/config/app'

// 路由懒加载
const LoginView = () => import('@/views/LoginView.vue')
const MainLayout = () => import('@/components/layout/MainLayout.vue')
const DashboardView = () => import('@/views/DashboardView.vue')
const ApiKeysView = () => import('@/views/ApiKeysView.vue')
const AccountsView = () => import('@/views/AccountsView.vue')
const TutorialView = () => import('@/views/TutorialView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')
const ApiStatsView = () => import('@/views/ApiStatsView.vue')

const routes = [
  {
    path: '/',
    redirect: '/api-stats'
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresAuth: false }
  },
  {
    path: '/api-stats',
    name: 'ApiStats',
    component: ApiStatsView,
    meta: { requiresAuth: false }
  },
  {
    path: '/dashboard',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: DashboardView
      }
    ]
  },
  {
    path: '/api-keys',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'ApiKeys',
        component: ApiKeysView
      }
    ]
  },
  {
    path: '/accounts',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Accounts',
        component: AccountsView
      }
    ]
  },
  {
    path: '/tutorial',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Tutorial',
        component: TutorialView
      }
    ]
  },
  {
    path: '/settings',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Settings',
        component: SettingsView
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(APP_CONFIG.basePath),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  console.log('路由导航:', {
    to: to.path,
    from: from.path,
    requiresAuth: to.meta.requiresAuth,
    isAuthenticated: authStore.isAuthenticated
  })
  
  // API Stats 页面不需要认证，直接放行
  if (to.path === '/api-stats' || to.path.startsWith('/api-stats')) {
    next()
  } else if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router