<template>
  <div class="mb-4 sm:mb-6">
    <!-- 标签栏：移动端横向滑动，桌面端平铺 -->
    <div
      ref="scrollContainer"
      class="tab-scroll flex gap-2 overflow-x-auto rounded-2xl bg-white/10 p-2 backdrop-blur-sm dark:bg-gray-800/20 md:flex-wrap md:overflow-x-visible"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="[
          'tab-btn flex-none whitespace-nowrap px-3 py-2 text-sm font-semibold transition-all duration-300 sm:px-4 sm:py-3 md:flex-1 md:px-6',
          activeTab === tab.key
            ? 'active'
            : 'text-gray-700 hover:bg-white/10 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700/30 dark:hover:text-gray-100'
        ]"
        @click="$emit('tab-change', tab.key)"
      >
        <i :class="tab.icon + ' mr-1 sm:mr-2'" />
        {{ tab.name }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  activeTab: {
    type: String,
    required: true
  }
})

defineEmits(['tab-change'])

const authStore = useAuthStore()
const scrollContainer = ref(null)

// 根据 LDAP 配置动态生成 tabs
const tabs = computed(() => {
  const baseTabs = [
    { key: 'dashboard', name: '仪表板', icon: 'fas fa-tachometer-alt' },
    { key: 'apiKeys', name: 'API Keys', icon: 'fas fa-key' },
    { key: 'accounts', name: '账户管理', icon: 'fas fa-user-circle' },
    { key: 'requestDetails', name: '请求明细', icon: 'fas fa-table' },
    { key: 'quotaCards', name: '额度卡', icon: 'fas fa-ticket-alt' },
    { key: 'paymentManage', name: '支付管理', icon: 'fas fa-credit-card' },
    { key: 'proxyPool', name: '代理池', icon: 'fas fa-server' }
  ]

  // 只有在 LDAP 启用时才显示用户管理
  if (authStore.oemSettings?.ldapEnabled) {
    baseTabs.push({ key: 'userManagement', name: '用户管理', icon: 'fas fa-users' })
  }

  baseTabs.push({ key: 'settings', name: '系统设置', icon: 'fas fa-cogs' })

  return baseTabs
})

// 移动端横向滑动时，把当前选中的标签滚动到可见区域中央
const scrollActiveIntoView = () => {
  nextTick(() => {
    const container = scrollContainer.value
    if (!container) return
    const active = container.querySelector('.tab-btn.active')
    if (!active) return
    const current = active.getBoundingClientRect().left - container.getBoundingClientRect().left
    const target = (container.clientWidth - active.offsetWidth) / 2
    container.scrollTo({ left: container.scrollLeft + current - target, behavior: 'smooth' })
  })
}

watch(() => props.activeTab, scrollActiveIntoView)
onMounted(scrollActiveIntoView)
</script>

<style scoped>
/* 移动端横向滑动时隐藏滚动条 */
.tab-scroll {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.tab-scroll::-webkit-scrollbar {
  display: none;
}
</style>
