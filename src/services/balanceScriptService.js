const fs = require('fs')
const path = require('path')
const vm = require('vm')
const axios = require('axios')
const logger = require('../utils/logger')

/**
 * 可配置脚本余额查询服务
 * - 存储位置：data/balanceScripts.json
 * - 脚本格式：({ request: {...}, extractor: function(response){...} })
 * - 模板变量：{{baseUrl}}, {{apiKey}}, {{token}}, {{accountId}}, {{platform}}, {{extra}}
 */
class BalanceScriptService {
  constructor() {
    this.filePath = path.join(__dirname, '..', '..', 'data', 'balanceScripts.json')
    this.ensureStore()
  }

  ensureStore() {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2))
    }
  }

  loadAll() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8')
      return JSON.parse(raw || '{}')
    } catch (error) {
      logger.error('读取余额脚本配置失败', error)
      return {}
    }
  }

  saveAll(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2))
  }

  listConfigs() {
    const all = this.loadAll()
    return Object.values(all)
  }

  getConfig(name) {
    const all = this.loadAll()
    if (all[name]) {
      return all[name]
    }
    return {
      name,
      baseUrl: '',
      apiKey: '',
      token: '',
      timeoutSeconds: 10,
      autoIntervalMinutes: 0,
      scriptBody:
        "({\n  request: {\n    url: \"{{baseUrl}}/user/balance\",\n    method: \"GET\",\n    headers: {\n      \"Authorization\": \"Bearer {{apiKey}}\",\n      \"User-Agent\": \"cc-switch/1.0\"\n    }\n  },\n  extractor: function(response) {\n    return {\n      isValid: !response.error,\n      remaining: response.balance,\n      unit: \"USD\"\n    };\n  }\n})",
      updatedAt: null
    }
  }

  saveConfig(name, payload) {
    const all = this.loadAll()
    const config = {
      ...this.getConfig(name),
      ...payload,
      name,
      updatedAt: new Date().toISOString()
    }
    all[name] = config
    this.saveAll(all)
    return config
  }

  /**
   * 执行脚本：返回标准余额结构 + 原始响应
   * @param {object} options
   *  - scriptBody: string
   *  - variables: Record<string,string>
   *  - timeoutSeconds: number
   */
  async execute(options = {}) {
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
      const script = new vm.Script(wrapped, { timeout: timeoutMs })
      scriptResult = script.runInNewContext(sandbox, { timeout: timeoutMs })
    } catch (error) {
      throw new Error(`脚本解析失败: ${error.message}`)
    }

    if (!scriptResult || typeof scriptResult !== 'object') {
      throw new Error('脚本返回格式无效（需返回 { request, extractor }）')
    }

    const variables = options.variables || {}
    const request = this.applyTemplates(scriptResult.request || {}, variables)
    const extractor = scriptResult.extractor

    if (!request.url) {
      throw new Error('脚本 request.url 不能为空')
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

    let httpResponse = null
    try {
      httpResponse = await axios(axiosConfig)
    } catch (error) {
      const status = error.response?.status
      const data = error.response?.data
      throw new Error(`请求失败: ${status || ''} ${error.message}${data ? ` | ${JSON.stringify(data)}` : ''}`)
    }

    const responseData = httpResponse?.data
    let extracted = {}
    if (typeof extractor === 'function') {
      try {
        extracted = extractor(responseData) || {}
      } catch (error) {
        throw new Error(`extractor 执行失败: ${error.message}`)
      }
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

  async testScript(name, payload = {}) {
    const config = payload.useBodyConfig ? this.getConfig(name) : this.getConfig(name)
    const scriptBody = payload.scriptBody || config.scriptBody
    const timeoutSeconds = payload.timeoutSeconds || config.timeoutSeconds
    const variables = {
      baseUrl: payload.baseUrl || config.baseUrl,
      apiKey: payload.apiKey || config.apiKey,
      token: payload.token || config.token,
      accountId: payload.accountId || '',
      platform: payload.platform || '',
      extra: payload.extra || ''
    }

    const result = await this.execute({ scriptBody, variables, timeoutSeconds })
    return {
      name,
      variables,
      mapped: result.mapped,
      extracted: result.extracted,
      response: result.response
    }
  }
}

module.exports = new BalanceScriptService()
