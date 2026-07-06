import { ref } from 'vue'

const defaultConfirmConfig = {
  title: '',
  message: '',
  type: 'primary',
  confirmText: '确认',
  cancelText: '取消'
}

export const useConfirmModal = (defaults = {}) => {
  const showConfirmModal = ref(false)
  const confirmModalConfig = ref({
    ...defaultConfirmConfig,
    ...defaults
  })

  let confirmResolve = null

  const showConfirm = (
    title,
    message,
    confirmText = defaults.confirmText || defaultConfirmConfig.confirmText,
    cancelText = defaults.cancelText || defaultConfirmConfig.cancelText,
    type = defaults.type || defaultConfirmConfig.type
  ) =>
    new Promise((resolve) => {
      confirmModalConfig.value = { title, message, confirmText, cancelText, type }
      confirmResolve = resolve
      showConfirmModal.value = true
    })

  const resolveConfirm = (confirmed) => {
    showConfirmModal.value = false
    confirmResolve?.(confirmed)
    confirmResolve = null
  }

  return {
    showConfirmModal,
    confirmModalConfig,
    showConfirm,
    handleConfirmModal: () => resolveConfirm(true),
    handleCancelModal: () => resolveConfirm(false)
  }
}
