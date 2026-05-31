<template>
  <div class="mb-4 sm:mb-6">
    <!-- 移动端下拉选择器 -->
    <div class="block rounded-xl bg-white/10 p-2 backdrop-blur-sm dark:bg-gray-800/20 sm:hidden">
      <select
        class="focus:ring-primary-color w-full rounded-lg bg-white/90 px-4 py-3 font-semibold text-gray-700 focus:outline-none focus:ring-2 dark:bg-gray-800/90 dark:text-gray-200 dark:focus:ring-indigo-400"
        :value="activeTab"
        @change="$emit('tab-change', $event.target.value)"
      >
        <option v-for="tab in tabs" :key="tab.key" :value="tab.key">
          {{ tab.name }}
        </option>
      </select>
    </div>

    <!-- 桌面端标签栏 -->
    <div
      class="hidden flex-wrap gap-2 rounded-2xl bg-white/10 p-2 backdrop-blur-sm dark:bg-gray-800/20 sm:flex"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="[
          'tab-btn flex-1 px-3 py-2 text-xs font-semibold transition-all duration-300 sm:px-4 sm:py-3 sm:text-sm md:px-6',
          activeTab === tab.key
            ? 'active'
            : 'text-gray-700 hover:bg-white/10 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700/30 dark:hover:text-gray-100'
        ]"
        @click="$emit('tab-change', tab.key)"
      >
        <i :class="tab.icon + ' mr-1 sm:mr-2'" />
        <span class="hidden md:inline">{{ tab.name }}</span>
        <span class="md:hidden">{{ tab.shortName || tab.name }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

defineProps({
  activeTab: {
    type: String,
    required: true
  }
})

defineEmits(['tab-change'])

const authStore = useAuthStore()
const { t } = useI18n()

// 根据 LDAP 配置动态生成 tabs
const tabs = computed(() => {
  const baseTabs = [
    {
      key: 'dashboard',
      name: t('nav.dashboard'),
      shortName: t('nav.short.dashboard'),
      icon: 'fas fa-tachometer-alt'
    },
    {
      key: 'apiKeys',
      name: t('nav.apiKeys'),
      shortName: t('nav.short.apiKeys'),
      icon: 'fas fa-key'
    },
    {
      key: 'accounts',
      name: t('nav.accounts'),
      shortName: t('nav.short.accounts'),
      icon: 'fas fa-user-circle'
    },
    {
      key: 'requestDetails',
      name: t('nav.requestDetails'),
      shortName: t('nav.short.requestDetails'),
      icon: 'fas fa-table'
    },
    {
      key: 'quotaCards',
      name: t('nav.quotaCards'),
      shortName: t('nav.short.quotaCards'),
      icon: 'fas fa-ticket-alt'
    }
  ]

  // 只有在 LDAP 启用时才显示用户管理
  if (authStore.oemSettings?.ldapEnabled) {
    baseTabs.push({
      key: 'userManagement',
      name: t('nav.userManagement'),
      shortName: t('nav.short.userManagement'),
      icon: 'fas fa-users'
    })
  }

  baseTabs.push({
    key: 'settings',
    name: t('nav.settings'),
    shortName: t('nav.short.settings'),
    icon: 'fas fa-cogs'
  })

  return baseTabs
})
</script>
