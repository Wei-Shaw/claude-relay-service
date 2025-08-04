<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 modal z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <div class="modal-content w-full max-w-4xl p-4 sm:p-6 md:p-8 mx-auto max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div class="flex items-center justify-between mb-4 sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg sm:rounded-xl flex items-center justify-center">
              <i class="fas fa-layer-group text-white text-sm sm:text-base" />
            </div>
            <h3 class="text-lg sm:text-xl font-bold text-gray-900">
              账户分组管理
            </h3>
          </div>
          <button 
            class="text-gray-400 hover:text-gray-600 transition-colors p-1"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>
        
        <!-- 添加分组按钮 -->
        <div class="mb-6">
          <button
            class="btn btn-primary px-4 py-2"
            @click="showCreateForm = true"
          >
            <i class="fas fa-plus mr-2" />
            创建新分组
          </button>
        </div>
        
        <!-- 创建分组表单 -->
        <div
          v-if="showCreateForm"
          class="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200"
        >
          <h4 class="text-lg font-semibold text-gray-900 mb-4">
            创建新分组
          </h4>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">分组名称 *</label>
              <input
                v-model="createForm.name"
                type="text"
                class="form-input w-full"
                placeholder="输入分组名称"
              >
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">平台类型 *</label>
              <div class="flex gap-4">
                <label class="flex items-center cursor-pointer">
                  <input
                    v-model="createForm.platform"
                    type="radio"
                    value="claude"
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">Claude</span>
                </label>
                <label class="flex items-center cursor-pointer">
                  <input
                    v-model="createForm.platform"
                    type="radio"
                    value="gemini"
                    class="mr-2"
                  >
                  <span class="text-sm text-gray-700">Gemini</span>
                </label>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">描述 (可选)</label>
              <textarea
                v-model="createForm.description"
                rows="2"
                class="form-input w-full resize-none"
                placeholder="分组描述..."
              />
            </div>
            
            <div class="flex gap-3">
              <button
                class="btn btn-primary px-4 py-2"
                :disabled="!createForm.name || !createForm.platform || creating"
                @click="createGroup"
              >
                <div
                  v-if="creating"
                  class="loading-spinner mr-2"
                />
                {{ creating ? '创建中...' : '创建' }}
              </button>
              <button
                class="btn btn-secondary px-4 py-2"
                @click="cancelCreate"
              >
                取消
              </button>
            </div>
          </div>
        </div>
        
        <!-- 分组列表 -->
        <div class="space-y-4">
          <div
            v-if="loading"
            class="text-center py-8"
          >
            <div class="loading-spinner-lg mx-auto mb-4" />
            <p class="text-gray-500">
              加载中...
            </p>
          </div>
          
          <div
            v-else-if="groups.length === 0"
            class="text-center py-8 bg-gray-50 rounded-lg"
          >
            <i class="fas fa-layer-group text-4xl text-gray-300 mb-4" />
            <p class="text-gray-500">
              暂无分组
            </p>
          </div>
          
          <div
            v-else
            class="grid gap-4 grid-cols-1 md:grid-cols-2"
          >
            <div
              v-for="group in groups"
              :key="group.id"
              class="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-900">
                    {{ group.name }}
                  </h4>
                  <p class="text-sm text-gray-500 mt-1">
                    {{ group.description || '暂无描述' }}
                  </p>
                </div>
                <div class="flex items-center gap-2 ml-4">
                  <span
                    :class="[
                      'px-2 py-1 text-xs font-medium rounded-full',
                      group.platform === 'claude' 
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    ]"
                  >
                    {{ group.platform === 'claude' ? 'Claude' : 'Gemini' }}
                  </span>
                </div>
              </div>
              
              <div class="flex items-center justify-between text-sm text-gray-600">
                <div class="flex items-center gap-4">
                  <span>
                    <i class="fas fa-users mr-1" />
                    {{ group.memberCount || 0 }} 个成员
                  </span>
                  <span>
                    <i class="fas fa-clock mr-1" />
                    {{ formatDate(group.createdAt) }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="text-blue-600 hover:text-blue-800 transition-colors"
                    title="编辑"
                    @click="editGroup(group)"
                  >
                    <i class="fas fa-edit" />
                  </button>
                  <button
                    class="text-red-600 hover:text-red-800 transition-colors"
                    title="删除"
                    :disabled="group.memberCount > 0"
                    @click="deleteGroup(group)"
                  >
                    <i class="fas fa-trash" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 编辑分组模态框 -->
    <div
      v-if="showEditForm"
      class="fixed inset-0 modal z-60 flex items-center justify-center p-3 sm:p-4"
    >
      <div class="modal-content w-full max-w-lg p-4 sm:p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-gray-900">
            编辑分组
          </h3>
          <button
            class="text-gray-400 hover:text-gray-600 transition-colors"
            @click="cancelEdit"
          >
            <i class="fas fa-times" />
          </button>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">分组名称 *</label>
            <input
              v-model="editForm.name"
              type="text"
              class="form-input w-full"
              placeholder="输入分组名称"
            >
          </div>
          
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">平台类型</label>
            <div class="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600">
              {{ editForm.platform === 'claude' ? 'Claude' : 'Gemini' }}
              <span class="text-xs text-gray-500 ml-2">(不可修改)</span>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">描述 (可选)</label>
            <textarea
              v-model="editForm.description"
              rows="2"
              class="form-input w-full resize-none"
              placeholder="分组描述..."
            />
          </div>
          
          <div class="flex gap-3 pt-4">
            <button
              class="btn btn-primary px-4 py-2 flex-1"
              :disabled="!editForm.name || updating"
              @click="updateGroup"
            >
              <div
                v-if="updating"
                class="loading-spinner mr-2"
              />
              {{ updating ? '更新中...' : '更新' }}
            </button>
            <button
              class="btn btn-secondary px-4 py-2 flex-1"
              @click="cancelEdit"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'

const emit = defineEmits(['close', 'refresh'])

const show = ref(true)
const loading = ref(false)
const groups = ref([])

// 创建表单
const showCreateForm = ref(false)
const creating = ref(false)
const createForm = ref({
  name: '',
  platform: 'claude',
  description: ''
})

// 编辑表单
const showEditForm = ref(false)
const updating = ref(false)
const editingGroup = ref(null)
const editForm = ref({
  name: '',
  platform: '',
  description: ''
})

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN')
}

