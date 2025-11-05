<template>
  <div class="flex items-center justify-center" :class="containerClass">
    <div v-if="type === 'spinner'" :class="['animate-spin rounded-full border-t-transparent', spinnerClasses]"></div>
    <div v-else-if="type === 'dots'" class="flex gap-2">
      <div
        v-for="i in 3"
        :key="i"
        :class="['h-3 w-3 animate-bounce rounded-full', dotClasses]"
        :style="{ animationDelay: `${i * 0.1}s` }"
      ></div>
    </div>
    <div v-else-if="type === 'pulse'" :class="['animate-pulse rounded-full', pulseClasses]"></div>
    <div v-else-if="type === 'bars'" class="flex gap-1">
      <div
        v-for="i in 4"
        :key="i"
        :class="['w-1 animate-pulse rounded-full', barClasses]"
        :style="{ animationDelay: `${i * 0.15}s`, height: `${12 + i * 2}px` }"
      ></div>
    </div>
    <span v-if="text" class="ml-3 text-sm font-medium" :class="textClasses">{{ text }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: {
    type: String,
    default: 'spinner',
    validator: (value) => ['spinner', 'dots', 'pulse', 'bars'].includes(value)
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg', 'xl'].includes(value)
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'white', 'gray'].includes(value)
  },
  text: {
    type: String,
    default: ''
  },
  containerClass: {
    type: String,
    default: ''
  }
})

const spinnerClasses = computed(() => {
  const sizes = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
    xl: 'h-16 w-16 border-4'
  }

  const variants = {
    primary: 'border-primary-500',
    secondary: 'border-secondary-500',
    white: 'border-white',
    gray: 'border-gray-500'
  }

  return `${sizes[props.size]} ${variants[props.variant]}`
})

const dotClasses = computed(() => {
  const variants = {
    primary: 'bg-primary-500',
    secondary: 'bg-secondary-500',
    white: 'bg-white',
    gray: 'bg-gray-500'
  }
  return variants[props.variant]
})

const pulseClasses = computed(() => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16'
  }

  const variants = {
    primary: 'bg-primary-500',
    secondary: 'bg-secondary-500',
    white: 'bg-white',
    gray: 'bg-gray-500'
  }

  return `${sizes[props.size]} ${variants[props.variant]}`
})

const barClasses = computed(() => {
  const variants = {
    primary: 'bg-primary-500',
    secondary: 'bg-secondary-500',
    white: 'bg-white',
    gray: 'bg-gray-500'
  }
  return variants[props.variant]
})

const textClasses = computed(() => {
  const variants = {
    primary: 'text-primary-600 dark:text-primary-400',
    secondary: 'text-secondary-600 dark:text-secondary-400',
    white: 'text-white',
    gray: 'text-gray-600 dark:text-gray-400'
  }
  return variants[props.variant]
})
</script>
