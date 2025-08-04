<template>
  <div class="settings-container">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 sm:mb-6">
        <h3 class="text-lg sm:text-xl font-bold text-gray-900 mb-1 sm:mb-2">
          其他设置
        </h3>
        <p class="text-sm sm:text-base text-gray-600">
          自定义网站名称和图标
        </p>
      </div>
      
      <div
        v-if="loading"
        class="text-center py-12"
      >
        <div class="loading-spinner mx-auto mb-4" />
        <p class="text-gray-500">
          正在加载设置...
        </p>
      </div>
      
      <!-- 桌面端表格视图 -->
      <div
        v-else
        class="hidden sm:block table-container"
      >
        <table class="min-w-full">
          <tbody class="divide-y divide-gray-200/50">
            <!-- 网站名称 -->
            <tr class="table-row">
              <td class="px-6 py-4 whitespace-nowrap w-48">
                <div class="flex items-center">
                  <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mr-3">
                    <i class="fas fa-font text-white text-xs" />
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-gray-900">
                      网站名称
                    </div>
                    <div class="text-xs text-gray-500">
                      品牌标识
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4">
                <input 
                  v-model="oemSettings.siteName"
                  type="text" 
                  class="form-input w-full max-w-md"
                  placeholder="Claude Relay Service"
                  maxlength="100"
                >
                <p class="text-xs text-gray-500 mt-1">
                  将显示在浏览器标题和页面头部
                </p>
              </td>
            </tr>
            
            <!-- 网站图标 -->
            <tr class="table-row">
              <td class="px-6 py-4 whitespace-nowrap w-48">
                <div class="flex items-center">
                  <div class="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                    <i class="fas fa-image text-white text-xs" />
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-gray-900">
                      网站图标
                    </div>
                    <div class="text-xs text-gray-500">
                      Favicon
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4">
                <div class="space-y-3">
                  <!-- 图标预览 -->
                  <div
                    v-if="oemSettings.siteIconData || oemSettings.siteIcon"
                    class="inline-flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <img 
                      :src="oemSettings.siteIconData || oemSettings.siteIcon" 
                      alt="图标预览" 
                      class="w-8 h-8"
                      @error="handleIconError"
                    >
                    <span class="text-sm text-gray-600">当前图标</span>
                    <button 
                      class="text-red-600 hover:text-red-900 font-medium hover:bg-red-50 px-3 py-1 rounded-lg transition-colors"
                      @click="removeIcon"
                    >
                      <i class="fas fa-trash mr-1" />删除
                    </button>
                  </div>
                  
                  <!-- 文件上传 -->
                  <div>
                    <input 
                      ref="iconFileInput" 
                      type="file"
                      accept=".ico,.png,.jpg,.jpeg,.svg"
                      class="hidden"
                      @change="handleIconUpload"
                    >
                    <button 
                      class="btn btn-success px-4 py-2"
                      @click="$refs.iconFileInput.click()"
                    >
                      <i class="fas fa-upload mr-2" />
                      上传图标
                    </button>
                    <span class="text-xs text-gray-500 ml-3">支持 .ico, .png, .jpg, .svg 格式，最大 350KB</span>
                  </div>
                </div>
              </td>
            </tr>
            
            <!-- 操作按钮 -->
            <tr>
              <td
                class="px-6 py-6"
                colspan="2"
              >
                <div class="flex items-center justify-between">
                  <div class="flex gap-3">
                    <button 
                      :disabled="saving"
                      class="btn btn-primary px-6 py-3"
                      :class="{ 'opacity-50 cursor-not-allowed': saving }"
                      @click="saveOemSettings"
                    >
                      <div
                        v-if="saving"
                        class="loading-spinner mr-2"
                      />
                      <i
                        v-else
                        class="fas fa-save mr-2"
                      />
                      {{ saving ? '保存中...' : '保存设置' }}
                    </button>
                    
                    <button 
                      class="btn bg-gray-100 text-gray-700 hover:bg-gray-200 px-6 py-3"
                      :disabled="saving"
                      @click="resetOemSettings"
                    >
                      <i class="fas fa-undo mr-2" />
                      重置为默认
                    </button>
                  </div>
                  
                  <div
                    v-if="oemSettings.updatedAt"
                    class="text-sm text-gray-500"
                  >
                    <i class="fas fa-clock mr-1" />
                    最后更新：{{ formatDateTime(oemSettings.updatedAt) }}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- 移动端卡片视图 -->
      <div
        v-if="!loading"
        class="sm:hidden space-y-4"
      >
        <!-- 网站名称设置卡片 -->
        <div class="bg-gray-50 rounded-lg p-4">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <i class="fas fa-font text-white text-sm" />
            </div>
            <div>
              <h4 class="text-sm font-semibold text-gray-900">
                网站名称
              </h4>
              <p class="text-xs text-gray-500">
                品牌标识
              </p>
            </div>
          </div>
          <div class="space-y-2">
            <input 
              v-model="oemSettings.siteName"
              type="text" 
              class="form-input w-full text-sm"
              placeholder="Claude Relay Service"
              maxlength="100"
            >
            <p class="text-xs text-gray-500">
              将显示在浏览器标题和页面头部
            </p>
          </div>
        </div>
        
        <!-- 网站图标设置卡片 -->
        <div class="bg-gray-50 rounded-lg p-4">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <i class="fas fa-image text-white text-sm" />
            </div>
            <div>
              <h4 class="text-sm font-semibold text-gray-900">
                网站图标
              </h4>
              <p class="text-xs text-gray-500">
                Favicon
              </p>
            </div>
          </div>
          <div class="space-y-3">
            <!-- 图标预览 -->
            <div
              v-if="oemSettings.siteIconData || oemSettings.siteIcon"
              class="inline-flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 w-full"
            >
              <img 
                :src="oemSettings.siteIconData || oemSettings.siteIcon" 
                alt="图标预览" 
                class="w-8 h-8"
                @error="handleIconError"
              >
              <span class="text-sm text-gray-600 flex-1">当前图标</span>
              <button 
                class="text-red-600 hover:text-red-900 text-sm font-medium hover:bg-red-50 px-3 py-1 rounded-lg transition-colors"
                @click="removeIcon"
              >
                <i class="fas fa-trash mr-1" />删除
              </button>
            </div>
            
            <!-- 上传按钮 -->
            <input 
              ref="iconFileInput"
              type="file" 
              accept="image/*" 
              style="display: none;"
              @change="handleIconUpload"
            >
            <div class="flex flex-col gap-2">
              <button 
                class="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                @click="$refs.iconFileInput.click()"
              >
                <i class="fas fa-upload" />
                上传图标
              </button>
              <div class="text-xs text-gray-500">
                或者输入图标URL：
              </div>
              <input 
                v-model="oemSettings.siteIcon"
                type="url" 
                class="form-input w-full text-sm"
                placeholder="https://example.com/icon.png"
              >
            </div>
            <p class="text-xs text-gray-500">
              支持 PNG、JPEG、GIF 格式，建议使用正方形图片
            </p>
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <div class="space-y-3 pt-2">
          <button 
            class="btn btn-primary w-full py-3 text-sm font-semibold"
            :disabled="saving"
            @click="saveOemSettings"
          >
            <div
              v-if="saving"
              class="loading-spinner mr-2"
            />
            <i
              v-else
              class="fas fa-save mr-2"
            />
            {{ saving ? '保存中...' : '保存设置' }}
          </button>
          
          <button 
            class="btn bg-gray-100 text-gray-700 hover:bg-gray-200 w-full py-3 text-sm"
            :disabled="saving"
            @click="resetOemSettings"
          >
            <i class="fas fa-undo mr-2" />
            重置为默认
          </button>
          
          <div
            v-if="oemSettings.updatedAt"
            class="text-center text-xs text-gray-500"
          >
            <i class="fas fa-clock mr-1" />
            最后更新：{{ formatDateTime(oemSettings.updatedAt) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { showToast } from '@/utils/toast'
import { useSettingsStore } from '@/stores/settings'

// 使用settings store
const settingsStore = useSettingsStore()
const { loading, saving, oemSettings } = storeToRefs(settingsStore)

// 组件refs
const iconFileInput = ref()

// 页面加载时获取设置
onMounted(async () => {
  try {
    await settingsStore.loadOemSettings()
  } catch (error) {
    showToast('加载设置失败', 'error')
  }
})

// 保存OEM设置
const saveOemSettings = async () => {
  try {
    const settings = {
      siteName: oemSettings.value.siteName,
      siteIcon: oemSettings.value.siteIcon,
      siteIconData: oemSettings.value.siteIconData
    }
    const result = await settingsStore.saveOemSettings(settings)
    if (result && result.success) {
      showToast('OEM设置保存成功', 'success')
    } else {
      showToast(result?.message || '保存失败', 'error')
    }
  } catch (error) {
    showToast('保存OEM设置失败', 'error')
  }
}

// 重置OEM设置
const resetOemSettings = async () => {
  if (!confirm('确定要重置为默认设置吗？\n\n这将清除所有自定义的网站名称和图标设置。')) return
  
  try {
    const result = await settingsStore.resetOemSettings()
    if (result && result.success) {
      showToast('已重置为默认设置', 'success')
    } else {
      showToast('重置失败', 'error')
    }
  } catch (error) {
    showToast('重置失败', 'error')
  }
}

// 处理图标上传
const handleIconUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  // 验证文件
  const validation = settingsStore.validateIconFile(file)
  if (!validation.isValid) {
    validation.errors.forEach(error => showToast(error, 'error'))
    return
  }
  
  try {
    // 转换为Base64
    const base64Data = await settingsStore.fileToBase64(file)
    oemSettings.value.siteIconData = base64Data
  } catch (error) {
    showToast('文件读取失败', 'error')
  }
  
  // 清除input的值，允许重复选择同一文件
  event.target.value = ''
}

// 删除图标
const removeIcon = () => {
  oemSettings.value.siteIcon = ''
  oemSettings.value.siteIconData = ''
}

// 处理图标加载错误
const handleIconError = () => {
  console.warn('Icon failed to load')
}

// 格式化日期时间
const formatDateTime = settingsStore.formatDateTime
</script>

<style scoped>
.settings-container {
  min-height: calc(100vh - 300px);
}

.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e7eb;
}

.table-container {
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid #f3f4f6;
}

.table-row {
  transition: background-color 0.2s ease;
}

.table-row:hover {
  background-color: #f9fafb;
}

.form-input {
  @apply w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200;
}

.btn {
  @apply inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}

.btn-success {
  @apply bg-green-600 text-white hover:bg-green-700 focus:ring-green-500;
}

.loading-spinner {
  @apply w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin;
}
</style>