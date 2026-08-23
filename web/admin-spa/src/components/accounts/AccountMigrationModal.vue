<template>
  <ModalTransition>
    <div
      v-if="show"
      class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      @click.self="close"
    >
      <div
        class="modal-content mx-auto flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-gray-800"
      >
        <!-- header -->
        <div
          class="flex items-center justify-between border-b border-gray-100 p-5 dark:border-gray-700"
        >
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">账户导入 / 导出</h3>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            @click="close"
          >
            <i class="fas fa-times" />
          </button>
        </div>

        <!-- tabs -->
        <div class="flex gap-2 border-b border-gray-100 px-5 pt-4 dark:border-gray-700">
          <button
            v-for="t in tabs"
            :key="t.key"
            :class="[
              'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
              activeTab === t.key
                ? 'bg-primary/10 text-primary'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            ]"
            @click="activeTab = t.key"
          >
            <i class="mr-1.5" :class="t.icon" />{{ t.label }}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          <ExportPanel v-if="activeTab === 'export'" :selected-ids="selectedIds" />
          <ImportPanel v-else @imported="$emit('imported')" />
        </div>
      </div>
    </div>
  </ModalTransition>
</template>

<script setup>
import { ref } from 'vue'
import ModalTransition from '@/components/common/ModalTransition.vue'
import ExportPanel from '@/components/accounts/migration/ExportPanel.vue'
import ImportPanel from '@/components/accounts/migration/ImportPanel.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'imported'])

const tabs = [
  { key: 'export', label: '导出', icon: 'fas fa-download' },
  { key: 'import', label: '导入', icon: 'fas fa-upload' }
]
const activeTab = ref('export')

function close() {
  emit('close')
}

// 引用 props 以满足 lint（selectedIds 透传给 ExportPanel）
void props.selectedIds
</script>
