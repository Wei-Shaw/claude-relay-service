<template>
  <div class="tab-content">
    <div class="card p-6">
      <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        <div>
          <h3 class="text-xl font-bold text-gray-900 mb-2">API Keys 管理</h3>
          <p class="text-gray-600">管理和监控您的 API 密钥</p>
        </div>
        <div class="flex items-center gap-3">
          <!-- Token统计时间范围选择 -->
          <select 
            v-model="apiKeyStatsTimeRange" 
            @change="loadApiKeys()"
            class="form-input px-3 py-2 text-sm"
          >
            <option value="today">今日</option>
            <option value="7days">最近7天</option>
            <option value="monthly">本月</option>
            <option value="all">全部时间</option>
          </select>
          <!-- 标签筛选器 -->
          <select 
            v-model="selectedTagFilter" 
            class="form-input px-3 py-2 text-sm"
          >
            <option value="">所有标签</option>
            <option v-for="tag in availableTags" :key="tag" :value="tag">{{ tag }}</option>
          </select>
          <button 
            @click.stop="openCreateApiKeyModal"
            class="btn btn-primary px-6 py-3 flex items-center gap-2"
          >
            <i class="fas fa-plus"></i>创建新 Key
          </button>
        </div>
      </div>
      
      <div v-if="apiKeysLoading" class="text-center py-12">
        <div class="loading-spinner mx-auto mb-4"></div>
        <p class="text-gray-500">正在加载 API Keys...</p>
      </div>
      
      <div v-else-if="apiKeys.length === 0" class="text-center py-12">
        <div class="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <i class="fas fa-key text-gray-400 text-xl"></i>
        </div>
        <p class="text-gray-500 text-lg">暂无 API Keys</p>
        <p class="text-gray-400 text-sm mt-2">点击上方按钮创建您的第一个 API Key</p>
      </div>
      
      <div v-else class="table-container">
        <table class="min-w-full">
          <thead class="bg-gray-50/80 backdrop-blur-sm">
            <tr>
              <th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100" @click="sortApiKeys('name')">
                名称
                <i v-if="apiKeysSortBy === 'name'" :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"></i>
                <i v-else class="fas fa-sort ml-1 text-gray-400"></i>
              </th>
              <th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">标签</th>
              <th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">API Key</th>
              <th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100" @click="sortApiKeys('status')">
                状态
                <i v-if="apiKeysSortBy === 'status'" :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"></i>
                <i v-else class="fas fa-sort ml-1 text-gray-400"></i>
              </th>
              <th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                使用统计
                <span class="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded" @click="sortApiKeys('cost')">
                  (费用
                  <i v-if="apiKeysSortBy === 'cost'" :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"></i>
                  <i v-else class="fas fa-sort ml-1 text-gray-400"></i>)
                </span>
              </th>
              <th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100" @click="sortApiKeys('createdAt')">
                创建时间
                <i v-if="apiKeysSortBy === 'createdAt'" :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"></i>
                <i v-else class="fas fa-sort ml-1 text-gray-400"></i>
              </th>
              <th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100" @click="sortApiKeys('expiresAt')">
                过期时间
                <i v-if="apiKeysSortBy === 'expiresAt'" :class="['fas', apiKeysSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'ml-1']"></i>
                <i v-else class="fas fa-sort ml-1 text-gray-400"></i>
              </th>
              <th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200/50">
            <template v-for="key in sortedApiKeys" :key="key.id">
              <!-- API Key 主行 -->
              <tr class="table-row">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mr-3">
                      <i class="fas fa-key text-white text-xs"></i>
                    </div>
                    <div>
                      <div class="text-sm font-semibold text-gray-900">{{ key.name }}</div>
                      <div class="text-xs text-gray-500">{{ key.id }}</div>
                      <div class="text-xs text-gray-500 mt-1">
                        <span v-if="key.claudeAccountId">
                          <i class="fas fa-link mr-1"></i>
                          绑定: {{ getBoundAccountName(key.claudeAccountId) }}
                        </span>
                        <span v-else>
                          <i class="fas fa-share-alt mr-1"></i>
                          使用共享池
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <div class="flex flex-wrap gap-1">
                    <span v-for="tag in (key.tags || [])" :key="tag" 
                          class="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                      {{ tag }}
                    </span>
                    <span v-if="!key.tags || key.tags.length === 0" 
                          class="text-xs text-gray-400">无标签</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-mono text-gray-600 bg-gray-50 px-3 py-1 rounded-lg">
                    {{ (key.apiKey || '').substring(0, 20) }}...
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="['inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold', 
                               key.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800']">
                    <div :class="['w-2 h-2 rounded-full mr-2', 
                               key.isActive ? 'bg-green-500' : 'bg-red-500']"></div>
                    {{ key.isActive ? '活跃' : '禁用' }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <div class="space-y-1">
                    <!-- 请求统计 -->
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-600">请求数:</span>
                      <span class="font-medium text-gray-900">{{ formatNumber((key.usage && key.usage.total && key.usage.total.requests) || 0) }}</span>
                    </div>
                    <!-- Token统计 -->
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-600">Token:</span>
                      <span class="font-medium text-gray-900">{{ formatNumber((key.usage && key.usage.total && key.usage.total.tokens) || 0) }}</span>
                    </div>
                    <!-- 费用统计 -->
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-600">费用:</span>
                      <span class="font-medium text-green-600">{{ calculateApiKeyCost(key.usage) }}</span>
                    </div>
                    <!-- 每日费用限制 -->
                    <div v-if="key.dailyCostLimit > 0" class="flex justify-between text-sm">
                      <span class="text-gray-600">今日费用:</span>
                      <span :class="['font-medium', (key.dailyCost || 0) >= key.dailyCostLimit ? 'text-red-600' : 'text-blue-600']">
                        ${{ (key.dailyCost || 0).toFixed(2) }} / ${{ key.dailyCostLimit.toFixed(2) }}
                      </span>
                    </div>
                    <!-- 并发限制 -->
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-600">并发限制:</span>
                      <span class="font-medium text-purple-600">{{ key.concurrencyLimit > 0 ? key.concurrencyLimit : '无限制' }}</span>
                    </div>
                    <!-- 当前并发数 -->
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-600">当前并发:</span>
                      <span :class="['font-medium', key.currentConcurrency > 0 ? 'text-orange-600' : 'text-gray-600']">
                        {{ key.currentConcurrency || 0 }}
                        <span v-if="key.concurrencyLimit > 0" class="text-xs text-gray-500">/ {{ key.concurrencyLimit }}</span>
                      </span>
                    </div>
                    <!-- 时间窗口限流 -->
                    <div v-if="key.rateLimitWindow > 0" class="flex justify-between text-sm">
                      <span class="text-gray-600">时间窗口:</span>
                      <span class="font-medium text-indigo-600">{{ key.rateLimitWindow }} 分钟</span>
                    </div>
                    <!-- 请求次数限制 -->
                    <div v-if="key.rateLimitRequests > 0" class="flex justify-between text-sm">
                      <span class="text-gray-600">请求限制:</span>
                      <span class="font-medium text-indigo-600">{{ key.rateLimitRequests }} 次/窗口</span>
                    </div>
                    <!-- 输入/输出Token -->
                    <div class="flex justify-between text-xs text-gray-500">
                      <span>输入: {{ formatNumber((key.usage && key.usage.total && key.usage.total.inputTokens) || 0) }}</span>
                      <span>输出: {{ formatNumber((key.usage && key.usage.total && key.usage.total.outputTokens) || 0) }}</span>
                    </div>
                    <!-- 缓存Token细节 -->
                    <div v-if="((key.usage && key.usage.total && key.usage.total.cacheCreateTokens) || 0) > 0 || ((key.usage && key.usage.total && key.usage.total.cacheReadTokens) || 0) > 0" class="flex justify-between text-xs text-orange-500">
                      <span>缓存创建: {{ formatNumber((key.usage && key.usage.total && key.usage.total.cacheCreateTokens) || 0) }}</span>
                      <span>缓存读取: {{ formatNumber((key.usage && key.usage.total && key.usage.total.cacheReadTokens) || 0) }}</span>
                    </div>
                    <!-- RPM/TPM -->
                    <div class="flex justify-between text-xs text-blue-600">
                      <span>RPM: {{ (key.usage && key.usage.averages && key.usage.averages.rpm) || 0 }}</span>
                      <span>TPM: {{ (key.usage && key.usage.averages && key.usage.averages.tpm) || 0 }}</span>
                    </div>
                    <!-- 今日统计 -->
                    <div class="pt-1 border-t border-gray-100">
                      <div class="flex justify-between text-xs text-green-600">
                        <span>今日: {{ formatNumber((key.usage && key.usage.daily && key.usage.daily.requests) || 0) }}次</span>
                        <span>{{ formatNumber((key.usage && key.usage.daily && key.usage.daily.tokens) || 0) }}T</span>
                      </div>
                    </div>
                    <!-- 模型分布按钮 -->
                    <div class="pt-2">
                      <button @click="toggleApiKeyModelStats(key.id)" v-if="key && key.id" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                        <i :class="['fas', expandedApiKeys[key.id] ? 'fa-chevron-up' : 'fa-chevron-down', 'mr-1']"></i>
                        模型使用分布
                      </button>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ new Date(key.createdAt).toLocaleDateString() }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <div v-if="key.expiresAt">
                    <div v-if="isApiKeyExpired(key.expiresAt)" class="text-red-600">
                      <i class="fas fa-exclamation-circle mr-1"></i>
                      已过期
                    </div>
                    <div v-else-if="isApiKeyExpiringSoon(key.expiresAt)" class="text-orange-600">
                      <i class="fas fa-clock mr-1"></i>
                      {{ formatExpireDate(key.expiresAt) }}
                    </div>
                    <div v-else class="text-gray-600">
                      {{ formatExpireDate(key.expiresAt) }}
                    </div>
                  </div>
                  <div v-else class="text-gray-400">
                    <i class="fas fa-infinity mr-1"></i>
                    永不过期
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <div class="flex gap-2">
                    <button 
                      @click="copyApiStatsLink(key)" 
                      class="text-purple-600 hover:text-purple-900 font-medium hover:bg-purple-50 px-3 py-1 rounded-lg transition-colors"
                      title="复制统计页面链接"
                    >
                      <i class="fas fa-chart-bar mr-1"></i>统计
                    </button>
                    <button 
                      @click="openEditApiKeyModal(key)" 
                      class="text-blue-600 hover:text-blue-900 font-medium hover:bg-blue-50 px-3 py-1 rounded-lg transition-colors"
                    >
                      <i class="fas fa-edit mr-1"></i>编辑
                    </button>
                    <button 
                      v-if="key.expiresAt && (isApiKeyExpired(key.expiresAt) || isApiKeyExpiringSoon(key.expiresAt))"
                      @click="openRenewApiKeyModal(key)" 
                      class="text-green-600 hover:text-green-900 font-medium hover:bg-green-50 px-3 py-1 rounded-lg transition-colors"
                    >
                      <i class="fas fa-clock mr-1"></i>续期
                    </button>
                    <button 
                      @click="deleteApiKey(key.id)" 
                      class="text-red-600 hover:text-red-900 font-medium hover:bg-red-50 px-3 py-1 rounded-lg transition-colors"
                    >
                      <i class="fas fa-trash mr-1"></i>删除
                    </button>
                  </div>
                </td>
              </tr>
              
              <!-- 模型统计展开区域 -->
              <tr v-if="key && key.id && expandedApiKeys[key.id]">
                <td colspan="7" class="px-6 py-4 bg-gray-50">
                  <div v-if="!apiKeyModelStats[key.id]" class="text-center py-4">
                    <div class="loading-spinner mx-auto"></div>
                    <p class="text-sm text-gray-500 mt-2">加载模型统计...</p>
                  </div>
                  <div class="space-y-4">
                    <!-- 通用的标题和时间筛选器，无论是否有数据都显示 -->
                    <div class="flex items-center justify-between mb-4">
                      <h5 class="text-sm font-semibold text-gray-700 flex items-center">
                        <i class="fas fa-chart-pie text-indigo-500 mr-2"></i>
                        模型使用分布
                      </h5>
                      <div class="flex items-center gap-2">
                        <span v-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0" class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                          {{ apiKeyModelStats[key.id].length }} 个模型
                        </span>
                        
                        <!-- API Keys日期筛选器 -->
                        <div class="flex gap-1 items-center">
                          <!-- 快捷日期选择 -->
                          <div class="flex gap-1 bg-gray-100 rounded p-1">
                            <button 
                              v-for="option in getApiKeyDateFilter(key.id).presetOptions" 
                              :key="option.value"
                              @click="setApiKeyDateFilterPreset(option.value, key.id)"
                              :class="[
                                'px-2 py-1 rounded text-xs font-medium transition-colors',
                                getApiKeyDateFilter(key.id).preset === option.value && getApiKeyDateFilter(key.id).type === 'preset'
                                  ? 'bg-white text-blue-600 shadow-sm' 
                                  : 'text-gray-600 hover:text-gray-900'
                              ]"
                            >
                              {{ option.label }}
                            </button>
                          </div>
                          
                          <!-- Element Plus 日期范围选择器 -->
                          <el-date-picker
                            :model-value="getApiKeyDateFilter(key.id).customRange"
                            @update:model-value="(value) => onApiKeyCustomDateRangeChange(key.id, value)"
                            type="datetimerange"
                            range-separator="至"
                            start-placeholder="开始日期"
                            end-placeholder="结束日期"
                            format="YYYY-MM-DD HH:mm:ss"
                            value-format="YYYY-MM-DD HH:mm:ss"
                            :disabled-date="disabledDate"
                            :default-time="defaultTime"
                            size="small"
                            style="width: 280px;"
                            class="api-key-date-picker"
                            :clearable="true"
                            :unlink-panels="false"
                          ></el-date-picker>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 数据展示区域 -->
                    <div v-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length === 0" class="text-center py-8">
                      <div class="flex items-center justify-center gap-2 mb-3">
                        <i class="fas fa-chart-line text-gray-400 text-lg"></i>
                        <p class="text-sm text-gray-500">暂无模型使用数据</p>
                        <button 
                          @click="resetApiKeyDateFilter(key.id)"
                          class="text-blue-500 hover:text-blue-700 text-sm ml-2 flex items-center gap-1 transition-colors"
                          title="重置筛选条件并刷新"
                        >
                          <i class="fas fa-sync-alt text-xs"></i>
                          <span class="text-xs">刷新</span>
                        </button>
                      </div>
                      <p class="text-xs text-gray-400">尝试调整时间范围或点击刷新重新加载数据</p>
                    </div>
                    <div v-else-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div v-for="stat in apiKeyModelStats[key.id]" :key="stat.model" 
                           class="bg-gradient-to-br from-white to-gray-50 rounded-xl p-4 border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-200">
                        <div class="flex justify-between items-start mb-3">
                          <div class="flex-1">
                            <span class="text-sm font-semibold text-gray-800 block mb-1">{{ stat.model }}</span>
                            <span class="text-xs text-gray-500 bg-blue-50 px-2 py-1 rounded-full">{{ stat.requests }} 次请求</span>
                          </div>
                        </div>
                        
                        <div class="space-y-2 mb-3">
                          <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 flex items-center">
                              <i class="fas fa-coins text-yellow-500 mr-1 text-xs"></i>
                              总Token:
                            </span>
                            <span class="font-semibold text-gray-900">{{ formatNumber(stat.allTokens) }}</span>
                          </div>
                          <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 flex items-center">
                              <i class="fas fa-dollar-sign text-green-500 mr-1 text-xs"></i>
                              费用:
                            </span>
                            <span class="font-semibold text-green-600">{{ calculateModelCost(stat) }}</span>
                          </div>
                          <div class="pt-2 mt-2 border-t border-gray-100">
                            <div class="flex justify-between items-center text-xs text-gray-500">
                              <span class="flex items-center">
                                <i class="fas fa-arrow-down text-green-500 mr-1"></i>
                                输入:
                              </span>
                              <span class="font-medium">{{ formatNumber(stat.inputTokens) }}</span>
                            </div>
                            <div class="flex justify-between items-center text-xs text-gray-500">
                              <span class="flex items-center">
                                <i class="fas fa-arrow-up text-blue-500 mr-1"></i>
                                输出:
                              </span>
                              <span class="font-medium">{{ formatNumber(stat.outputTokens) }}</span>
                            </div>
                            <div v-if="stat.cacheCreateTokens > 0" class="flex justify-between items-center text-xs text-purple-600">
                              <span class="flex items-center">
                                <i class="fas fa-save mr-1"></i>
                                缓存创建:
                              </span>
                              <span class="font-medium">{{ formatNumber(stat.cacheCreateTokens) }}</span>
                            </div>
                            <div v-if="stat.cacheReadTokens > 0" class="flex justify-between items-center text-xs text-purple-600">
                              <span class="flex items-center">
                                <i class="fas fa-download mr-1"></i>
                                缓存读取:
                              </span>
                              <span class="font-medium">{{ formatNumber(stat.cacheReadTokens) }}</span>
                            </div>
                          </div>
                        </div>
                        
                        <!-- 进度条 -->
                        <div class="w-full bg-gray-200 rounded-full h-2 mt-3">
                          <div class="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-500" 
                               :style="{ width: calculateApiKeyModelPercentage(stat.allTokens, apiKeyModelStats[key.id]) + '%' }">
                          </div>
                        </div>
                        <div class="text-right mt-1">
                          <span class="text-xs font-medium text-indigo-600">
                            {{ calculateApiKeyModelPercentage(stat.allTokens, apiKeyModelStats[key.id]) }}%
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 总计统计，仅在有数据时显示 -->
                    <div v-if="apiKeyModelStats[key.id] && apiKeyModelStats[key.id].length > 0" class="mt-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                      <div class="flex items-center justify-between text-sm">
                        <span class="font-semibold text-gray-700 flex items-center">
                          <i class="fas fa-calculator text-indigo-500 mr-2"></i>
                          总计统计
                        </span>
                        <div class="flex gap-4 text-xs">
                          <span class="text-gray-600">
                            总请求: <span class="font-semibold text-gray-800">{{ apiKeyModelStats[key.id].reduce((sum, stat) => sum + stat.requests, 0) }}</span>
                          </span>
                          <span class="text-gray-600">
                            总Token: <span class="font-semibold text-gray-800">{{ formatNumber(apiKeyModelStats[key.id].reduce((sum, stat) => sum + stat.allTokens, 0)) }}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- 模态框组件 -->
    <CreateApiKeyModal 
      v-if="showCreateApiKeyModal"
      :accounts="accounts"
      @close="showCreateApiKeyModal = false"
      @success="handleCreateSuccess"
    />
    
    <EditApiKeyModal 
      v-if="showEditApiKeyModal"
      :apiKey="editingApiKey"
      :accounts="accounts"
      @close="showEditApiKeyModal = false"
      @success="handleEditSuccess"
    />
    
    <RenewApiKeyModal 
      v-if="showRenewApiKeyModal"
      :apiKey="renewingApiKey"
      @close="showRenewApiKeyModal = false"
      @success="handleRenewSuccess"
    />
    
    <NewApiKeyModal 
      v-if="showNewApiKeyModal"
      :apiKey="newApiKeyData"
      @close="showNewApiKeyModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import { useClientsStore } from '@/stores/clients'
