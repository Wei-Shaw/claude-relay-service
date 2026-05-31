<template>
  <label class="language-switcher" :title="t('locale.language')">
    <i class="fas fa-globe text-xs opacity-70" />
    <select
      :aria-label="t('locale.language')"
      class="language-select"
      :value="locale"
      @change="handleLocaleChange"
    >
      <option v-for="item in supportedLocales" :key="item.value" :value="item.value">
        {{ t(item.labelKey) }}
      </option>
    </select>
  </label>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { setAppLocale, supportedLocales } from '@/i18n'

const { locale, t } = useI18n()

const handleLocaleChange = (event) => {
  setAppLocale(event.target.value)
}
</script>

<style scoped>
.language-switcher {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.25rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 0 0.65rem;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(12px);
}

.language-select {
  max-width: 7rem;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  outline: none;
}

.language-select option {
  color: #111827;
}
</style>