// 加载分组列表
const loadGroups = async () => {
  loading.value = true
  try {
    const response = await apiClient.get('/admin/account-groups')
    groups.value = response.data || []
  } catch (error) {
    showToast('加载分组列表失败', 'error')
  } finally {
    loading.value = false
  }
}

// 创建分组
const createGroup = async () => {
  if (!createForm.value.name || !createForm.value.platform) {
    showToast('请填写必填项', 'error')
    return
  }
  
  creating.value = true
  try {
    await apiClient.post('/admin/account-groups', {
      name: createForm.value.name,
      platform: createForm.value.platform,
      description: createForm.value.description
    })
    
    showToast('分组创建成功', 'success')
    cancelCreate()
    await loadGroups()
    emit('refresh')
  } catch (error) {
    showToast(error.response?.data?.error || '创建分组失败', 'error')
  } finally {
    creating.value = false
  }
}

// 取消创建
const cancelCreate = () => {
  showCreateForm.value = false
  createForm.value = {
    name: '',
    platform: 'claude',
    description: ''
  }
}

// 编辑分组
const editGroup = (group) => {
  editingGroup.value = group
  editForm.value = {
    name: group.name,
    platform: group.platform,
    description: group.description || ''
  }
  showEditForm.value = true
}

// 更新分组
const updateGroup = async () => {
  if (!editForm.value.name) {
    showToast('请填写分组名称', 'error')
    return
  }
  
  updating.value = true
  try {
    await apiClient.put(`/admin/account-groups/${editingGroup.value.id}`, {
      name: editForm.value.name,
      description: editForm.value.description
    })
    
    showToast('分组更新成功', 'success')
    cancelEdit()
    await loadGroups()
    emit('refresh')
  } catch (error) {
    showToast(error.response?.data?.error || '更新分组失败', 'error')
  } finally {
    updating.value = false
  }
}

// 取消编辑
const cancelEdit = () => {
  showEditForm.value = false
  editingGroup.value = null
  editForm.value = {
    name: '',
    platform: '',
    description: ''
  }
}

// 删除分组
const deleteGroup = async (group) => {
  if (group.memberCount > 0) {
    showToast('分组内还有成员，无法删除', 'error')
    return
  }
  
  if (!confirm(`确定要删除分组 "${group.name}" 吗？`)) {
    return
  }
  
  try {
    await apiClient.delete(`/admin/account-groups/${group.id}`)
    showToast('分组删除成功', 'success')
    await loadGroups()
    emit('refresh')
  } catch (error) {
    showToast(error.response?.data?.error || '删除分组失败', 'error')
  }
}

// 组件挂载时加载数据
onMounted(() => {
  loadGroups()
})
</script>