import CreateApiKeyModal from '@/components/apikeys/CreateApiKeyModal.vue'
import EditApiKeyModal from '@/components/apikeys/EditApiKeyModal.vue'
import RenewApiKeyModal from '@/components/apikeys/RenewApiKeyModal.vue'
import NewApiKeyModal from '@/components/apikeys/NewApiKeyModal.vue'

// 响应式数据
const clientsStore = useClientsStore()
const apiKeys = ref([])
const apiKeysLoading = ref(false)
const apiKeyStatsTimeRange = ref('today')
const apiKeysSortBy = ref('')
const apiKeysSortOrder = ref('asc')
const expandedApiKeys = ref({})
const apiKeyModelStats = ref({})
const apiKeyDateFilters = ref({})
const defaultTime = ref([new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 2, 1, 23, 59, 59)])
const accounts = ref({ claude: [], gemini: [] })

// 标签相关
const selectedTagFilter = ref('')
const availableTags = ref([])

// 模态框状态
const showCreateApiKeyModal = ref(false)
const showEditApiKeyModal = ref(false)
const showRenewApiKeyModal = ref(false)
const showNewApiKeyModal = ref(false)
const editingApiKey = ref(null)
const renewingApiKey = ref(null)
const newApiKeyData = ref(null)

// 计算排序后的API Keys
const sortedApiKeys = computed(() => {
  // 先进行标签筛选
  let filteredKeys = apiKeys.value
  if (selectedTagFilter.value) {
    filteredKeys = apiKeys.value.filter(key => 
      key.tags && key.tags.includes(selectedTagFilter.value)
    )
  }
  
  // 如果没有排序字段，返回筛选后的结果
  if (!apiKeysSortBy.value) return filteredKeys
  
  // 排序
  const sorted = [...filteredKeys].sort((a, b) => {
    let aVal = a[apiKeysSortBy.value]
    let bVal = b[apiKeysSortBy.value]
    
    // 处理特殊排序字段
    if (apiKeysSortBy.value === 'status') {
      aVal = a.isActive ? 1 : 0
      bVal = b.isActive ? 1 : 0
    } else if (apiKeysSortBy.value === 'cost') {
      aVal = parseFloat(calculateApiKeyCost(a.usage).replace('$', ''))
      bVal = parseFloat(calculateApiKeyCost(b.usage).replace('$', ''))
    } else if (apiKeysSortBy.value === 'createdAt' || apiKeysSortBy.value === 'expiresAt') {
      aVal = aVal ? new Date(aVal).getTime() : 0
      bVal = bVal ? new Date(bVal).getTime() : 0
    }
    
    if (aVal < bVal) return apiKeysSortOrder.value === 'asc' ? -1 : 1
    if (aVal > bVal) return apiKeysSortOrder.value === 'asc' ? 1 : -1
    return 0
  })
  
  return sorted
})

