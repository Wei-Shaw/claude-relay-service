<template>
  <div class="settings-container">
    <!-- OEM设置卡片 -->
    <div class="card p-6 mb-6">
      <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        <div>
          <h3 class="text-xl font-bold text-gray-900 mb-2">
            其他设置
          </h3>
          <p class="text-gray-600">
            自定义网站名称和图标
          </p>
        </div>
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
      
      <div
        v-else
        class="table-container"
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
            
          </tbody>
        </table>
      </div>
    </div>

    <!-- 备份还原卡片 -->
    <div class="card p-6">
      <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        <div>
          <h3 class="text-xl font-bold text-gray-900 mb-2">
            备份还原
          </h3>
          <p class="text-gray-600">
            数据备份与恢复管理
          </p>
        </div>
      </div>

      <div
        v-if="backupLoading"
        class="text-center py-12"
      >
        <div class="loading-spinner mx-auto mb-4" />
        <p class="text-gray-500">
          正在加载备份设置...
        </p>
      </div>

      <div
        v-else
        class="space-y-6"
      >
        <!-- 自动备份设置 -->
        <div class="border-b border-gray-200 pb-6">
          <h4 class="text-lg font-semibold text-gray-900 mb-4">自动备份设置</h4>
          <div class="space-y-4">
            <!-- 启用自动备份 -->
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div class="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mr-3">
                  <i class="fas fa-sync text-white text-xs" />
                </div>
                <div>
                  <div class="text-sm font-semibold text-gray-900">
                    启用自动备份
                  </div>
                  <div class="text-xs text-gray-500">
                    定期自动备份数据
                  </div>
                </div>
              </div>
              <label class="switch">
                <input
                  v-model="backupSettings.autoBackupEnabled"
                  type="checkbox"
                >
                <span class="slider"></span>
              </label>
            </div>

            <!-- 备份间隔 -->
            <div
              v-if="backupSettings.autoBackupEnabled"
              class="ml-11"
            >
              <label class="block text-sm font-medium text-gray-700 mb-2">
                备份间隔（小时）
              </label>
              <input
                v-model.number="backupSettings.autoBackupInterval"
                type="number"
                min="1"
                max="168"
                class="form-input w-32"
              >
              <p class="text-xs text-gray-500 mt-1">
                每 {{ backupSettings.autoBackupInterval }} 小时自动备份一次
              </p>
            </div>

            <!-- 最大备份数 -->
            <div class="ml-11">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                最大备份数量
              </label>
              <input
                v-model.number="backupSettings.maxBackups"
                type="number"
                min="1"
                max="100"
                class="form-input w-32"
              >
              <p class="text-xs text-gray-500 mt-1">
                自动删除超过此数量的旧备份
              </p>
            </div>

          </div>
        </div>

        <!-- 手动备份 -->
        <div class="border-b border-gray-200 pb-6">
          <h4 class="text-lg font-semibold text-gray-900 mb-4">手动备份</h4>
          <div class="flex items-center gap-4">
            <button
              class="btn btn-success"
              :disabled="creatingBackup"
              @click="createBackup"
            >
              <div
                v-if="creatingBackup"
                class="loading-spinner mr-2"
              />
              <i
                v-else
                class="fas fa-database mr-2"
              />
              {{ creatingBackup ? '备份中...' : '立即备份' }}
            </button>
            <p class="text-sm text-gray-600">
              创建当前数据的完整备份
            </p>
          </div>
        </div>

        <!-- 备份历史 -->
        <div>
          <div class="flex justify-between items-center mb-4">
            <h4 class="text-lg font-semibold text-gray-900">备份历史</h4>
            <button
              class="text-blue-600 hover:text-blue-800 text-sm font-medium"
              @click="loadBackupHistory"
            >
              <i class="fas fa-sync-alt mr-1" />
              刷新
            </button>
          </div>

          <div
            v-if="loadingHistory"
            class="text-center py-8"
          >
            <div class="loading-spinner mx-auto mb-4" />
            <p class="text-gray-500">
              正在加载备份历史...
            </p>
          </div>

          <div
            v-else-if="backupHistory.length === 0"
            class="text-center py-8 bg-gray-50 rounded-lg"
          >
            <i class="fas fa-inbox text-gray-400 text-3xl mb-3" />
            <p class="text-gray-500">暂无备份记录</p>
          </div>

          <div
            v-else
            class="space-y-3"
          >
            <div
              v-for="backup in backupHistory"
              :key="backup.id"
              class="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
            >
              <div class="flex items-center justify-between">
                <div>
                  <h5 class="font-medium text-gray-900">
                    {{ backup.fileName }}
                  </h5>
                  <div class="flex items-center gap-4 text-sm text-gray-500 mt-1">
                    <span>
                      <i class="fas fa-clock mr-1" />
                      {{ formatDateTime(backup.timestamp) }}
                    </span>
                    <span>
                      <i class="fas fa-file mr-1" />
                      {{ formatFileSize(backup.size) }}
                    </span>
                    <span>
                      <i class="fas fa-key mr-1" />
                      {{ backup.keysCount }} 个键
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="btn btn-sm bg-blue-600 text-white hover:bg-blue-700"
                    @click="downloadBackup(backup.id)"
                  >
                    <i class="fas fa-download mr-1" />
                    下载
                  </button>
                  <button
                    class="btn btn-sm bg-orange-600 text-white hover:bg-orange-700"
                    :disabled="restoringBackup === backup.id"
                    @click="restoreBackup(backup.id)"
                  >
                    <div
                      v-if="restoringBackup === backup.id"
                      class="loading-spinner mr-1"
                    />
                    <i
                      v-else
                      class="fas fa-undo mr-1"
                    />
                    还原
                  </button>
                  <button
                    class="btn btn-sm bg-red-600 text-white hover:bg-red-700"
                    @click="deleteBackup(backup.id)"
                  >
                    <i class="fas fa-trash" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 导入备份 -->
        <div class="border-t border-gray-200 pt-6">
          <h4 class="text-lg font-semibold text-gray-900 mb-4">导入备份</h4>
          <div class="flex items-center gap-4">
            <input
              ref="backupFileInput"
              type="file"
              accept=".zip"
              class="hidden"
              @change="handleBackupImport"
            >
            <button
              class="btn btn-primary"
              :disabled="importingBackup"
              @click="$refs.backupFileInput.click()"
            >
              <div
                v-if="importingBackup"
                class="loading-spinner mr-2"
              />
              <i
                v-else
                class="fas fa-upload mr-2"
              />
              {{ importingBackup ? '导入中...' : '选择备份文件' }}
            </button>
            <p class="text-sm text-gray-600">
              支持导入 .zip 格式的备份文件
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 页面底部统一的保存按钮 -->
    <div class="mt-8 flex justify-start">
      <div class="flex gap-3">
        <button
          class="btn btn-primary px-6 py-2.5"
          :disabled="saving || savingBackupSettings"
          @click="saveAllSettings"
        >
          <div
            v-if="saving || savingBackupSettings"
            class="loading-spinner mr-2"
          />
          <i
            v-else
            class="fas fa-save mr-2"
          />
          {{ (saving || savingBackupSettings) ? '保存中...' : '保存所有设置' }}
        </button>
        
        <button
          class="btn bg-gray-100 text-gray-700 hover:bg-gray-200 px-6 py-2.5"
          :disabled="saving || savingBackupSettings"
          @click="resetAllSettings"
        >
          <i class="fas fa-undo mr-2" />
          重置所有设置
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { showToast } from '@/utils/toast'
import { useSettingsStore } from '@/stores/settings'
import { apiClient } from '@/config/api'

