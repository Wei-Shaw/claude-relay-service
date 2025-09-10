<template>
  <div class="language-switch" :class="containerClass">
    <!-- 下拉菜单模式 -->
    <div v-if="mode === 'dropdown'" class="relative">
      <button
        ref="dropdownTrigger"
        class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white/80 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:border-gray-500"
        @click="toggleDropdown"
      >
        <span>{{ currentLocaleInfo.flag }}</span>
        <i
          :class="[
            'fas fa-chevron-down text-xs transition-transform duration-200',
            showDropdown ? 'rotate-180' : ''
          ]"
        />
      </button>

      <!-- 下拉选项 -->
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-75 ease-in"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
      >
        <div
          v-if="showDropdown"
          class="absolute right-0 top-full z-50 mt-2 w-40 rounded-lg border border-gray-200 bg-white py-2 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        >
          <button
            v-for="locale in supportedLocales"
            :key="locale.code"
            class="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            :class="{
              'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400':
                locale.code === localeStore.currentLocale
            }"
            @click="switchLocale(locale.code)"
          >
            <span class="text-base font-medium">{{ locale.flag }}</span>
            <span class="flex-1 text-left">{{ locale.name }}</span>
            <i
              v-if="locale.code === localeStore.currentLocale"
              class="fas fa-check text-xs text-blue-600 dark:text-blue-400"
            />
          </button>
        </div>
      </transition>
    </div>

    <!-- 按钮模式 -->
    <div v-else-if="mode === 'button'" class="flex items-center gap-1">
      <button
        v-for="locale in supportedLocales"
        :key="locale.code"
        class="flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-all duration-200"
        :class="[
          locale.code === localeStore.currentLocale
            ? 'bg-blue-500 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
        ]"
        @click="switchLocale(locale.code)"
      >
        <span>{{ locale.flag }}</span>
      </button>
    </div>

    <!-- 图标模式 -->
    <div v-else-if="mode === 'icon'" class="relative">
      <button
        class="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-all duration-200 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        @click="toggleDropdown"
      >
        <span class="text-lg">{{ currentLocaleInfo.flag }}</span>
      </button>

      <!-- 简化的下拉选项 -->
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-75 ease-in"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
      >
        <div
          v-if="showDropdown"
          class="absolute right-0 top-full z-50 mt-2 w-36 rounded-lg border border-gray-200 bg-white py-2 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        >
          <button
            v-for="locale in supportedLocales"
            :key="locale.code"
            class="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            :class="{
              'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400':
                locale.code === localeStore.currentLocale
            }"
            @click="switchLocale(locale.code)"
          >
            <span class="font-medium">{{ locale.flag }}</span>
            <span>{{ locale.name }}</span>
          </button>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocaleStore } from '@/stores/locale'

// 定义组件属性
const props = defineProps({
  mode: {
    type: String,
    default: 'dropdown', // dropdown | button | icon
    validator: (value) => ['dropdown', 'button', 'icon'].includes(value)
  },
  size: {
    type: String,
    default: 'medium', // small | medium | large
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  }
})

// 发出事件
const emit = defineEmits(['change'])

// 存储和响应式数据
const { t } = useI18n()
const localeStore = useLocaleStore()
const showDropdown = ref(false)
const dropdownTrigger = ref(null)

// 计算属性
const currentLocaleInfo = computed(() => localeStore.getCurrentLocaleInfo(t))
const supportedLocales = computed(() => localeStore.getSupportedLocales(t))

const containerClass = computed(() => {
  const classes = []

  if (props.size === 'small') {
    classes.push('text-xs')
  } else if (props.size === 'large') {
    classes.push('text-base')
  }

  return classes
})

// 切换语言
const switchLocale = (locale) => {
  localeStore.setLocale(locale)
  showDropdown.value = false
  emit('change', locale)
}

// 切换下拉菜单显示
const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value
}

// 点击外部关闭下拉菜单
const handleClickOutside = (event) => {
  if (dropdownTrigger.value && !dropdownTrigger.value.contains(event.target)) {
    showDropdown.value = false
  }
}

// 生命周期
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.language-switch {
  /* 自定义样式可以在这里添加 */
}
</style>
