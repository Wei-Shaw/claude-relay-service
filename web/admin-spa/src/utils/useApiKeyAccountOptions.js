import { ref } from 'vue'
import { showToast } from '@/utils/tools'
import * as httpApis from '@/utils/http_apis'

const createEmptyAccountOptions = () => ({
  claude: [],
  gemini: [],
  openai: [],
  bedrock: [],
  droid: [],
  claudeGroups: [],
  geminiGroups: [],
  openaiGroups: [],
  droidGroups: []
})

const mapAccounts = (accounts = [], platform) =>
  accounts.map((account) => ({
    ...account,
    ...(platform ? { platform } : {}),
    isDedicated: account.accountType === 'dedicated'
  }))

const mapPropAccounts = (accounts = [], fallbackPlatform) =>
  accounts.map((account) => ({
    ...account,
    platform: account.platform || fallbackPlatform
  }))

const pickGroups = (groups = [], platform) => groups.filter((group) => group.platform === platform)

export const useApiKeyAccountOptions = () => {
  const accountsLoading = ref(false)
  const localAccounts = ref(createEmptyAccountOptions())

  const setLocalAccountsFromProps = (accounts) => {
    if (!accounts) {
      return
    }

    localAccounts.value = {
      claude: accounts.claude || [],
      gemini: mapPropAccounts(accounts.gemini || [], 'gemini'),
      openai: [
        ...mapPropAccounts(accounts.openai || [], 'openai'),
        ...mapPropAccounts(accounts.openaiResponses || [], 'openai-responses')
      ],
      bedrock: accounts.bedrock || [],
      droid: mapPropAccounts(accounts.droid || [], 'droid'),
      claudeGroups: accounts.claudeGroups || [],
      geminiGroups: accounts.geminiGroups || [],
      openaiGroups: accounts.openaiGroups || [],
      droidGroups: accounts.droidGroups || []
    }
  }

  const refreshAccounts = async () => {
    accountsLoading.value = true
    try {
      const [
        claudeData,
        claudeConsoleData,
        geminiData,
        geminiApiData,
        openaiData,
        openaiResponsesData,
        bedrockData,
        droidData,
        groupsData
      ] = await Promise.all([
        httpApis.getClaudeAccountsApi(),
        httpApis.getClaudeConsoleAccountsApi(),
        httpApis.getGeminiAccountsApi(),
        httpApis.getGeminiApiAccountsApi(),
        httpApis.getOpenAIAccountsApi(),
        httpApis.getOpenAIResponsesAccountsApi(),
        httpApis.getBedrockAccountsApi(),
        httpApis.getDroidAccountsApi(),
        httpApis.getAccountGroupsApi()
      ])

      localAccounts.value.claude = [
        ...(claudeData.success ? mapAccounts(claudeData.data || [], 'claude-oauth') : []),
        ...(claudeConsoleData.success
          ? mapAccounts(claudeConsoleData.data || [], 'claude-console')
          : [])
      ]

      localAccounts.value.gemini = [
        ...(geminiData.success ? mapAccounts(geminiData.data || [], 'gemini') : []),
        ...(geminiApiData.success ? mapAccounts(geminiApiData.data || [], 'gemini-api') : [])
      ]

      localAccounts.value.openai = [
        ...(openaiData.success ? mapAccounts(openaiData.data || [], 'openai') : []),
        ...(openaiResponsesData.success
          ? mapAccounts(openaiResponsesData.data || [], 'openai-responses')
          : [])
      ]

      if (bedrockData.success) {
        localAccounts.value.bedrock = mapAccounts(bedrockData.data || [])
      }

      if (droidData.success) {
        localAccounts.value.droid = mapAccounts(droidData.data || [], 'droid')
      }

      if (groupsData.success) {
        const allGroups = groupsData.data || []
        localAccounts.value.claudeGroups = pickGroups(allGroups, 'claude')
        localAccounts.value.geminiGroups = pickGroups(allGroups, 'gemini')
        localAccounts.value.openaiGroups = pickGroups(allGroups, 'openai')
        localAccounts.value.droidGroups = pickGroups(allGroups, 'droid')
      }

      showToast('账号列表已刷新', 'success')
    } catch (error) {
      showToast('刷新账号列表失败', 'error')
    } finally {
      accountsLoading.value = false
    }
  }

  return {
    accountsLoading,
    localAccounts,
    setLocalAccountsFromProps,
    refreshAccounts
  }
}