// 使用settings store
const settingsStore = useSettingsStore()
const { loading, saving, oemSettings } = storeToRefs(settingsStore)

// 组件refs
const iconFileInput = ref()
const backupFileInput = ref()

// 备份相关状态
const backupSettings = ref({
  autoBackupEnabled: false,
  autoBackupInterval: 24,
  backupPath: '',
  maxBackups: 10
})
const backupLoading = ref(false)
const savingBackupSettings = ref(false)
const creatingBackup = ref(false)
const backupHistory = ref([])
const loadingHistory = ref(false)
const restoringBackup = ref(null)
const importingBackup = ref(false)

// 页面加载时获取设置
onMounted(async () => {
  try {
    await settingsStore.loadOemSettings()
    await loadBackupSettings()
    await loadBackupHistory()
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
    return result
  } catch (error) {
    console.error('Failed to save OEM settings:', error)
    return { success: false }
  }
}

// 重置OEM设置
const resetOemSettings = async () => {
  try {
    const result = await settingsStore.resetOemSettings()
    return result
  } catch (error) {
    console.error('Failed to reset OEM settings:', error)
    return { success: false }
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

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

// 加载备份设置
const loadBackupSettings = async () => {
  backupLoading.value = true
  try {
    const result = await apiClient.get('/admin/backup-settings')
    if (result && result.success) {
      backupSettings.value = result.data
    }
  } catch (error) {
    console.error('Failed to load backup settings:', error)
    showToast('加载备份设置失败', 'error')
  } finally {
    backupLoading.value = false
  }
}

// 保存备份设置
const saveBackupSettings = async () => {
  savingBackupSettings.value = true
  try {
    const result = await apiClient.put('/admin/backup-settings', backupSettings.value)
    if (result && result.success) {
      backupSettings.value = result.data
    }
    return result
  } catch (error) {
    console.error('Failed to save backup settings:', error)
    return { success: false }
  } finally {
    savingBackupSettings.value = false
  }
}

// 创建备份
const createBackup = async () => {
  creatingBackup.value = true
  try {
    const result = await apiClient.post('/admin/backup')
    if (result && result.success) {
      showToast('备份创建成功', 'success')
      await loadBackupHistory()
    } else {
      showToast(result?.message || '备份失败', 'error')
    }
  } catch (error) {
    console.error('Failed to create backup:', error)
    showToast('创建备份失败', 'error')
  } finally {
    creatingBackup.value = false
  }
}

// 加载备份历史
const loadBackupHistory = async () => {
  loadingHistory.value = true
  try {
    const result = await apiClient.get('/admin/backup-history')
    if (result && result.success) {
      backupHistory.value = result.data
    }
  } catch (error) {
    console.error('Failed to load backup history:', error)
    showToast('加载备份历史失败', 'error')
  } finally {
    loadingHistory.value = false
  }
}

// 下载备份
const downloadBackup = async (backupId) => {
  try {
    const response = await fetch(`/admin/backup/${backupId}/download`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      }
    })
    
    if (!response.ok) {
      throw new Error('下载失败')
    }
    
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || `backup_${backupId}.zip`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  } catch (error) {
    console.error('Failed to download backup:', error)
    showToast('下载备份失败', 'error')
  }
}

// 还原备份
const restoreBackup = async (backupId) => {
  if (!confirm('确定要还原此备份吗？\n\n警告：这将覆盖当前所有数据！')) return
  
  restoringBackup.value = backupId
  try {
    const result = await apiClient.post(`/admin/backup/${backupId}/restore`)
    if (result && result.success) {
      showToast('备份还原成功', 'success')
      // 刷新页面以应用新数据
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } else {
      showToast(result?.message || '还原失败', 'error')
    }
  } catch (error) {
    console.error('Failed to restore backup:', error)
    showToast('还原备份失败', 'error')
  } finally {
    restoringBackup.value = null
  }
}

// 删除备份
const deleteBackup = async (backupId) => {
  if (!confirm('确定要删除此备份吗？')) return
  
  try {
    const result = await apiClient.delete(`/admin/backup/${backupId}`)
    if (result && result.success) {
      showToast('备份删除成功', 'success')
      await loadBackupHistory()
    } else {
      showToast(result?.message || '删除失败', 'error')
    }
  } catch (error) {
    console.error('Failed to delete backup:', error)
    showToast('删除备份失败', 'error')
  }
}

// 处理备份导入
const handleBackupImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  if (!file.name.endsWith('.zip')) {
    showToast('请选择 .zip 格式的备份文件', 'error')
    return
  }
  
  importingBackup.value = true
  try {
    const formData = new FormData()
    formData.append('backup', file)
    
    const response = await fetch('/admin/backup/import', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: formData
    })
    
    const result = await response.json()
    
    if (result && result.success) {
      showToast('备份导入成功', 'success')
      await loadBackupHistory()
    } else {
      showToast(result?.message || '导入失败', 'error')
    }
  } catch (error) {
    console.error('Failed to import backup:', error)
    showToast('导入备份失败', 'error')
  } finally {
    importingBackup.value = false
    event.target.value = ''
  }
}

