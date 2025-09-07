import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUserStore } from '@/stores/user'
import { APP_CONFIG } from '@/config/app'

// 路由懒加载
const LandingView = () => import('@/views/LandingView.vue')
const DocsView = () => import('@/views/DocsView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const UserLoginView = () => import('@/views/UserLoginView.vue')
const UserDashboardView = () => import('@/views/UserDashboardView.vue')
const UserManagementView = () => import('@/views/UserManagementView.vue')
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
    name: 'Landing',
    component: LandingView,
    meta: { requiresAuth: false }
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresAuth: false }
  },
  {
    path: '/admin-login',
    redirect: '/login'
  },
  {
    path: '/user-login',
    name: 'UserLogin',
    component: UserLoginView,
    meta: { requiresAuth: false, userAuth: true }
  },
  {
    path: '/user-dashboard',
    name: 'UserDashboard',
    component: UserDashboardView,
    meta: { requiresUserAuth: true }
  },
  {
    path: '/docs',
    name: 'Docs',
    component: DocsView,
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
  },
  {
    path: '/user-management',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'UserManagement',
        component: UserManagementView
      }
    ]
  },
  // 捕获所有未匹配的路由
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(APP_CONFIG.basePath),
  routes
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  const userStore = useUserStore()

  console.log('路由导航:', {
    to: to.path,
    from: from.path,
    fullPath: to.fullPath,
    requiresAuth: to.meta.requiresAuth,
    requiresUserAuth: to.meta.requiresUserAuth,
    isAuthenticated: authStore.isAuthenticated,
    isUserAuthenticated: userStore.isAuthenticated
  })

  // 防止重定向循环：如果已经在目标路径，直接放行
  if (to.path === from.path && to.fullPath === from.fullPath) {
    return next()
  }

  // 检查用户认证状态
  if (to.meta.requiresUserAuth) {
    if (!userStore.isAuthenticated) {
      // 尝试检查本地存储的认证信息
      try {
        const isUserLoggedIn = await userStore.checkAuth()
        if (!isUserLoggedIn) {
          return next('/user-login')
        }
      } catch (error) {
        // If the error is about disabled account, redirect to login with error
        if (error.message && error.message.includes('disabled')) {
          // Import showToast to display the error
          const { showToast } = await import('@/utils/toast')
          showToast(error.message, 'error')
        }
        return next('/user-login')
      }
    }
    return next()
  }

  // 公开页面不需要认证，直接放行
  if (
    to.path === '/' ||
    to.path === '/docs' ||
    to.path === '/api-stats' ||
    to.path.startsWith('/api-stats')
  ) {
    next()
  } else if (to.path === '/user-login') {
    // 如果已经是用户登录状态，重定向到用户仪表板
    if (userStore.isAuthenticated) {
      next('/user-dashboard')
    } else {
      next()
    }
  } else if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