// 加载账户列表
const loadAccounts = async () => {
  try {
    const [claudeData, geminiData] = await Promise.all([
      apiClient.get('/admin/claude-accounts'),
      apiClient.get('/admin/gemini-accounts')
    ])
    
    if (claudeData.success) {
      accounts.value.claude = claudeData.data || []
    }
    
    if (geminiData.success) {
      accounts.value.gemini = geminiData.data || []
    }
  } catch (error) {
    console.error('加载账户列表失败:', error)
  }
}

// 加载API Keys
const loadApiKeys = async () => {
  apiKeysLoading.value = true
  try {
    const data = await apiClient.get(`/admin/api-keys?timeRange=${apiKeyStatsTimeRange.value}`)
    if (data.success) {
      apiKeys.value = data.data || []
      
      // 更新可用标签列表
      const tagsSet = new Set()
      apiKeys.value.forEach(key => {
        if (key.tags && Array.isArray(key.tags)) {
          key.tags.forEach(tag => tagsSet.add(tag))
        }
      })
      availableTags.value = Array.from(tagsSet).sort()
    }
  } catch (error) {
    showToast('加载 API Keys 失败', 'error')
  } finally {
    apiKeysLoading.value = false
  }
}

// 排序API Keys
const sortApiKeys = (field) => {
  if (apiKeysSortBy.value === field) {
    apiKeysSortOrder.value = apiKeysSortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    apiKeysSortBy.value = field
    apiKeysSortOrder.value = 'asc'
  }
}

