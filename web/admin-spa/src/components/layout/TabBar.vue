<template>
  <div class="flex flex-wrap gap-2 mb-6 bg-white/10 rounded-2xl p-2 backdrop-blur-sm">
    <button 
      v-for="tab in tabs" 
      :key="tab.key"
      :class="[
        'tab-btn flex-1 py-3 px-6 text-sm font-semibold transition-all duration-300',
        activeTab === tab.key ? 'active' : 'text-gray-700 hover:bg-white/10 hover:text-gray-900'
      ]"
      @click="$emit('tab-change', tab.key)"
    >
      <i :class="tab.icon + ' mr-2'" />{{ tab.name }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  activeTab: {
    type: String,
    required: true
  }
})

defineEmits(['tab-change'])

const tabs = [
  { key: 'dashboard', name: '仪表板', icon: 'fas fa-tachometer-alt' },
  { key: 'apiKeys', name: 'API Keys', icon: 'fas fa-key' },
  { key: 'accounts', name: '账户管理', icon: 'fas fa-user-circle' },
  { key: 'tutorial', name: '使用教程', icon: 'fas fa-graduation-cap' },
  { key: 'settings', name: '其他设置', icon: 'fas fa-cogs' }
]
</script>

<style scoped>
/* 使用全局样式中定义的 .tab-btn 类 */
</style>