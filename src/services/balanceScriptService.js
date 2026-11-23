const vm = require('vm')
const net = require('net')
const axios = require('axios')
const { isBalanceScriptEnabled } = require('../utils/featureFlags')

// 禁止访问的地址段（按数值判断，而不是按字符串前缀）
const blockedAddresses = new net.BlockList()
blockedAddresses.addSubnet('0.0.0.0', 8, 'ipv4') // 0.0.0.0/8
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4')
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4')
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4') // link-local / cloud metadata
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4')
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4')
blockedAddresses.addAddress('::', 'ipv6')
blockedAddresses.addAddress('::1', 'ipv6')
blockedAddresses.addSubnet('fc00::', 7, 'ipv6') // unique local
blockedAddresses.addSubnet('fe80::', 10, 'ipv6') // link-local

/**
 * SSRF防护：检查URL是否访问内网或敏感地址
 * @param {string} url - 要检查的URL
 * @returns {boolean} - true表示URL安全
 */
function isUrlSafe(url) {
  try {
    const parsed = new URL(url)

    // 禁止的协议
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false
    }

    // URL 里 IPv6 字面量带方括号（http://[::1]/），去掉后再判断
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')

    // 禁止访问 localhost 和内部域名
    if (
      hostname === 'localhost' ||
      /\.local$/.test(hostname) ||
      /\.internal$/.test(hostname) ||
      /\.localhost$/.test(hostname)
    ) {
      return false
    }

    if (net.isIPv4(hostname)) {
      return !blockedAddresses.check(hostname, 'ipv4')
    }

    if (net.isIPv6(hostname)) {
      // ::ffff:a.b.c.d 是披着 IPv6 外壳的 IPv4，按其内嵌的 IPv4 判断
      const mapped = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
      if (mapped) {
        const hi = parseInt(mapped[1], 16)
        const lo = parseInt(mapped[2], 16)
        const ipv4 = [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.')
        return !blockedAddresses.check(ipv4, 'ipv4')
      }
      return !blockedAddresses.check(hostname, 'ipv6')
    }

    return true
  } catch {
    return false
  }
}

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

    // SSRF防护：验证URL安全性
    if (!isUrlSafe(request.url)) {
      throw new Error('脚本 request.url 不安全：禁止访问内网地址、localhost或使用非HTTP(S)协议')
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
