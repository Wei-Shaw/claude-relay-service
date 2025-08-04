<template>
  <div class="mb-4 sm:mb-6">
    <!-- 移动端下拉选择器 -->
    <div class="block sm:hidden bg-white/10 rounded-xl p-2 backdrop-blur-sm">
      <select 
        :value="activeTab"
        class="w-full px-4 py-3 bg-white/90 rounded-lg text-gray-700 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-color"
        @change="$emit('tab-change', $event.target.value)"
      >
        <option
          v-for="tab in tabs"
          :key="tab.key"
          :value="tab.key"
        >
          {{ tab.name }}
        </option>
      </select>
    </div>
    
    <!-- 桌面端标签栏 -->
    <div class="hidden sm:flex flex-wrap gap-2 bg-white/10 rounded-2xl p-2 backdrop-blur-sm">
      <button 
        v-for="tab in tabs" 
        :key="tab.key"
        :class="[
          'tab-btn flex-1 py-2 sm:py-3 px-3 sm:px-4 md:px-6 text-xs sm:text-sm font-semibold transition-all duration-300',
          activeTab === tab.key ? 'active' : 'text-gray-700 hover:bg-white/10 hover:text-gray-900'
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
defineProps({
  activeTab: {
    type: String,
    required: true
  }
})

defineEmits(['tab-change'])

const tabs = [
  { key: 'dashboard', name: '仪表板', shortName: '仪表板', icon: 'fas fa-tachometer-alt' },
  { key: 'apiKeys', name: 'API Keys', shortName: 'API', icon: 'fas fa-key' },
  { key: 'accounts', name: '账户管理', shortName: '账户', icon: 'fas fa-user-circle' },
  { key: 'tutorial', name: '使用教程', shortName: '教程', icon: 'fas fa-graduation-cap' },
  { key: 'settings', name: '其他设置', shortName: '设置', icon: 'fas fa-cogs' }
]
</script>

<style scoped>
/* 使用全局样式中定义的 .tab-btn 类 */
</style>