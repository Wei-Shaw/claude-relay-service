<template>
  <Teleport v-if="teleport" to="body">
    <Transition appear name="ios-modal" @after-leave="emit('after-leave')">
      <slot />
    </Transition>
  </Teleport>

  <Transition v-else appear name="ios-modal" @after-leave="emit('after-leave')">
    <slot />
  </Transition>
</template>

<script setup>
// iOS 风格弹窗过渡：遮罩淡入淡出 + 面板弹簧缩放上移
// 用法：把弹窗根节点（带 v-if 的遮罩层）放进默认插槽即可
// 面板自动识别 .modal-content / .modal-panel，动画参数集中在 global.css 的 .ios-modal-* 规则
// teleport=false 用于依赖 scoped 样式、不能脱离原 DOM 位置的内联弹窗
defineProps({
  teleport: {
    type: Boolean,
    default: true
  }
})

// 退出动画结束后触发，供父控型弹窗在动画播完后再通知父级卸载
const emit = defineEmits(['after-leave'])
</script>
