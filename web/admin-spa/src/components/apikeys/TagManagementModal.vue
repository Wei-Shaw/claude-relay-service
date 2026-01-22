<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        @click.self="handleClose"
      >
        <div class="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-800" @click.stop>
          <!-- 头部 -->
          <div
            class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              <i class="fas fa-tags mr-2 text-purple-500" />
              标签管理
            </h3>
            <button
              class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              @click="handleClose"
            >
              <i class="fas fa-times" />
            </button>
          </div>

          <!-- 内容 -->
          <div class="max-h-[60vh] overflow-y-auto px-6 py-4">
            <!-- 新增标签 -->
            <div class="mb-4 flex gap-2">
              <input
                v-model="newTagInput"
                class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="输入新标签名称"
                type="text"
                @keyup.enter="createTag"
              />
              <button
                class="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-50"
                :disabled="!newTagInput.trim() || creating || processing"
                @click="createTag"
              >
                <i v-if="creating" class="fas fa-spinner fa-spin mr-1" />
                <i v-else class="fas fa-plus mr-1" />
                新增
              </button>
            </div>

            <div v-if="loading" class="py-8 text-center">
              <i class="fas fa-spinner fa-spin text-2xl text-gray-400" />
              <p class="mt-2 text-gray-500 dark:text-gray-400">加载中...</p>
            </div>

            <div v-else-if="tags.length === 0" class="py-8 text-center">
              <i class="fas fa-tag text-4xl text-gray-300 dark:text-gray-600" />
              <p class="mt-2 text-gray-500 dark:text-gray-400">暂无标签</p>
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="tag in tags"
                :key="tag.name"
                class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-700/50"
              >
                <div class="flex items-center gap-3">
                  <i class="fas fa-tag text-purple-500" />
                  <span class="font-medium text-gray-700 dark:text-gray-200">{{ tag.name }}</span>
                  <span
                    class="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  >
                    {{ tag.count }} 个 Key
                  </span>
                </div>
                <div class="flex gap-1">
                  <button
                    class="rounded-lg p-2 text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                    :disabled="processing"
                    title="重命名"
                    @click="startRename(tag)"
                  >
                    <i class="fas fa-edit" />
                  </button>
                  <button
                    class="rounded-lg p-2 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                    :disabled="processing"
                    title="删除标签"
                    @click="confirmDelete(tag)"
                  >
                    <i class="fas fa-trash" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部 -->
          <div class="flex justify-end border-t border-gray-200 px-6 py-4 dark:border-gray-700">
            <button
              class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              @click="handleClose"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 删除确认弹窗 -->
  <ConfirmModal
    cancel-text="取消"
    confirm-text="确定删除"
    :message="`此操作将从 ${confirmingTag?.count || 0} 个 API Key 中移除该标签，不可恢复。`"
    :show="showDeleteConfirm"
    :title="`删除标签「${confirmingTag?.name || ''}」`"
    type="danger"
    @cancel="showDeleteConfirm = false"
    @confirm="executeDelete"
  />

  <!-- 重命名弹窗 -->
  <Teleport to="body">
    <div
      v-if="showRenameModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      @click.self="showRenameModal = false"
    >
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
        <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">重命名标签</h3>
        <div class="mb-4">
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            新名称
          </label>
          <input
            v-model="newTagName"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="请输入新标签名称"
            type="text"
            @keyup.enter="executeRename"
          />
        </div>
        <div class="flex justify-end gap-3">
          <button
            class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            @click="showRenameModal = false"
          >
            取消
          </button>
          <button
            class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            :disabled="!newTagName.trim() || processing"
            @click="executeRename"
          >
            <i v-if="processing" class="fas fa-spinner fa-spin mr-1" />
            确定
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  getApiKeyTagsDetailsApi,
  createApiKeyTagApi,
  deleteApiKeyTagApi,
  renameApiKeyTagApi
} from '@/utils/http_apis'
import { showToast } from '@/utils/tools'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const props = defineProps({
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'updated'])

const loading = ref(false)
const processing = ref(false)
const creating = ref(false)
const tags = ref([])
const newTagInput = ref('')
const showDeleteConfirm = ref(false)
const showRenameModal = ref(false)
const confirmingTag = ref(null)
const renamingTag = ref(null)
const newTagName = ref('')

const loadTags = async () => {
  loading.value = true
  const res = await getApiKeyTagsDetailsApi()
  loading.value = false
  if (res.success) {
    tags.value = res.data
  }
}

const createTag = async () => {
  if (!newTagInput.value.trim()) return

  creating.value = true
  const res = await createApiKeyTagApi(newTagInput.value.trim())
  creating.value = false

  if (res.success) {
    showToast('标签创建成功', 'success')
    newTagInput.value = ''
    loadTags()
    emit('updated')
  } else {
    showToast(res.error || '创建失败', 'error')
  }
}

const confirmDelete = (tag) => {
  confirmingTag.value = tag
  showDeleteConfirm.value = true
}

const executeDelete = async () => {
  if (!confirmingTag.value) return

  showDeleteConfirm.value = false
  processing.value = true
  const tagName = confirmingTag.value.name
  const res = await deleteApiKeyTagApi(tagName)
  processing.value = false

  if (res.success) {
    showToast(`标签「${tagName}」已删除`, 'success')
    tags.value = tags.value.filter((t) => t.name !== tagName)
    confirmingTag.value = null
    emit('updated')
  } else {
    showToast(res.error || '删除失败', 'error')
  }
}

const startRename = (tag) => {
  renamingTag.value = tag
  newTagName.value = tag.name
  showRenameModal.value = true
}

const executeRename = async () => {
  if (!renamingTag.value || !newTagName.value.trim()) return

  processing.value = true
  const oldName = renamingTag.value.name
  const res = await renameApiKeyTagApi(oldName, newTagName.value.trim())
  processing.value = false

  if (res.success) {
    showToast('标签已重命名', 'success')
    showRenameModal.value = false
    renamingTag.value = null
    loadTags()
    emit('updated')
  } else {
    showToast(res.error || '重命名失败', 'error')
  }
}

const handleClose = () => {
  confirmingTag.value = null
  emit('close')
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      confirmingTag.value = null
      newTagInput.value = ''
      loadTags()
    }
  }
)
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
