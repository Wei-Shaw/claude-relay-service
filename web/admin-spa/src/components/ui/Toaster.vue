<template>
  <Sonner
    class="toaster"
    :close-button="closeButton"
    :position="position"
    :rich-colors="richColors"
    :theme="theme"
    :toast-options="{
      classNames: {
        toast: 'group toast rounded-lg border-l-4 shadow-lg bg-white dark:bg-[#1f1f1f]',
        title: 'text-sm font-semibold text-gray-900 dark:text-gray-100',
        description: 'text-sm text-gray-600 dark:text-gray-400',
        actionButton:
          'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900',
        cancelButton:
          'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100',
        closeButton: 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
        success: 'border-l-blue-500',
        error: 'border-l-red-500',
        warning: 'border-l-yellow-500',
        info: 'border-l-blue-500'
      }
    }"
  >
    <template #success-icon>
      <i class="fas fa-check-circle text-lg text-blue-500" />
    </template>
    <template #error-icon>
      <i class="fas fa-exclamation-circle text-lg text-red-500" />
    </template>
    <template #warning-icon>
      <i class="fas fa-exclamation-triangle text-lg text-yellow-500" />
    </template>
    <template #info-icon>
      <i class="fas fa-info-circle text-lg text-blue-500" />
    </template>
    <template #loading-icon>
      <i class="fas fa-spinner fa-spin text-lg text-blue-500" />
    </template>
  </Sonner>
</template>

<script setup>
import { computed } from 'vue'
import { Toaster as Sonner } from 'sonner'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()

defineProps({
  position: {
    type: String,
    default: 'top-right'
  },
  richColors: {
    type: Boolean,
    default: false
  },
  closeButton: {
    type: Boolean,
    default: true
  }
})

const theme = computed(() => (themeStore.isDarkMode ? 'dark' : 'light'))
</script>

<style>
/* Sonner Toast Styles */
.toaster {
  --normal-bg: white;
  --normal-border: #eaeaea;
  --normal-text: #000;
}

:global(.dark) .toaster {
  --normal-bg: #1f1f1f;
  --normal-border: #333;
  --normal-text: #fff;
}

/* Toast container positioning */
[data-sonner-toaster] {
  z-index: var(--z-toast, 100) !important;
}

/* Individual toast styling */
[data-sonner-toast] {
  background: var(--normal-bg) !important;
  border: 1px solid var(--normal-border) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
}

:global(.dark) [data-sonner-toast] {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

/* Toast icon spacing */
[data-icon] {
  margin-right: 12px;
}

/* Close button styling */
[data-close-button] {
  color: #9ca3af !important;
  border-color: var(--normal-border) !important;
}

[data-close-button]:hover {
  background: #fafafa !important;
  color: #666 !important;
}

:global(.dark) [data-close-button]:hover {
  background: #2a2a2a !important;
  color: #999 !important;
}

/* Loading spinner animation */
[data-sonner-toast] .fa-spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
