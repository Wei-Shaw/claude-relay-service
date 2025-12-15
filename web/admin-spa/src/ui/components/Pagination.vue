<template>
  <nav aria-label="Pagination" class="ds-pagination">
    <button
      class="ds-pagination-btn"
      :disabled="modelValue <= 1"
      type="button"
      @click="changePage(modelValue - 1)"
    >
      Previous
    </button>

    <button
      v-for="page in visiblePages"
      :key="page"
      :class="[
        'ds-pagination-btn',
        {
          'ds-pagination-btn--active': modelValue === page,
          'ds-pagination-ellipsis': page === '...'
        }
      ]"
      :disabled="page === '...'"
      type="button"
      @click="page !== '...' && changePage(page)"
    >
      {{ page }}
    </button>

    <button
      class="ds-pagination-btn"
      :disabled="modelValue >= totalPages"
      type="button"
      @click="changePage(modelValue + 1)"
    >
      Next
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /**
   * Current page (v-model)
   */
  modelValue: {
    type: Number,
    required: true
  },

  /**
   * Total number of pages
   */
  totalPages: {
    type: Number,
    required: true
  },

  /**
   * Maximum visible page buttons
   */
  maxVisible: {
    type: Number,
    default: 7
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const visiblePages = computed(() => {
  const current = props.modelValue
  const total = props.totalPages
  const max = props.maxVisible

  if (total <= max) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages = []
  const halfMax = Math.floor(max / 2)

  let start = Math.max(1, current - halfMax)
  let end = Math.min(total, current + halfMax)

  if (current <= halfMax) {
    end = max - 1
  }

  if (current >= total - halfMax) {
    start = total - max + 2
  }

  if (start > 1) {
    pages.push(1)
    if (start > 2) pages.push('...')
  }

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (end < total) {
    if (end < total - 1) pages.push('...')
    pages.push(total)
  }

  return pages
})

const changePage = (page) => {
  if (page >= 1 && page <= props.totalPages && page !== props.modelValue) {
    emit('update:modelValue', page)
    emit('change', page)
  }
}
</script>

<style scoped>
/**
 * Pagination Component Styles
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-pagination {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.ds-pagination-btn {
  padding: 0.5rem 0.75rem;
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 5px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  color: #000;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
  font-weight: 500;
  user-select: none;
}

.ds-pagination-btn:hover:not(:disabled):not(.ds-pagination-btn--active):not(
    .ds-pagination-ellipsis
  ) {
  border-color: #000;
}

.ds-pagination-btn--active {
  background: #000;
  color: #fff;
  border-color: #000;
}

.ds-pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ds-pagination-ellipsis {
  cursor: default;
  border-color: transparent;
  background: transparent;
}

/* Dark mode support */
:global(.dark) .ds-pagination-btn {
  background: #1a1a1a;
  border-color: #2c2c2c;
  color: #fff;
}

:global(.dark)
  .ds-pagination-btn:hover:not(:disabled):not(.ds-pagination-btn--active):not(
    .ds-pagination-ellipsis
  ) {
  border-color: #fff;
}

:global(.dark) .ds-pagination-btn--active {
  background: #fff;
  color: #000;
  border-color: #fff;
}

:global(.dark) .ds-pagination-ellipsis {
  background: transparent;
  border-color: transparent;
}
</style>
