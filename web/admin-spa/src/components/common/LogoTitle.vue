<template>
  <div class="logo-title-wrapper">
    <!-- Logo区域 -->
    <div
      class="logo-container !border !border-gray-200 !bg-white dark:!border-gray-700 dark:!bg-gray-900"
    >
      <template v-if="!loading">
        <img v-if="logoSrc" alt="Logo" class="logo-image" :src="logoSrc" @error="handleLogoError" />
        <i v-else class="fas fa-cloud logo-icon !text-gray-600 dark:!text-gray-400" />
      </template>
      <div v-else class="logo-skeleton !bg-gray-200 dark:!bg-gray-700" />
    </div>

    <!-- 标题区域 -->
    <div class="title-section">
      <div class="title-row">
        <template v-if="!loading && title">
          <h1 class="site-title !text-gray-900 dark:!text-white">
            {{ title }}
          </h1>
        </template>
        <div v-else-if="loading" class="title-skeleton !bg-gray-200 dark:!bg-gray-700" />
        <!-- 插槽用于版本信息等额外内容 -->
        <slot name="after-title" />
      </div>
      <p v-if="subtitle" class="site-subtitle !text-gray-600 dark:!text-gray-400">
        {{ subtitle }}
      </p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  logoSrc: {
    type: String,
    default: ''
  }
})

// 处理图片加载错误
const handleLogoError = (e) => {
  e.target.style.display = 'none'
}
</script>

<style scoped>
/* ============================================
   LOGO TITLE COMPONENT - DARK MODE READY
   ============================================ */
.logo-title-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* Logo Container */
.logo-container {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease;
}

.logo-image {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.logo-icon {
  font-size: 20px;
  transition: color 0.3s ease;
}

/* Logo Skeleton */
.logo-skeleton {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  transition: background-color 0.3s ease;
}

/* Title Section */
.title-section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 48px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.site-title {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
  margin: 0;
  letter-spacing: -0.02em;
  transition: color 0.3s ease;
}

.site-subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.4;
  transition: color 0.3s ease;
}

/* Title Skeleton */
.title-skeleton {
  width: 256px;
  height: 32px;
  border-radius: 6px;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  transition: background-color 0.3s ease;
}

/* Pulse Animation */
@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* ============================================
   RESPONSIVE
   ============================================ */
@media (max-width: 768px) {
  .logo-title-wrapper {
    gap: 12px;
  }

  .logo-container {
    width: 40px;
    height: 40px;
  }

  .logo-image {
    width: 24px;
    height: 24px;
  }

  .logo-icon {
    font-size: 18px;
  }

  .site-title {
    font-size: 20px;
  }

  .site-subtitle {
    font-size: 13px;
  }

  .title-skeleton {
    width: 180px;
    height: 28px;
  }
}
</style>
