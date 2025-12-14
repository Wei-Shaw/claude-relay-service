/**
 * Design System - Component Index
 * Unified export of all UI components
 *
 * USAGE RULES:
 * 1. Import components ONLY from this index
 * 2. Never import components directly from their file paths
 * 3. Never use raw Tailwind utilities in business components/views
 *
 * @example
 * // ✅ CORRECT
 * import { Button, Progress, Badge } from '@/ui'
 *
 * // ❌ WRONG
 * import Button from '@/ui/components/Button.vue'
 */

// Core Components
export { default as Alert } from './components/Alert.vue'
export { default as Badge } from './components/Badge.vue'
export { default as Button } from './components/Button.vue'
export { default as Card } from './components/Card.vue'
export { default as Input } from './components/Input.vue'
export { default as Progress } from './components/Progress.vue'
export { default as Spinner } from './components/Spinner.vue'
export { default as Table } from './components/Table.vue'
export { default as Tabs } from './components/Tabs.vue'

// Design Tokens
export * from './tokens'