// 格式化数字
const formatNumber = (num) => {
  if (!num && num !== 0) return '0'
  return num.toLocaleString('zh-CN')
}

// 计算API Key费用
const calculateApiKeyCost = (usage) => {
  if (!usage || !usage.total) return '$0.0000'
  const cost = usage.total.cost || 0
  return `$${cost.toFixed(4)}`
}

// 获取绑定账户名称
const getBoundAccountName = (accountId) => {
  if (!accountId) return '未知账户'
  
  // 从Claude账户列表中查找
  const claudeAccount = accounts.value.claude.find(acc => acc.id === accountId)
  if (claudeAccount) {
    return claudeAccount.name
  }
  
  // 从Gemini账户列表中查找
  const geminiAccount = accounts.value.gemini.find(acc => acc.id === accountId)
  if (geminiAccount) {
    return geminiAccount.name
  }
  
  // 如果找不到，返回账户ID的前8位
  return `账户-${accountId.substring(0, 8)}`
}

// 检查API Key是否过期
const isApiKeyExpired = (expiresAt) => {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// 检查API Key是否即将过期
const isApiKeyExpiringSoon = (expiresAt) => {
  if (!expiresAt || isApiKeyExpired(expiresAt)) return false
  const daysUntilExpiry = (new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
  return daysUntilExpiry <= 7
}

// 格式化过期日期
const formatExpireDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('zh-CN')
}

// 切换模型统计展开状态
const toggleApiKeyModelStats = async (keyId) => {
  if (!expandedApiKeys.value[keyId]) {
    expandedApiKeys.value[keyId] = true
    // 初始化日期筛选器
    if (!apiKeyDateFilters.value[keyId]) {
      initApiKeyDateFilter(keyId)
    }
    // 加载模型统计数据
    await loadApiKeyModelStats(keyId, true)
  } else {
    expandedApiKeys.value[keyId] = false
  }
}

// 加载 API Key 的模型统计
const loadApiKeyModelStats = async (keyId, forceReload = false) => {
  if (!forceReload && apiKeyModelStats.value[keyId] && apiKeyModelStats.value[keyId].length > 0) {
    return
  }
  
  const filter = getApiKeyDateFilter(keyId)
  
  try {
    let url = `/admin/api-keys/${keyId}/model-stats`
    const params = new URLSearchParams()
    
    if (filter.customStart && filter.customEnd) {
      params.append('startDate', filter.customStart)
      params.append('endDate', filter.customEnd)
      params.append('period', 'custom')
    } else {
      const period = filter.preset === 'today' ? 'daily' : 'monthly'
      params.append('period', period)
    }
    
    url += '?' + params.toString()
    
    const data = await apiClient.get(url)
    if (data.success) {
      apiKeyModelStats.value[keyId] = data.data || []
    }
  } catch (error) {
    showToast('加载模型统计失败', 'error')
    apiKeyModelStats.value[keyId] = []
  }
}

// 计算API Key模型使用百分比
const calculateApiKeyModelPercentage = (value, stats) => {
  const total = stats.reduce((sum, stat) => sum + (stat.allTokens || 0), 0)
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

// 计算单个模型费用
const calculateModelCost = (stat) => {
  // 优先使用后端返回的费用数据
  if (stat.formatted && stat.formatted.total) {
    return stat.formatted.total
  }
  
  // 如果没有 formatted 数据，尝试使用 cost 字段
  if (stat.cost !== undefined) {
    return `$${stat.cost.toFixed(6)}`
  }
  
  // 默认返回
  return '$0.000000'
}

// 初始化API Key的日期筛选器
const initApiKeyDateFilter = (keyId) => {
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - 6) // 7天前
  
  apiKeyDateFilters.value[keyId] = {
    type: 'preset',
    preset: '7days',
    customStart: startDate.toISOString().split('T')[0],
    customEnd: today.toISOString().split('T')[0],
    customRange: null,
    presetOptions: [
      { value: 'today', label: '今日', days: 1 },
      { value: '7days', label: '7天', days: 7 },
      { value: '30days', label: '30天', days: 30 }
    ]
  }
}

// 获取API Key的日期筛选器状态
const getApiKeyDateFilter = (keyId) => {
  if (!apiKeyDateFilters.value[keyId]) {
    initApiKeyDateFilter(keyId)
  }
  return apiKeyDateFilters.value[keyId]
}

// 设置 API Key 日期预设
const setApiKeyDateFilterPreset = (preset, keyId) => {
  const filter = getApiKeyDateFilter(keyId)
  filter.type = 'preset'
  filter.preset = preset
  
  const option = filter.presetOptions.find(opt => opt.value === preset)
  if (option) {
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - (option.days - 1))
    
    filter.customStart = startDate.toISOString().split('T')[0]
    filter.customEnd = today.toISOString().split('T')[0]
    
    const formatDate = (date) => {
      return date.getFullYear() + '-' + 
             String(date.getMonth() + 1).padStart(2, '0') + '-' + 
             String(date.getDate()).padStart(2, '0') + ' 00:00:00'
    }
    
    filter.customRange = [
      formatDate(startDate),
      formatDate(today)
    ]
  }
  
  loadApiKeyModelStats(keyId, true)
}

