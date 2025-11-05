<template>
  <span
    :class="[
      'inline-flex items-center gap-1 font-medium transition-all duration-300',
      sizeClasses,
      variantClasses,
      dot && 'pl-2',
      className
    ]"
  >
    <span v-if="dot" class="h-2 w-2 animate-pulse rounded-full" :class="dotColorClasses"></span>
    <slot />
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'default',
    validator: (value) =>
      [
        'default',
        'primary',
        'secondary',
        'success',
        'warning',
        'danger',
        'info',
        'gradient-primary',
        'gradient-secondary'
      ].includes(value)
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  dot: {
    type: Boolean,
    default: false
  },
  className: {
    type: String,
    default: ''
  }
})

const sizeClasses = computed(() => {
  const sizes = {
    sm: 'px-2 py-0.5 text-xs rounded-md',
    md: 'px-2.5 py-1 text-sm rounded-lg',
    lg: 'px-3 py-1.5 text-base rounded-xl'
  }
  return sizes[props.size]
})

const variantClasses = computed(() => {
  const variants = {
    default: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
    secondary:
      'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-300',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'gradient-primary':
      'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30',
    'gradient-secondary':
      'bg-gradient-to-r from-secondary-500 to-secondary-600 text-white shadow-lg shadow-secondary-500/30'
  }
  return variants[props.variant]
})

const dotColorClasses = computed(() => {
  const colors = {
    default: 'bg-gray-500',
    primary: 'bg-primary-500',
    secondary: 'bg-secondary-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    info: 'bg-blue-500',
    'gradient-primary': 'bg-white',
    'gradient-secondary': 'bg-white'
  }
  return colors[props.variant]
})
</script>
