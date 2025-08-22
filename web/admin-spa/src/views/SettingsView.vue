<template>
  <div class="settings-container">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 sm:mb-6">
        <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
          其他设置
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">自定义网站名称和图标</p>
      </div>

      <div v-if="loading" class="py-12 text-center">
        <div class="loading-spinner mx-auto mb-4" />
        <p class="text-gray-500 dark:text-gray-400">正在加载设置...</p>
      </div>

      <!-- 桌面端表格视图 -->
      <div v-else class="table-container hidden sm:block">
        <table class="min-w-full">
          <tbody class="divide-y divide-gray-200/50 dark:divide-gray-600/50">
            <!-- 网站名称 -->
            <tr class="table-row">
              <td class="w-48 whitespace-nowrap px-6 py-4">
                <div class="flex items-center">
                  <div
                    class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
                  >
                    <i class="fas fa-font text-xs text-white" />
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      网站名称
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">品牌标识</div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4">
                <input
                  v-model="oemSettings.siteName"
                  class="form-input w-full max-w-md dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  maxlength="100"
                  placeholder="Claude Relay Service"
                  type="text"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  将显示在浏览器标题和页面头部
                </p>
              </td>
            </tr>

            <!-- 网站图标 -->
            <tr class="table-row">
              <td class="w-48 whitespace-nowrap px-6 py-4">
                <div class="flex items-center">
                  <div
                    class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-600"
                  >
                    <i class="fas fa-image text-xs text-white" />
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      网站图标
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">Favicon</div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4">
                <div class="space-y-3">
                  <!-- 图标预览 -->
                  <div
                    v-if="oemSettings.siteIconData || oemSettings.siteIcon"
                    class="inline-flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
                  >
                    <img
                      alt="图标预览"
                      class="h-8 w-8"
                      :src="oemSettings.siteIconData || oemSettings.siteIcon"
                      @error="handleIconError"
                    />
                    <span class="text-sm text-gray-600 dark:text-gray-400">当前图标</span>
                    <button
                      class="rounded-lg px-3 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900"
                      @click="removeIcon"
                    >
                      <i class="fas fa-trash mr-1" />删除
                    </button>
                  </div>

                  <!-- 文件上传 -->
                  <div>
                    <input
                      ref="iconFileInput"
                      accept=".ico,.png,.jpg,.jpeg,.svg"
                      class="hidden"
                      type="file"
                      @change="handleIconUpload"
                    />
                    <button class="btn btn-success px-4 py-2" @click="$refs.iconFileInput.click()">
                      <i class="fas fa-upload mr-2" />
                      上传图标
                    </button>
                    <span class="ml-3 text-xs text-gray-500 dark:text-gray-400"
                      >支持 .ico, .png, .jpg, .svg 格式，最大 350KB</span
                    >
                  </div>
                </div>
              </td>
            </tr>

            <!-- 操作按钮 -->
            <tr>
              <td class="px-6 py-6" colspan="2">
                <div class="flex items-center justify-between">
                  <div class="flex gap-3">
                    <button
                      class="btn btn-primary px-6 py-3"
                      :class="{ 'cursor-not-allowed opacity-50': saving }"
                      :disabled="saving"
                      @click="saveOemSettings"
                    >
                      <div v-if="saving" class="loading-spinner mr-2" />
                      <i v-else class="fas fa-save mr-2" />
                      {{ saving ? '保存中...' : '保存设置' }}
                    </button>

                    <button
                      class="btn bg-gray-100 px-6 py-3 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                      :disabled="saving"
                      @click="resetOemSettings"
                    >
                      <i class="fas fa-undo mr-2" />
                      重置为默认
                    </button>
                  </div>

                  <div
                    v-if="oemSettings.updatedAt"
                    class="text-sm text-gray-500 dark:text-gray-400"
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
      <div v-if="!loading" class="space-y-4 sm:hidden">
        <!-- 网站名称设置卡片 -->
        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
          <div class="mb-3 flex items-center gap-3">
            <div
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
            >
              <i class="fas fa-font text-sm text-white" />
            </div>
            <div>
              <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">网站名称</h4>
              <p class="text-xs text-gray-500">品牌标识</p>
            </div>
          </div>
          <div class="space-y-2">
            <input
              v-model="oemSettings.siteName"
              class="form-input w-full text-sm dark:border-gray-500 dark:bg-gray-600 dark:text-gray-200"
              maxlength="100"
              placeholder="Claude Relay Service"
              type="text"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400">将显示在浏览器标题和页面头部</p>
          </div>
        </div>

        <!-- 网站图标设置卡片 -->
        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
          <div class="mb-3 flex items-center gap-3">
            <div
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-600"
            >
              <i class="fas fa-image text-sm text-white" />
            </div>
            <div>
              <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">网站图标</h4>
              <p class="text-xs text-gray-500 dark:text-gray-400">Favicon</p>
            </div>
          </div>
          <div class="space-y-3">
            <!-- 图标预览 -->
            <div
              v-if="oemSettings.siteIconData || oemSettings.siteIcon"
              class="inline-flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800"
            >
              <img
                alt="图标预览"
                class="h-8 w-8"
                :src="oemSettings.siteIconData || oemSettings.siteIcon"
                @error="handleIconError"
              />
              <span class="flex-1 text-sm text-gray-600 dark:text-gray-400">当前图标</span>
              <button
                class="rounded-lg px-3 py-1 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900"
                @click="removeIcon"
              >
                <i class="fas fa-trash mr-1" />删除
              </button>
            </div>

            <!-- 上传按钮 -->
            <input
              ref="iconFileInput"
              accept="image/*"
              style="display: none"
              type="file"
              @change="handleIconUpload"
            />
            <div class="flex flex-col gap-2">
              <button
                class="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                @click="$refs.iconFileInput.click()"
              >
                <i class="fas fa-upload" />
                上传图标
              </button>
              <div class="text-xs text-gray-500 dark:text-gray-400">或者输入图标URL：</div>
              <input
                v-model="oemSettings.siteIcon"
                class="form-input w-full text-sm dark:border-gray-500 dark:bg-gray-600 dark:text-gray-200"
                placeholder="https://example.com/icon.png"
                type="url"
              />
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
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
            <div v-if="saving" class="loading-spinner mr-2" />
            <i v-else class="fas fa-save mr-2" />
            {{ saving ? '保存中...' : '保存设置' }}
          </button>

          <button
            class="btn w-full bg-gray-100 py-3 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            :disabled="saving"
            @click="resetOemSettings"
          >
            <i class="fas fa-undo mr-2" />
            重置为默认
          </button>

          <div
            v-if="oemSettings.updatedAt"
            class="text-center text-xs text-gray-500 dark:text-gray-400"
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
    validation.errors.forEach((error) => showToast(error, 'error'))
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

:root.dark .card {
  background: #1f2937;
  border: 1px solid #374151;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.table-container {
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid #f3f4f6;
}

:root.dark .table-container {
  border: 1px solid #4b5563;
}

.table-row {
  transition: background-color 0.2s ease;
}

.table-row:hover {
  background-color: #f9fafb;
}

:root.dark .table-row:hover {
  background-color: #374151;
}

.form-input {
  @apply w-full rounded-lg border border-gray-300 px-4 py-2 transition-all duration-200 focus:border-transparent focus:ring-2 focus:ring-blue-500;
}

.btn {
  @apply inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}

.btn-success {
  @apply bg-green-600 text-white hover:bg-green-700 focus:ring-green-500;
}

.loading-spinner {
  @apply h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600;
}
</style>
