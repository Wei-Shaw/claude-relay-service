import { ref } from 'vue'
import i18n from '@/i18n'

const showConfirmModal = ref(false)
const confirmOptions = ref({
  title: '',
  message: '',
  confirmText: i18n.global.t('common.confirmModal.continue'),
  cancelText: i18n.global.t('common.confirmModal.cancel')
})
const confirmResolve = ref(null)

export function useConfirm() {
  const showConfirm = (
    title,
    message,
    confirmText = i18n.global.t('common.confirmModal.continue'),
    cancelText = i18n.global.t('common.confirmModal.cancel')
  ) => {
    return new Promise((resolve) => {
      confirmOptions.value = {
        title,
        message,
        confirmText,
        cancelText
      }
      confirmResolve.value = resolve
      showConfirmModal.value = true
    })
  }

  const handleConfirm = () => {
    showConfirmModal.value = false
    if (confirmResolve.value) {
      confirmResolve.value(true)
      confirmResolve.value = null
    }
  }

  const handleCancel = () => {
    showConfirmModal.value = false
    if (confirmResolve.value) {
      confirmResolve.value(false)
      confirmResolve.value = null
    }
  }

  return {
    showConfirmModal,
    confirmOptions,
    showConfirm,
    handleConfirm,
    handleCancel
  }
}
