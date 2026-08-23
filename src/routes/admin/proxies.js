// 代理池管理路由 — 代理/分组 CRUD、健康检查、质量检测、看板
// 挂载于 /admin/proxy-pool

const express = require('express')

const router = express.Router()
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const proxyPoolService = require('../../services/proxyPool/proxyPoolService')
const proxyHealthService = require('../../services/proxyPool/proxyHealthService')
const { validateProxyUrl, maskProxyUrl } = require('../../services/proxyPool/proxyPoolCore')

// 脱敏代理 url（隐藏认证信息）用于响应展示
// name 也过一遍：历史数据或手填可能把含凭据的完整 url 落到 name，maskProxyUrl 对非 URL 字符串原样返回，普通名字不受影响
const sanitizeProxyForResponse = (proxyConfig) => ({
  ...proxyConfig,
  name: maskProxyUrl(proxyConfig.name),
  url: maskProxyUrl(proxyConfig.url)
})

// 删除代理/分组时，全平台扫描清理所有引用账户的 proxyGroupId/proxyId 字段，避免悬空绑定
const clearAccountBindings = async (kind, id) => {
  const cleared = await redis.clearProxyBindingFromAllAccounts(kind, id)
  if (cleared > 0) {
    logger.info(`🌐 [ProxyPool] cleared ${cleared} account binding(s) on ${kind}=${id} deletion`)
  }
}

// ========== 代理 CRUD ==========

// 列出全部代理（附运行时状态 + 质量 + 出口IP）
router.get('/proxies', authenticateAdmin, async (req, res) => {
  try {
    const configs = proxyPoolService.getAllProxyConfigs()
    const result = await Promise.all(
      configs.map(async (proxyConfig) => {
        const [quality, exitInfo] = await Promise.all([
          redis.getProxyQualityResult(proxyConfig.id),
          redis.getProxyExitInfo(proxyConfig.id)
        ])
        return {
          ...sanitizeProxyForResponse(proxyConfig),
          states: proxyPoolService.getProxyStatesSnapshot(proxyConfig.id),
          quality,
          exitInfo
        }
      })
    )
    res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to list proxies:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 创建代理
router.post('/proxies', authenticateAdmin, async (req, res) => {
  try {
    const { url, name, baseWeight, groupIds } = req.body || {}
    if (!validateProxyUrl(url)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid proxy url (expect http/https/socks4/socks5://[user:pass@]host:port)'
      })
    }
    const proxyConfig = await proxyPoolService.createProxy({
      url,
      name,
      baseWeight,
      groupIds
    })
    return res.json({ success: true, data: sanitizeProxyForResponse(proxyConfig) })
  } catch (error) {
    logger.error('❌ Failed to create proxy:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
})

// 更新代理
router.put('/proxies/:id', authenticateAdmin, async (req, res) => {
  try {
    const proxyConfig = await proxyPoolService.updateProxy(req.params.id, req.body || {})
    res.json({ success: true, data: sanitizeProxyForResponse(proxyConfig) })
  } catch (error) {
    logger.error('❌ Failed to update proxy:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 删除代理
router.delete('/proxies/:id', authenticateAdmin, async (req, res) => {
  try {
    await clearAccountBindings('proxy', req.params.id)
    await proxyPoolService.deleteProxy(req.params.id)
    res.json({ success: true })
  } catch (error) {
    logger.error('❌ Failed to delete proxy:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 立即对单个代理做健康检查
router.post('/proxies/:id/health-check', authenticateAdmin, async (req, res) => {
  try {
    const proxyConfig = proxyPoolService.getProxyConfig(req.params.id)
    if (!proxyConfig) {
      return res.status(404).json({ success: false, message: 'Proxy not found' })
    }
    const result = await proxyHealthService.checkProxy(proxyConfig)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to health-check proxy:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
})

// 立即对单个代理做质量检测（5 项 + 出口IP）
router.post('/proxies/:id/quality-check', authenticateAdmin, async (req, res) => {
  try {
    const result = await proxyHealthService.checkProxyQuality(req.params.id)
    res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to quality-check proxy:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 健康检查历史
router.get('/proxies/:id/health-history', authenticateAdmin, async (req, res) => {
  try {
    const history = await redis.getProxyHealthHistory(req.params.id, 50)
    res.json({ success: true, data: history })
  } catch (error) {
    logger.error('❌ Failed to get proxy health history:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// ========== 分组 CRUD ==========

router.get('/groups', authenticateAdmin, async (req, res) => {
  try {
    const groups = proxyPoolService.getGroupsList().map((group) => ({
      ...group,
      memberCount: proxyPoolService.getGroupMembers(group.id).length
    }))
    res.json({ success: true, data: groups })
  } catch (error) {
    logger.error('❌ Failed to list proxy groups:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

router.post('/groups', authenticateAdmin, async (req, res) => {
  try {
    const group = await proxyPoolService.createGroup(req.body || {})
    res.json({ success: true, data: group })
  } catch (error) {
    logger.error('❌ Failed to create proxy group:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

router.put('/groups/:id', authenticateAdmin, async (req, res) => {
  try {
    const group = await proxyPoolService.updateGroup(req.params.id, req.body || {})
    res.json({ success: true, data: group })
  } catch (error) {
    logger.error('❌ Failed to update proxy group:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

router.delete('/groups/:id', authenticateAdmin, async (req, res) => {
  try {
    await clearAccountBindings('group', req.params.id)
    await proxyPoolService.deleteGroup(req.params.id)
    res.json({ success: true })
  } catch (error) {
    logger.error('❌ Failed to delete proxy group:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// ========== 概览看板 ==========

router.get('/overview', authenticateAdmin, async (req, res) => {
  try {
    const configs = proxyPoolService.getAllProxyConfigs()
    // 健康/不健康口径只统计已启用代理，与列表页一致（禁用代理单独归类，不计入健康统计）
    const enabledConfigs = configs.filter((proxyConfig) => proxyConfig.status === 1)
    const healthy = enabledConfigs.filter((proxyConfig) => proxyConfig.isHealthy).length
    const enabled = enabledConfigs.length
    res.json({
      success: true,
      data: {
        total: configs.length,
        enabled,
        healthy,
        unhealthy: enabled - healthy,
        groups: proxyPoolService.getGroupsList().length,
        routeVersion: proxyPoolService.localVersion
      }
    })
  } catch (error) {
    logger.error('❌ Failed to get proxy overview:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// ========== 全局设置（健康检查 / 熔断 / 慢启动调优参数） ==========

// 读取当前生效设置（env 默认已合并 Redis 覆盖）
router.get('/settings', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: proxyPoolService.getSettings() })
  } catch (error) {
    logger.error('❌ Failed to get proxy pool settings:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 保存设置并实时应用（核心算法 + 健康检查定时器立即生效，无需重启）
router.put('/settings', authenticateAdmin, async (req, res) => {
  try {
    const effective = await proxyPoolService.applySettings(req.body || {})
    proxyHealthService.reconfigure()
    return res.json({ success: true, data: effective })
  } catch (error) {
    logger.error('❌ Failed to update proxy pool settings:', error)
    // 参数校验错误带 statusCode=400；Redis 写入等服务端故障无此标记，归 500，避免误导调用方/监控
    return res.status(error.statusCode || 500).json({ success: false, message: error.message })
  }
})

module.exports = router
