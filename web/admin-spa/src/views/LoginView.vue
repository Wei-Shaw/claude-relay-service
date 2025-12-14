<template>
  <div class="login-page" :class="{ dark: isDarkMode }">
    <!-- Header -->
    <header class="login-header">
      <div class="header-logo">
        <template v-if="!oemLoading">
          <img
            v-if="authStore.oemSettings.siteIconData || authStore.oemSettings.siteIcon"
            alt="Logo"
            class="logo-image"
            :src="authStore.oemSettings.siteIconData || authStore.oemSettings.siteIcon"
            @error="(e) => (e.target.style.display = 'none')"
          />
          <i v-else class="fas fa-cloud text-xl text-gray-900 dark:text-white" />
        </template>
      </div>
      <ThemeToggle mode="dropdown" />
    </header>

    <!-- Main Content -->
    <main class="login-main">
      <div class="login-content">
        <!-- Title -->
        <div class="login-title-section">
          <template v-if="!oemLoading && authStore.oemSettings.siteName">
            <h1 class="login-title">登录到 {{ authStore.oemSettings.siteName }}</h1>
          </template>
          <div
            v-else-if="oemLoading"
            class="mx-auto h-9 w-64 animate-pulse rounded bg-gray-300/50"
          />
        </div>

        <!-- Login Form -->
        <form class="login-form" @submit.prevent="handleLogin">
          <div class="form-group">
            <input
              id="username"
              v-model="loginForm.username"
              autocomplete="username"
              class="vercel-input"
              name="username"
              placeholder="用户名"
              required
              type="text"
            />
          </div>

          <div class="form-group">
            <input
              id="password"
              v-model="loginForm.password"
              autocomplete="current-password"
              class="vercel-input"
              name="password"
              placeholder="密码"
              required
              type="password"
            />
          </div>

          <button class="vercel-button" :disabled="authStore.loginLoading" type="submit">
            <span v-if="authStore.loginLoading" class="button-spinner"></span>
            {{ authStore.loginLoading ? '登录中...' : '登录' }}
          </button>
        </form>

        <!-- Error Message -->
        <div v-if="authStore.loginError" class="error-message">
          <i class="fas fa-exclamation-circle mr-2" />{{ authStore.loginError }}
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import ThemeToggle from '@/components/common/ThemeToggle.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const isDarkMode = computed(() => themeStore.isDarkMode)
const oemLoading = computed(() => authStore.oemLoading)

const loginForm = ref({
  username: '',
  password: ''
})

onMounted(() => {
  // 初始化主题
  themeStore.initTheme()
  // 加载OEM设置
  authStore.loadOemSettings()
})

const handleLogin = async () => {
  await authStore.login(loginForm.value)
}
</script>

<style scoped>
/* Vercel-inspired Login Page */
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}

.login-page.dark {
  background: #000;
}

/* Header */
.login-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  min-height: 64px;
  padding: 0 1rem;
  background: transparent;
}

@media (min-width: 768px) {
  .login-header {
    padding: 0 1.5rem;
  }
}

.header-logo {
  display: flex;
  align-items: center;
  height: 24px;
}

.logo-image {
  height: 24px;
  width: auto;
  object-fit: contain;
}

/* Main Content */
.login-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}

.login-content {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Title */
.login-title-section {
  text-align: center;
  margin-bottom: 0.5rem;
}

.login-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #000;
  letter-spacing: -0.02em;
  margin: 0;
}

.login-page.dark .login-title {
  color: #fff;
}

/* Form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

/* Vercel-style Input */
.vercel-input {
  width: 100%;
  height: 48px;
  padding: 0 1rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #000;
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 5px;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.vercel-input::placeholder {
  color: #999;
}

.vercel-input:hover {
  border-color: #000;
}

.vercel-input:focus {
  border-color: #000;
  box-shadow: 0 0 0 1px #000;
}

.login-page.dark .vercel-input {
  color: #fff;
  background: #000;
  border-color: #333;
}

.login-page.dark .vercel-input::placeholder {
  color: #666;
}

.login-page.dark .vercel-input:hover {
  border-color: #fff;
}

.login-page.dark .vercel-input:focus {
  border-color: #fff;
  box-shadow: 0 0 0 1px #fff;
}

/* Vercel-style Button */
.vercel-button {
  width: 100%;
  height: 48px;
  padding: 0 1.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #fff;
  background: #000;
  border: 1px solid #000;
  border-radius: 5px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  user-select: none;
  box-sizing: border-box;
}

.vercel-button:hover:not(:disabled) {
  background: #333;
  border-color: #333;
}

.vercel-button:active:not(:disabled) {
  background: #000;
  transform: scale(0.98);
}

.vercel-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-page.dark .vercel-button {
  color: #000;
  background: #fff;
  border-color: #fff;
}

.login-page.dark .vercel-button:hover:not(:disabled) {
  background: #e5e5e5;
  border-color: #e5e5e5;
}

.login-page.dark .vercel-button:active:not(:disabled) {
  background: #fff;
}

/* Button Spinner */
.button-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 0.6s linear infinite;
}

.login-page.dark .button-spinner {
  border-color: rgba(0, 0, 0, 0.3);
  border-top-color: #000;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Error Message */
.error-message {
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #e00;
  background: rgba(224, 0, 0, 0.1);
  border: 1px solid rgba(224, 0, 0, 0.2);
  border-radius: 5px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-page.dark .error-message {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
  border-color: rgba(255, 107, 107, 0.2);
}
</style>
