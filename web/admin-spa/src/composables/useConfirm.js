import { ref } from 'vue'

const showConfirmModal = ref(false)
const confirmOptions = ref({
  title: '',
  message: '',
  confirmText: '继续',
  cancelText: '取消'
})
const confirmResolve = ref(null)

export function useConfirm() {
  const showConfirm = (title, message, confirmText = '继续', cancelText = '取消') => {
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
