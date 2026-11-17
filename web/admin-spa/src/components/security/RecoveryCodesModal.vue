<template>
  <teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/70 px-4 py-6 backdrop-blur-sm"
    >
      <div class="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-900">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-500">
              Recovery Codes
            </p>
            <h3 class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              保存这些恢复码
            </h3>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              每个恢复码只能使用一次。关闭此窗口后，明文不会再次展示。
            </p>
          </div>
          <button
            class="rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-500 transition hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:text-white"
            type="button"
            @click="$emit('close')"
          >
            关闭
          </button>
        </div>

        <div
          class="mt-6 grid grid-cols-1 gap-3 rounded-3xl bg-gray-50 p-4 font-mono text-sm text-gray-800 dark:bg-gray-950 dark:text-gray-100 sm:grid-cols-2"
        >
          <div
            v-for="code in recoveryCodes"
            :key="code"
            class="rounded-2xl border border-gray-200 bg-white px-4 py-3 tracking-[0.18em] dark:border-gray-800 dark:bg-gray-900"
          >
            {{ code }}
          </div>
        </div>

        <div class="mt-6 flex items-center justify-between gap-3">
          <button
            class="rounded-2xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
            type="button"
            @click="copyCodes"
          >
            <i class="fas fa-copy mr-2" />
            复制全部
          </button>
          <button
            class="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            type="button"
            @click="$emit('acknowledge')"
          >
            我已保存
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { showToast } from '@/utils/tools'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  recoveryCodes: {
    type: Array,
    default: () => []
  }
})

defineEmits(['close', 'acknowledge'])

const copyCodes = async () => {
  try {
    await navigator.clipboard.writeText(props.recoveryCodes.join('\n'))
    showToast('恢复码已复制', 'success')
  } catch (error) {
    showToast('复制失败，请手动保存', 'error')
  }
}
</script>
