const vm = require('vm')
const axios = require('axios')
const { isBalanceScriptEnabled } = require('../utils/featureFlags')

/**
 * 可配置脚本余额查询执行器
 * - 脚本格式：({ request: {...}, extractor: function(response){...} })
 * - 模板变量：{{baseUrl}}, {{apiKey}}, {{token}}, {{accountId}}, {{platform}}, {{extra}}
 */
class BalanceScriptService {
  /**
   * 执行脚本：返回标准余额结构 + 原始响应
   * @param {object} options
   *  - scriptBody: string
   *  - variables: Record<string,string>
   *  - timeoutSeconds: number
   */
  async execute(options = {}) {
    if (!isBalanceScriptEnabled()) {
      const error = new Error('余额脚本功能已禁用（可通过 BALANCE_SCRIPT_ENABLED=true 启用）')
      error.code = 'BALANCE_SCRIPT_DISABLED'
      throw error
    }

    const scriptBody = options.scriptBody?.trim()
    if (!scriptBody) {
      throw new Error('脚本内容为空')
    }

    const timeoutMs = Math.max(1, (options.timeoutSeconds || 10) * 1000)
    const sandbox = {
      console,
      Math,
      Date
    }

    let scriptResult
    try {
      const wrapped = scriptBody.startsWith('(') ? scriptBody : `(${scriptBody})`
      const script = new vm.Script(wrapped)
      scriptResult = script.runInNewContext(sandbox, { timeout: timeoutMs })
    } catch (error) {
      throw new Error(`脚本解析失败: ${error.message}`)
    }

    if (!scriptResult || typeof scriptResult !== 'object') {
      throw new Error('脚本返回格式无效（需返回 { request, extractor }）')
    }

    const variables = options.variables || {}
    const request = this.applyTemplates(scriptResult.request || {}, variables)
    const { extractor } = scriptResult

    if (!request?.url || typeof request.url !== 'string') {
      throw new Error('脚本 request.url 不能为空')
    }

    if (typeof extractor !== 'function') {
      throw new Error('脚本 extractor 必须是函数')
    }

    const axiosConfig = {
      url: request.url,
      method: (request.method || 'GET').toUpperCase(),
      headers: request.headers || {},
      timeout: timeoutMs
    }

    if (request.params) {
      axiosConfig.params = request.params
    }
    if (request.body || request.data) {
      axiosConfig.data = request.body || request.data
    }

    let httpResponse
    try {
      httpResponse = await axios(axiosConfig)
    } catch (error) {
      const { response } = error || {}
      const { status, data } = response || {}
      throw new Error(
        `请求失败: ${status || ''} ${error.message}${data ? ` | ${JSON.stringify(data)}` : ''}`
      )
    }

    const responseData = httpResponse?.data

    let extracted = {}
    try {
      extracted = extractor(responseData) || {}
    } catch (error) {
      throw new Error(`extractor 执行失败: ${error.message}`)
    }

    const mapped = this.mapExtractorResult(extracted, responseData)
    return {
      mapped,
      extracted,
      response: {
        status: httpResponse?.status,
        headers: httpResponse?.headers,
        data: responseData
      }
    }
  }

  applyTemplates(value, variables) {
    if (typeof value === 'string') {
      return value.replace(/{{(\w+)}}/g, (_, key) => {
        const trimmed = key.trim()
        return variables[trimmed] !== undefined ? String(variables[trimmed]) : ''
      })
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.applyTemplates(item, variables))
    }
    if (value && typeof value === 'object') {
      const result = {}
      Object.keys(value).forEach((k) => {
        result[k] = this.applyTemplates(value[k], variables)
      })
      return result
    }
    return value
  }

  mapExtractorResult(result = {}, responseData) {
    const isValid = result.isValid !== false
    const remaining = Number(result.remaining)
    const total = Number(result.total)
    const used = Number(result.used)
    const currency = result.unit || 'USD'

    const quota =
      Number.isFinite(total) || Number.isFinite(used)
        ? {
            total: Number.isFinite(total) ? total : null,
            used: Number.isFinite(used) ? used : null,
            remaining: Number.isFinite(remaining) ? remaining : null,
            percentage:
              Number.isFinite(total) && total > 0 && Number.isFinite(used)
                ? (used / total) * 100
                : null
          }
        : null

    return {
      status: isValid ? 'success' : 'error',
      errorMessage: isValid ? '' : result.invalidMessage || '套餐无效',
      balance: Number.isFinite(remaining) ? remaining : null,
      currency,
      quota,
      planName: result.planName || null,
      extra: result.extra || null,
      rawData: responseData || result.raw
    }
  }
}

module.exports = new BalanceScriptService()
