const express = require('express')
const axios = require('axios')
const { authenticateAdmin } = require('../../middleware/auth')
const proxyPolicyService = require('../../services/proxyPolicyService')
const logger = require('../../utils/logger')
const ProxyHelper = require('../../utils/proxyHelper')

const router = express.Router()

// ==================== 代理策略配置 ====================

router.get('/proxy-policy', authenticateAdmin, async (req, res) => {
  try {
    const config = await proxyPolicyService.getConfig()
    return res.json({ success: true, data: config })
  } catch (error) {
    logger.error('❌ Failed to get proxy policy config:', error)
    return res.status(500).json({ error: 'Failed to get proxy policy config', message: error.message })
  }
})

router.put('/proxy-policy', authenticateAdmin, async (req, res) => {
  try {
    const updates = req.body || {}
    const updated = await proxyPolicyService.updateConfig(updates, req.admin?.username || 'unknown')
    return res.json({ success: true, data: updated })
  } catch (error) {
    logger.error('❌ Failed to update proxy policy config:', error)
    return res.status(400).json({ error: error.message })
  }
})

router.post('/proxy-policy/test', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body || {}

    let proxyConfig = null
    if (proxy !== null && proxy !== undefined && proxy !== '') {
      if (!ProxyHelper.validateProxyConfig(proxy)) {
        return res.status(400).json({ error: '代理配置无效（需要包含 type/host/port 且 type 必须为 socks5/http/https）' })
      }
      proxyConfig = typeof proxy === 'string' ? JSON.parse(proxy) : proxy
    }

    const proxyAgent = proxyConfig ? ProxyHelper.createProxyAgent(proxyConfig) : null
    const startedAt = Date.now()

    const response = await axios.get('https://api.ipify.org?format=json', {
      timeout: 15000,
      responseType: 'json',
      proxy: false,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'claude-relay-service/proxy-test'
      },
      ...(proxyAgent && {
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent
      })
    })

    const ip = response?.data?.ip
    if (!ip || typeof ip !== 'string') {
      throw new Error('出口 IP 解析失败')
    }

    return res.json({
      success: true,
      data: {
        ip,
        elapsedMs: Date.now() - startedAt,
        usingProxyAgent: !!proxyAgent,
        proxyInfo: ProxyHelper.maskProxyInfo(proxyConfig),
        provider: 'api.ipify.org'
      }
    })
  } catch (error) {
    logger.error('❌ Failed to test proxy exit IP:', error)
    return res.status(500).json({ error: '测试出口 IP 失败', message: error.message })
  }
})

module.exports = router
