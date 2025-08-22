<template>
  <div ref="triggerRef" class="relative">
    <!-- 选择器主体 -->
    <div
      class="form-input flex w-full cursor-pointer items-center justify-between dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
      :class="{ 'opacity-50': disabled }"
      @click="!disabled && toggleDropdown()"
    >
      <span
        :class="
          modelValue ? 'text-gray-900 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'
        "
        >{{ selectedLabel }}</span
      >
      <i
        class="fas fa-chevron-down text-gray-400 transition-transform duration-200 dark:text-gray-500"
        :class="{ 'rotate-180': showDropdown }"
      />
    </div>

    <!-- 下拉菜单 -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition ease-out duration-100"
        enter-from-class="transform opacity-0 scale-95"
        enter-to-class="transform opacity-100 scale-100"
        leave-active-class="transition ease-in duration-75"
        leave-from-class="transform opacity-100 scale-100"
        leave-to-class="transform opacity-0 scale-95"
      >
        <div
          v-if="showDropdown"
          ref="dropdownRef"
          class="absolute z-50 flex flex-col rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
          :style="dropdownStyle"
        >
          <!-- 搜索框 -->
          <div class="flex-shrink-0 border-b border-gray-200 p-3 dark:border-gray-600">
            <div class="relative">
              <input
                ref="searchInput"
                v-model="searchQuery"
                class="form-input w-full text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                placeholder="搜索账号名称..."
                style="padding-left: 40px; padding-right: 36px"
                type="text"
                @input="handleSearch"
              />
              <i
                class="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500"
              />
              <button
                v-if="searchQuery"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
                type="button"
                @click="clearSearch"
              >
                <i class="fas fa-times text-sm" />
              </button>
            </div>
          </div>

          <!-- 选项列表 -->
          <div class="custom-scrollbar flex-1 overflow-y-auto">
            <!-- 默认选项 -->
            <div
              class="cursor-pointer px-4 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
              :class="{ 'bg-blue-50 dark:bg-blue-900/20': !modelValue }"
              @click="selectAccount(null)"
            >
              <span class="text-gray-700 dark:text-gray-300">{{ defaultOptionText }}</span>
            </div>

            <!-- 分组选项 -->
            <div v-if="filteredGroups.length > 0">
              <div
                class="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              >
                调度分组
              </div>
              <div
                v-for="group in filteredGroups"
                :key="`group:${group.id}`"
                class="cursor-pointer px-4 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                :class="{ 'bg-blue-50 dark:bg-blue-900/20': modelValue === `group:${group.id}` }"
                @click="selectAccount(`group:${group.id}`)"
              >
                <div class="flex items-center justify-between">
                  <span class="text-gray-700 dark:text-gray-300">{{ group.name }}</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400"
                    >{{ group.memberCount || 0 }} 个成员</span
                  >
                </div>
              </div>
            </div>

            <!-- OAuth 账号 -->
            <div v-if="filteredOAuthAccounts.length > 0">
              <div
                class="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              >
                {{ platform === 'claude' ? 'Claude OAuth 专属账号' : 'OAuth 专属账号' }}
              </div>
              <div
                v-for="account in filteredOAuthAccounts"
                :key="account.id"
                class="cursor-pointer px-4 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                :class="{ 'bg-blue-50 dark:bg-blue-900/20': modelValue === account.id }"
                @click="selectAccount(account.id)"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-gray-700 dark:text-gray-300">{{ account.name }}</span>
                    <span
                      class="ml-2 rounded-full px-2 py-0.5 text-xs"
                      :class="
                        account.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : account.status === 'unauthorized'
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      "
                    >
                      {{ getAccountStatusText(account) }}
                    </span>
                  </div>
                  <span class="text-xs text-gray-400 dark:text-gray-500">
                    {{ formatDate(account.createdAt) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Console 账号（仅 Claude） -->
            <div v-if="platform === 'claude' && filteredConsoleAccounts.length > 0">
              <div
                class="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              >
                Claude Console 专属账号
              </div>
              <div
                v-for="account in filteredConsoleAccounts"
                :key="account.id"
                class="cursor-pointer px-4 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                :class="{
                  'bg-blue-50 dark:bg-blue-900/20': modelValue === `console:${account.id}`
                }"
                @click="selectAccount(`console:${account.id}`)"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-gray-700 dark:text-gray-300">{{ account.name }}</span>
                    <span
                      class="ml-2 rounded-full px-2 py-0.5 text-xs"
                      :class="
                        account.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : account.status === 'unauthorized'
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      "
                    >
                      {{ getAccountStatusText(account) }}
                    </span>
                  </div>
                  <span class="text-xs text-gray-400 dark:text-gray-500">
                    {{ formatDate(account.createdAt) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 无搜索结果 -->
            <div
              v-if="searchQuery && !hasResults"
              class="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
            >
              <i class="fas fa-search mb-2 text-2xl" />
              <p class="text-sm">没有找到匹配的账号</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  platform: {
    type: String,
    required: true,
    validator: (value) => ['claude', 'gemini'].includes(value)
  },
  accounts: {
    type: Array,
    default: () => []
  },
  groups: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  },
  placeholder: {
    type: String,
    default: '请选择账号'
  },
  defaultOptionText: {
    type: String,
    default: '使用共享账号池'
  }
})

const emit = defineEmits(['update:modelValue'])

const showDropdown = ref(false)
const searchQuery = ref('')
const searchInput = ref(null)
const dropdownRef = ref(null)
const dropdownStyle = ref({})
const triggerRef = ref(null)
const lastDirection = ref('') // 记住上次的显示方向

// 获取选中的标签
const selectedLabel = computed(() => {
  // 如果没有选中值，显示默认选项文本
  if (!props.modelValue) return props.defaultOptionText

  // 分组
  if (props.modelValue.startsWith('group:')) {
    const groupId = props.modelValue.substring(6)
    const group = props.groups.find((g) => g.id === groupId)
    return group ? `${group.name} (${group.memberCount || 0} 个成员)` : ''
  }

  // Console 账号
  if (props.modelValue.startsWith('console:')) {
    const accountId = props.modelValue.substring(8)
    const account = props.accounts.find(
      (a) => a.id === accountId && a.platform === 'claude-console'
    )
    return account ? `${account.name} (${getAccountStatusText(account)})` : ''
  }

  // OAuth 账号
  const account = props.accounts.find((a) => a.id === props.modelValue)
  return account ? `${account.name} (${getAccountStatusText(account)})` : ''
})

// 获取账户状态文本
const getAccountStatusText = (account) => {
  if (!account) return '未知'

  // 优先使用 isActive 判断
  if (account.isActive === false) {
    // 根据 status 提供更详细的状态信息
    switch (account.status) {
      case 'unauthorized':
        return '未授权'
      case 'error':
        return 'Token错误'
      case 'created':
        return '待验证'
      case 'rate_limited':
        return '限流中'
      default:
        return '异常'
    }
  }

  return '正常'
}

// 按创建时间倒序排序账号
const sortedAccounts = computed(() => {
  return [...props.accounts].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0)
    const dateB = new Date(b.createdAt || 0)
    return dateB - dateA // 倒序排序
  })
})

