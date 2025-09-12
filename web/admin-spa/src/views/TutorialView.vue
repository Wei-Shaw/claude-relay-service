<template>
  <component :is="currentTutorialComponent" />
</template>

<script setup>
import { computed } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import TutorialViewZhCn from './tutorials/TutorialView-zh-cn.vue'
import TutorialViewZhTw from './tutorials/TutorialView-zh-tw.vue'
import TutorialViewEn from './tutorials/TutorialView-en.vue'

const localeStore = useLocaleStore()

// 根据当前语言选择教程组件
const currentTutorialComponent = computed(() => {
  const locale = localeStore.currentLocale
  const components = {
    'zh-cn': TutorialViewZhCn,
    'zh-tw': TutorialViewZhTw,
    en: TutorialViewEn
  }
  return components[locale] || TutorialViewZhCn
})
</script>