// API Key 自定义日期范围变化
const onApiKeyCustomDateRangeChange = (keyId, value) => {
  const filter = getApiKeyDateFilter(keyId)
  
  if (value && value.length === 2) {
    filter.type = 'custom'
    filter.preset = ''
    filter.customRange = value
    filter.customStart = value[0].split(' ')[0]
    filter.customEnd = value[1].split(' ')[0]
    
    loadApiKeyModelStats(keyId, true)
  } else if (value === null) {
    // 清空时恢复默认7天
    setApiKeyDateFilterPreset('7days', keyId)
  }
}

// 禁用未来日期
const disabledDate = (date) => {
  return date > new Date()
}

// 重置API Key日期筛选器
const resetApiKeyDateFilter = (keyId) => {
  const filter = getApiKeyDateFilter(keyId)
  
  // 重置为默认的7天
  filter.type = 'preset'
  filter.preset = '7days'
  
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - 6)
  
  filter.customStart = startDate.toISOString().split('T')[0]
  filter.customEnd = today.toISOString().split('T')[0]
  filter.customRange = null
  
  // 重新加载数据
  loadApiKeyModelStats(keyId, true)
  showToast('已重置筛选条件并刷新数据', 'info')
}

// 打开创建模态框
const openCreateApiKeyModal = () => {
  showCreateApiKeyModal.value = true
}

