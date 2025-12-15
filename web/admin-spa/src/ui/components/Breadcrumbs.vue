<template>
  <nav aria-label="Breadcrumb" class="ds-breadcrumbs">
    <template v-for="(item, index) in items" :key="index">
      <component
        :is="item.href ? 'a' : 'span'"
        :class="[
          'ds-breadcrumb-item',
          {
            'ds-breadcrumb-item--active': index === items.length - 1
          }
        ]"
        :href="item.href"
        @click="handleClick(item, $event)"
      >
        {{ item.label }}
      </component>
      <span v-if="index < items.length - 1" class="ds-breadcrumb-separator">
        {{ separator }}
      </span>
    </template>
  </nav>
</template>

<script setup>
const emit = defineEmits(['click'])

defineProps({
  /**
   * Breadcrumb items
   * @example [{ label: 'Home', href: '/' }, { label: 'Page' }]
   */
  items: {
    type: Array,
    required: true,
    validator: (items) => items.every((item) => item.label)
  },

  /**
   * Separator character
   */
  separator: {
    type: String,
    default: '›'
  }
})

const handleClick = (item, event) => {
  emit('click', item, event)
}
</script>

<style scoped>
/**
 * Breadcrumbs Component Styles
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
}

.ds-breadcrumb-item {
  color: #666;
  text-decoration: none;
  transition: color 0.2s;
}

.ds-breadcrumb-item[href]:hover {
  color: #000;
}

.ds-breadcrumb-item--active {
  color: #000;
  font-weight: 500;
}

.ds-breadcrumb-separator {
  color: #999;
  user-select: none;
}

/* Dark mode support */
:global(.dark) .ds-breadcrumb-item {
  color: #b3b3b3;
}

:global(.dark) .ds-breadcrumb-item[href]:hover {
  color: #fff;
}

:global(.dark) .ds-breadcrumb-item--active {
  color: #fff;
}

:global(.dark) .ds-breadcrumb-separator {
  color: #666;
}
</style>
