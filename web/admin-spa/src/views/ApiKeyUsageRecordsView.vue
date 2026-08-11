<template>
  <ApiKeyUsageRecordsPanel
    :fetch-api="getApiKeyUsageRecordsApi"
    :key-id="keyId"
    :show-back="true"
    @back="goBack"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ApiKeyUsageRecordsPanel from '@/components/apikeys/api_key_usage_records_panel.vue'
import { getApiKeyUsageRecordsApi } from '@/utils/http_apis'

const route = useRoute()
const router = useRouter()

const keyId = computed(() => String(route.params.keyId || ''))

const goBack = () => {
  router.push('/api-keys')
}
</script>
