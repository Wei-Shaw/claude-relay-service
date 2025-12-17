<template>
  <div class="relative inline-block">
    <!-- Trigger Button -->
    <button
      class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-800 dark:hover:text-gray-50 dark:focus-visible:ring-gray-800"
      :title="currentThemeLabel"
      @click="toggleDropdown"
    >
      <i v-if="themeStore.themeMode === 'light'" class="fas fa-sun text-amber-500" />
      <i v-else-if="themeStore.themeMode === 'dark'" class="fas fa-moon text-indigo-400" />
      <i v-else class="fas fa-circle-half-stroke text-gray-600 dark:text-gray-400" />
      <span class="sr-only">Toggle theme</span>
    </button>

    <!-- Dropdown Menu -->
    <transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950"
      >
        <div class="p-1">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-800 dark:focus:bg-gray-800"
            :class="{
              'bg-gray-100 dark:bg-gray-800': themeStore.themeMode === option.value
            }"
            @click="selectTheme(option.value)"
          >
            <i :class="[option.icon, 'mr-2 h-4 w-4 text-gray-600 dark:text-gray-400']" />
            <span class="text-gray-900 dark:text-gray-100">{{ option.label }}</span>
            <i
              v-if="themeStore.themeMode === option.value"
              class="fas fa-check ml-auto h-4 w-4 text-gray-900 dark:text-gray-100"
            />
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useThemeStore } from '@/stores/theme'

// Store
const themeStore = useThemeStore()

// State
const isOpen = ref(false)

// 主题选项配置
const themeOptions = [
  {
    value: 'light',
    label: 'Light',
    icon: 'fas fa-sun'
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: 'fas fa-moon'
  },
  {
    value: 'auto',
    label: 'System',
    icon: 'fas fa-circle-half-stroke'
  }
]

// Computed
const currentThemeLabel = computed(() => {
  const current = themeOptions.find((opt) => opt.value === themeStore.themeMode)
  return current ? `Current theme: ${current.label}` : 'Toggle theme'
})

// Methods
const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const selectTheme = (mode) => {
  themeStore.setThemeMode(mode)
  isOpen.value = false
}

const handleClickOutside = (event) => {
  const dropdown = event.target.closest('.relative')
  if (!dropdown && isOpen.value) {
    isOpen.value = false
  }
}

// Lifecycle
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
/* Screen reader only utility */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
