<template>
  <div
    :class="[
      'glass-card',
      'rounded-2xl p-6',
      'border border-white/20 dark:border-gray-700/50',
      'backdrop-blur-xl',
      'transition-all duration-300',
      hover && 'hover:scale-[1.02] hover:shadow-xl',
      clickable && 'cursor-pointer',
      className
    ]"
    :style="customStyle"
    @click="handleClick"
  >
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  hover: {
    type: Boolean,
    default: false
  },
  clickable: {
    type: Boolean,
    default: false
  },
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'primary', 'secondary', 'accent'].includes(value)
  },
  className: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['click'])

const customStyle = computed(() => {
  const variants = {
    default: {
      background: 'rgba(255, 255, 255, 0.1)',
      boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)'
    },
    primary: {
      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
      boxShadow: '0 8px 32px 0 rgba(102, 126, 234, 0.2)'
    },
    secondary: {
      background:
        'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(192, 132, 252, 0.1) 100%)',
      boxShadow: '0 8px 32px 0 rgba(168, 85, 247, 0.2)'
    },
    accent: {
      background:
        'linear-gradient(135deg, rgba(217, 70, 239, 0.1) 0%, rgba(240, 147, 251, 0.1) 100%)',
      boxShadow: '0 8px 32px 0 rgba(217, 70, 239, 0.2)'
    }
  }
  return variants[props.variant]
})

const handleClick = (event) => {
  if (props.clickable) {
    emit('click', event)
  }
}
</script>

<style scoped>
.glass-card {
  position: relative;
  overflow: hidden;
}

.glass-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  opacity: 0.5;
}

.dark .glass-card {
  background: rgba(0, 0, 0, 0.2) !important;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3) !important;
}

.dark .glass-card::before {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}
</style>