// 过滤的分组
const filteredGroups = computed(() => {
  if (!searchQuery.value) return props.groups
  const query = searchQuery.value.toLowerCase()
  return props.groups.filter((group) => group.name.toLowerCase().includes(query))
})

// 过滤的 OAuth 账号
const filteredOAuthAccounts = computed(() => {
  let accounts = sortedAccounts.value.filter(
    (a) =>
      a.accountType === 'dedicated' &&
      (props.platform === 'claude'
        ? a.platform === 'claude-oauth'
        : a.platform !== 'claude-console')
  )

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    accounts = accounts.filter((account) => account.name.toLowerCase().includes(query))
  }

  return accounts
})

// 过滤的 Console 账号
const filteredConsoleAccounts = computed(() => {
  if (props.platform !== 'claude') return []

  let accounts = sortedAccounts.value.filter(
    (a) => a.accountType === 'dedicated' && a.platform === 'claude-console'
  )

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    accounts = accounts.filter((account) => account.name.toLowerCase().includes(query))
  }

  return accounts
})

// 是否有搜索结果
const hasResults = computed(() => {
  return (
    filteredGroups.value.length > 0 ||
    filteredOAuthAccounts.value.length > 0 ||
    filteredConsoleAccounts.value.length > 0
  )
})

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffInHours = (now - date) / (1000 * 60 * 60)

  if (diffInHours < 24) {
    return '今天创建'
  } else if (diffInHours < 48) {
    return '昨天创建'
  } else if (diffInHours < 168) {
    // 7天内
    return `${Math.floor(diffInHours / 24)} 天前`
  } else {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
}