// 保存所有设置
const saveAllSettings = async () => {
  let success = true
  
  // 保存 OEM 设置
  try {
    const oemResult = await saveOemSettings()
    if (!oemResult || !oemResult.success) {
      success = false
    }
  } catch (error) {
    success = false
  }
  
  // 保存备份设置
  try {
    const backupResult = await saveBackupSettings()
    if (!backupResult || !backupResult.success) {
      success = false
    }
  } catch (error) {
    success = false
  }
  
  if (success) {
    showToast('所有设置保存成功', 'success')
  } else {
    showToast('部分设置保存失败，请查看具体错误信息', 'error')
  }
}

// 重置所有设置
const resetAllSettings = async () => {
  if (!confirm('确定要重置所有设置吗？\n\n这将恢复所有设置为默认值。')) return
  
  let success = true
  
  // 重置 OEM 设置
  try {
    const oemResult = await resetOemSettings()
    if (!oemResult || !oemResult.success) {
      success = false
    }
  } catch (error) {
    success = false
  }
  
  // 重置备份设置为默认值
  backupSettings.value = {
    autoBackupEnabled: false,
    autoBackupInterval: 24,
    backupPath: '',
    maxBackups: 10
  }
  
  try {
    const backupResult = await saveBackupSettings()
    if (!backupResult || !backupResult.success) {
      success = false
    }
  } catch (error) {
    success = false
  }
  
  if (success) {
    showToast('所有设置已重置为默认值', 'success')
  } else {
    showToast('部分设置重置失败', 'error')
  }
}
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

.btn-sm {
  @apply px-3 py-1 text-xs;
}

.loading-spinner {
  @apply w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin;
}

/* 开关样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #10b981;
}

input:checked + .slider:before {
  transform: translateX(24px);
}
</style>