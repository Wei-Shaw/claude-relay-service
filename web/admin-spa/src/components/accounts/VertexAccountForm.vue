<template>
  <Teleport to="body">
    <div v-if="show" class="modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        class="modal-content custom-scrollbar mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white/90 p-4 shadow-xl backdrop-blur-xl dark:bg-gray-800/95 dark:shadow-2xl sm:p-6 md:p-8"
      >
        <div class="mb-4 flex items-center justify-between sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 sm:h-10 sm:w-10 sm:rounded-xl"
            >
              <i class="fas fa-cloud text-sm text-white sm:text-base" />
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
              {{ isEdit ? '编辑 Vertex AI 账户' : '添加 Vertex AI 账户' }}
            </h3>
          </div>
          <button
            class="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>

        <div class="space-y-6">
          <!-- 基本信息 -->
          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >账户名称 *</label
            >
            <input
              v-model="form.name"
              class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              :class="{ 'border-red-500': errors.name }"
              placeholder="为账户设置一个易识别的名称"
              required
              type="text"
            />
            <p v-if="errors.name" class="mt-1 text-xs text-red-500">{{ errors.name }}</p>
          </div>

          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
              >描述（可选）</label
            >
            <textarea
              v-model="form.description"
              class="form-input w-full resize-none border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              placeholder="账户用途说明..."
              rows="3"
            />
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >GCP 项目 ID *</label
              >
              <input
                v-model="form.projectId"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                :class="{ 'border-red-500': errors.projectId }"
                placeholder="例如：my-gcp-project"
                required
                type="text"
              />
              <p v-if="errors.projectId" class="mt-1 text-xs text-red-500">
                {{ errors.projectId }}
              </p>
            </div>
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >区域 *</label
              >
              <select
                v-model="form.region"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                <option value="global">global</option>
                <option value="us-east5">us-east5</option>
                <option value="us-central1">us-central1</option>
                <option value="europe-west1">europe-west1</option>
                <option value="europe-west4">europe-west4</option>
                <option value="asia-southeast1">asia-southeast1</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >默认模型</label
              >
              <input
                v-model="form.defaultModel"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                placeholder="例如：claude-sonnet-4-5@20250929"
                type="text"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Vertex 模型 ID 必须含 @&lt;date&gt; 后缀
              </p>
            </div>
            <div>
              <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >优先级</label
              >
              <input
                v-model.number="form.priority"
                class="form-input w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                max="100"
                min="1"
                placeholder="默认50，数字越小优先级越高"
                type="number"
              />
            </div>
          </div>

          <!-- Service Account JSON 凭证 -->
          <div>
            <label class="mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Service Account JSON {{ isEdit ? '（留空不更新）' : '*' }}
            </label>
            <div class="mb-3 flex items-center gap-3">
              <label
                class="cursor-pointer rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
              >
                <i class="fas fa-upload mr-1" /> 上传 JSON 文件
                <input
                  ref="fileInput"
                  accept=".json,application/json"
                  class="hidden"
                  type="file"
                  @change="onFileChange"
                />
              </label>
              <span v-if="credentialsFileName" class="text-xs text-gray-600 dark:text-gray-400">
                已选择：{{ credentialsFileName }}
              </span>
            </div>
            <textarea
              v-model="form.credentialsJsonText"
              class="form-input w-full resize-none border-gray-300 font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              :class="{ 'border-red-500': errors.credentialsJson }"
              :placeholder="
                isEdit ? '留空表示不更新现有凭证' : '粘贴 Google Cloud Service Account JSON 全文'
              "
              rows="8"
            />
            <p v-if="errors.credentialsJson" class="mt-1 text-xs text-red-500">
              {{ errors.credentialsJson }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              凭证将以 AES-256 加密形式存储于 Redis
            </p>
          </div>

          <!-- 代理配置 -->
          <div>
            <ProxyConfig v-model="form.proxy" />
          </div>

          <!-- 操作区 -->
          <div class="mt-2 flex gap-3">
            <button
              class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              type="button"
              @click="$emit('close')"
            >
              取消
            </button>
            <button
              class="btn btn-primary flex-1 px-6 py-3 font-semibold"
              :disabled="loading"
              type="button"
              @click="submit"
            >
              <div v-if="loading" class="loading-spinner mr-2" />
              {{ loading ? (isEdit ? '保存中...' : '创建中...') : isEdit ? '保存' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { updateVertexAccountApi, createVertexAccountApi } from '@/utils/http_apis'
import { showToast } from '@/utils/tools'
import ProxyConfig from '@/components/accounts/ProxyConfig.vue'

const props = defineProps({
  account: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const show = ref(true)
const isEdit = computed(() => !!props.account)
const loading = ref(false)
const fileInput = ref(null)
const credentialsFileName = ref('')

const form = ref({
  name: '',
  description: '',
  projectId: '',
  region: 'global',
  defaultModel: 'claude-sonnet-4-5@20250929',
  priority: 50,
  credentialsJsonText: '',
  proxy: null
})

const errors = ref({})

const onFileChange = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  credentialsFileName.value = file.name
  try {
    const text = await file.text()
    // 验证是合法 JSON
    JSON.parse(text)
    form.value.credentialsJsonText = text
    errors.value.credentialsJson = ''
  } catch (e) {
    errors.value.credentialsJson = `文件不是有效 JSON: ${e.message}`
  }
}

const validate = () => {
  const e = {}
  if (!form.value.name || form.value.name.trim().length === 0) {
    e.name = '名称不能为空'
  }
  if (!form.value.projectId || form.value.projectId.trim().length === 0) {
    e.projectId = 'GCP 项目 ID 不能为空'
  }
  if (!isEdit.value) {
    const trimmed = (form.value.credentialsJsonText || '').trim()
    if (!trimmed) {
      e.credentialsJson = 'Service Account JSON 不能为空'
    } else {
      try {
        const parsed = JSON.parse(trimmed)
        if (!parsed.client_email || !parsed.private_key) {
          e.credentialsJson = 'JSON 缺少 client_email 或 private_key 字段'
        }
      } catch (err) {
        e.credentialsJson = `JSON 解析失败: ${err.message}`
      }
    }
  } else if (form.value.credentialsJsonText && form.value.credentialsJsonText.trim()) {
    try {
      const parsed = JSON.parse(form.value.credentialsJsonText)
      if (!parsed.client_email || !parsed.private_key) {
        e.credentialsJson = 'JSON 缺少 client_email 或 private_key 字段'
      }
    } catch (err) {
      e.credentialsJson = `JSON 解析失败: ${err.message}`
    }
  }
  errors.value = e
  return Object.keys(e).length === 0
}

const submit = async () => {
  if (!validate()) return
  loading.value = true
  try {
    if (isEdit.value) {
      const updates = {
        name: form.value.name,
        description: form.value.description,
        projectId: form.value.projectId,
        region: form.value.region,
        defaultModel: form.value.defaultModel,
        priority: Number(form.value.priority || 50),
        proxy: form.value.proxy || null
      }
      if (form.value.credentialsJsonText && form.value.credentialsJsonText.trim().length > 0) {
        updates.credentialsJson = JSON.parse(form.value.credentialsJsonText)
      }
      const res = await updateVertexAccountApi(props.account.id, updates)
      if (res.success) {
        emit('success')
      } else {
        showToast(res.message || '保存失败', 'error')
      }
    } else {
      const payload = {
        name: form.value.name,
        description: form.value.description,
        projectId: form.value.projectId,
        region: form.value.region,
        defaultModel: form.value.defaultModel,
        priority: Number(form.value.priority || 50),
        accountType: 'shared',
        credentialsJson: JSON.parse(form.value.credentialsJsonText),
        proxy: form.value.proxy || null
      }
      const res = await createVertexAccountApi(payload)
      if (res.success) {
        emit('success')
      } else {
        showToast(res.message || '创建失败', 'error')
      }
    }
  } catch (err) {
    showToast(err.message || '请求失败', 'error')
  } finally {
    loading.value = false
  }
}

const populateFromAccount = () => {
  if (!props.account) return
  const a = props.account
  form.value.name = a.name || ''
  form.value.description = a.description || ''
  form.value.projectId = a.projectId || ''
  form.value.region = a.region || 'global'
  form.value.defaultModel = a.defaultModel || 'claude-sonnet-4-5@20250929'
  form.value.priority = Number(a.priority || 50)
  form.value.proxy = a.proxy || null
  form.value.credentialsJsonText = ''
}

onMounted(() => {
  if (isEdit.value) populateFromAccount()
})

watch(
  () => props.account,
  () => {
    if (isEdit.value) populateFromAccount()
  }
)
</script>

<style scoped>
.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e5e7eb;
  border-top: 2px solid #1d4ed8;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
