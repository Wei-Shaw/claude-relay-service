import { toast } from 'sonner'

/**
 * Toast notification composable using Sonner
 * Compatible with the old showToast API
 */
export function useToast() {
  /**
   * Show a toast notification
   * @param {string} message - The message to display
   * @param {string} type - The type of toast: 'success', 'error', 'warning', 'info'
   * @param {string|null} title - Optional title (not used in simple API but kept for compatibility)
   * @param {number} duration - Duration in milliseconds (default: 5000)
   * @returns {string|number} Toast ID
   */
  const showToast = (message, type = 'info', title = null, duration = 5000) => {
    const options = {
      duration: duration
    }

    // If title is provided, display it with the message
    const displayMessage = title ? `${title}: ${message}` : message

    switch (type) {
      case 'success':
        return toast.success(displayMessage, options)
      case 'error':
        return toast.error(displayMessage, options)
      case 'warning':
        return toast.warning(displayMessage, options)
      case 'info':
        return toast.info(displayMessage, options)
      default:
        return toast(displayMessage, options)
    }
  }

  return {
    showToast,
    // Expose individual toast methods for direct use
    success: (message, duration = 5000) => toast.success(message, { duration }),
    error: (message, duration = 5000) => toast.error(message, { duration }),
    warning: (message, duration = 5000) => toast.warning(message, { duration }),
    info: (message, duration = 5000) => toast.info(message, { duration }),
    loading: (message) => toast.loading(message),
    promise: toast.promise,
    dismiss: toast.dismiss
  }
}

/**
 * Legacy function export for backwards compatibility
 * @deprecated Use useToast() composable instead
 */
export function showToast(message, type = 'info', title = null, duration = 5000) {
  const { showToast: show } = useToast()
  return show(message, type, title, duration)
}
