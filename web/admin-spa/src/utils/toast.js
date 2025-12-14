/**
 * Toast notification utility using Sonner
 * This file provides backward compatibility with the old toast API
 */
import { toast } from 'sonner'

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of toast: 'success', 'error', 'warning', 'info'
 * @param {string} title - Optional title
 * @param {number} duration - Duration in milliseconds (default: 5000)
 * @returns {string|number} Toast ID
 */
export function showToast(message, type = 'info', title = '', duration = 5000) {
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