// 打开编辑模态框
const openEditApiKeyModal = (apiKey) => {
  editingApiKey.value = apiKey
  showEditApiKeyModal.value = true
}

// 打开续期模态框
const openRenewApiKeyModal = (apiKey) => {
  renewingApiKey.value = apiKey
  showRenewApiKeyModal.value = true
}

// 处理创建成功
const handleCreateSuccess = (data) => {
  showCreateApiKeyModal.value = false
  newApiKeyData.value = data
  showNewApiKeyModal.value = true
  loadApiKeys()
}

// 处理编辑成功
const handleEditSuccess = () => {
  showEditApiKeyModal.value = false
  showToast('API Key 更新成功', 'success')
  loadApiKeys()
}

// 处理续期成功
const handleRenewSuccess = () => {
  showRenewApiKeyModal.value = false
  showToast('API Key 续期成功', 'success')
  loadApiKeys()
}

// 删除API Key
const deleteApiKey = async (keyId) => {
  let confirmed = false
  
  if (window.showConfirm) {
    confirmed = await window.showConfirm(
      '删除 API Key',
      '确定要删除这个 API Key 吗？此操作不可恢复。',
      '确定删除',
      '取消'
    )
  } else {
    // 降级方案
    confirmed = confirm('确定要删除这个 API Key 吗？此操作不可恢复。')
  }
  
  if (!confirmed) return
  
  try {
    const data = await apiClient.delete(`/admin/api-keys/${keyId}`)
    if (data.success) {
      showToast('API Key 已删除', 'success')
      loadApiKeys()
    } else {
      showToast(data.message || '删除失败', 'error')
    }
  } catch (error) {
    showToast('删除失败', 'error')
  }
}