// 更新下拉菜单位置
const updateDropdownPosition = () => {
  if (!showDropdown.value || !dropdownRef.value || !triggerRef.value) return

  const trigger = triggerRef.value
  if (!trigger) return

  const rect = trigger.getBoundingClientRect()
  const windowHeight = window.innerHeight
  const windowWidth = window.innerWidth
  const spaceBelow = windowHeight - rect.bottom
  const spaceAbove = rect.top
  const margin = 8 // 边距

  // 获取下拉框的高度
  // const dropdownHeight = dropdownRef.value.offsetHeight

  // 计算最大可用高度
  const maxHeightBelow = spaceBelow - margin
  const maxHeightAbove = spaceAbove - margin

  // 决定显示方向和最大高度
  let showAbove = false
  let maxHeight = maxHeightBelow

  // 优先使用上次的方向，除非空间不足
  if (lastDirection.value === 'above' && maxHeightAbove >= 150) {
    showAbove = true
    maxHeight = maxHeightAbove
  } else if (lastDirection.value === 'below' && maxHeightBelow >= 150) {
    showAbove = false
    maxHeight = maxHeightBelow
  } else {
    // 如果没有历史方向或空间不足，选择空间更大的方向
    if (maxHeightAbove > maxHeightBelow && maxHeightBelow < 200) {
      showAbove = true
      maxHeight = maxHeightAbove
    }
  }

  // 记住这次的方向
  lastDirection.value = showAbove ? 'above' : 'below'

  // 确保下拉框不超出视窗左右边界
  let left = rect.left
  const dropdownWidth = rect.width
  if (left + dropdownWidth > windowWidth - margin) {
    left = windowWidth - dropdownWidth - margin
  }
  if (left < margin) {
    left = margin
  }

  dropdownStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    width: `${rect.width}px`,
    maxHeight: `${Math.min(maxHeight, 400)}px`, // 限制最大高度为400px
    ...(showAbove ? { bottom: `${windowHeight - rect.top}px` } : { top: `${rect.bottom}px` })
  }
}

// 切换下拉菜单
const toggleDropdown = () => {
  if (!showDropdown.value && triggerRef.value) {
    // 在显示前就设置初始样式，避免闪烁
    const rect = triggerRef.value.getBoundingClientRect()
    const windowHeight = window.innerHeight
    const spaceBelow = windowHeight - rect.bottom
    const margin = 8

    // 预先设置一个合理的初始位置
    dropdownStyle.value = {
      position: 'fixed',
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${Math.min(spaceBelow - margin, 400)}px`,
      top: `${rect.bottom}px`
    }
  }
  showDropdown.value = !showDropdown.value
  if (showDropdown.value) {
    nextTick(() => {
      updateDropdownPosition()
      searchInput.value?.focus()
    })
  }
}

// 选择账号
const selectAccount = (value) => {
  emit('update:modelValue', value || '')
  showDropdown.value = false
  searchQuery.value = ''
}

// 处理搜索
const handleSearch = () => {
  // 搜索时自动触发
}

// 清除搜索
const clearSearch = () => {
  searchQuery.value = ''
  searchInput.value?.focus()
}

// 点击外部关闭
const handleClickOutside = (event) => {
  if (!triggerRef.value?.contains(event.target) && !dropdownRef.value?.contains(event.target)) {
    showDropdown.value = false
  }
}

// 监听滚动更新位置
const handleScroll = () => {
  if (showDropdown.value) {
    updateDropdownPosition()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', updateDropdownPosition)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', updateDropdownPosition)
})

// 监听下拉菜单状态变化
watch(showDropdown, (newVal) => {
  if (!newVal) {
    searchQuery.value = ''
    // 关闭时重置方向，下次打开重新计算
    lastDirection.value = ''
  }
})
</script>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e0 #f7fafc;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #f7fafc;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e0;
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #a0aec0;
}
</style>