// 复制API统计页面链接
const copyApiStatsLink = (apiKey) => {
  // 构建统计页面的完整URL
  const baseUrl = window.location.origin
  const statsUrl = `${baseUrl}/admin/api-stats?apiId=${apiKey.id}`
  
  // 使用传统的textarea方法复制到剪贴板
  const textarea = document.createElement('textarea')
  textarea.value = statsUrl
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  
  textarea.select()
  textarea.setSelectionRange(0, 99999) // 兼容移动端
  
  try {
    const successful = document.execCommand('copy')
    if (successful) {
      showToast(`已复制统计页面链接`, 'success')
    } else {
      showToast('复制失败，请手动复制', 'error')
      console.log('统计页面链接:', statsUrl)
    }
  } catch (err) {
    showToast('复制失败，请手动复制', 'error')
    console.error('复制错误:', err)
    console.log('统计页面链接:', statsUrl)
  } finally {
    document.body.removeChild(textarea)
  }
}

onMounted(async () => {
  // 并行加载所有需要的数据
  await Promise.all([
    clientsStore.loadSupportedClients(),
    loadAccounts(),
    loadApiKeys()
  ])
})
</script>

<style scoped>
.tab-content {
  min-height: calc(100vh - 300px);
}

.table-container {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.table-row {
  transition: all 0.2s ease;
}

.table-row:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.api-key-date-picker :deep(.el-input__inner) {
  @apply bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500;
}

.api-key-date-picker :deep(.el-range-separator) {
  @apply text-gray-500;
}
</style>