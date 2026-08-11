const logger = require('./logger')
const ProxyHelper = require('./proxyHelper')
const proxyPoolService = require('../services/proxyPool/proxyPoolService')
const {
  normalizeContextKey,
  parseProxyUrl,
  ProxyErrorType
} = require('../services/proxyPool/proxyPoolCore')

// 业务流量传输层裁决：只有「连接级故障」才算代理坏，任何拿到 HTTP 响应（含 429/403/5xx）都算代理传输成功。
// 这是被动健康检查接线的核心安全约束——上游的正常限流(429)/业务拒绝(403)不是代理故障，
// 误判会把好线路熔断、流量挤到更少节点引发雪崩（区别于健康探测的 isProxyTransportOk，那里 403/429=封禁）。
// 入参 error：请求抛出的异常对象（无异常传 null/undefined 表示成功）。
// 返回 { transportOk, errorType }：transportOk=false 时附带连接级错误分类，供熔断/权重统计。
function classifyBusinessTraffic(error) {
  if (!error) {
    return { transportOk: true, errorType: undefined }
  }
  // 拿到了 HTTP 响应（哪怕 4xx/5xx）→ 代理是通的，上游在拒绝，绝不归咎于代理
  if (error.response || typeof error.statusCode === 'number') {
    return { transportOk: true, errorType: undefined }
  }
  const msg = (error.code || error.message || '').toString().toLowerCase()
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('aborted')) {
    return { transportOk: false, errorType: ProxyErrorType.TIMEOUT }
  }
  if (msg.includes('econnrefused') || msg.includes('econnreset')) {
    return { transportOk: false, errorType: ProxyErrorType.CONN_REFUSED }
  }
  if (msg.includes('enotfound') || msg.includes('eai_again') || msg.includes('dns')) {
    return { transportOk: false, errorType: ProxyErrorType.DNS }
  }
  if (msg.includes('tls') || msg.includes('certificate') || msg.includes('ssl')) {
    return { transportOk: false, errorType: ProxyErrorType.TLS }
  }
  // 无 HTTP 响应又非已知连接错误：保守按传输失败（多半是网络中断/连接被中途掐断）
  return { transportOk: false, errorType: ProxyErrorType.OTHER }
}

// 代理解析器 — relay 与代理池之间的集成 seam
// 上层（relay）只调 resolveAgent 拿代理、调 report 反馈结果，不关心池子内部
// 账户绑定 proxyGroupId 时走代理池（加权随机选择），否则回退账户静态 proxy（旧逻辑，行为不变）
class ProxyResolver {
  // 账户对应的 contextKey（平台维度，池子按 proxyId:contextKey 隔离指标）
  getAccountContextKey(account, fallbackPlatform) {
    const platform = fallbackPlatform || account?.platform || account?.accountType || 'default'
    return normalizeContextKey(platform)
  }

  // 账户是否已绑定代理池（分组或固定代理）
  isPoolBound(account) {
    return !!(account && (account.proxyGroupId || account.proxyId))
  }

  // 解析出可用的代理 Agent
  // 返回 { agent, proxyId, contextKey }；proxyId 非空表示来自代理池（可用于 report 反馈）
  // 关键语义：账户一旦绑定代理池，池子即权威——池子不可用时本次不使用代理，
  // 绝不回退到账户的旧静态 proxy（避免"表面切到池子、故障时偷偷走旧自定义代理"）
  resolveAgent(account, contextKey) {
    const resolvedContextKey = this.getAccountContextKey(account, contextKey)

    if (this.isPoolBound(account) && proxyPoolService.enabled) {
      if (account.proxyGroupId) {
        const selected = proxyPoolService.sampleProxy(account.proxyGroupId, resolvedContextKey)
        if (selected && selected.url) {
          return {
            agent: ProxyHelper.createProxyAgentFromUrl(selected.url),
            proxyId: selected.id,
            contextKey: resolvedContextKey
          }
        }
        logger.warn(
          `🌐 [ProxyResolver] group=${account.proxyGroupId} 无可用代理 ctx=${resolvedContextKey}，本次不使用代理（不回退静态）`
        )
        return { agent: null, proxyId: null, contextKey: resolvedContextKey }
      }
      // 固定单个池内代理：显式指定，始终用其 URL（即使不健康），不存在则本次不使用代理
      const pinned = proxyPoolService.getProxy(account.proxyId, resolvedContextKey)
      if (pinned && pinned.url) {
        return {
          agent: ProxyHelper.createProxyAgentFromUrl(pinned.url),
          proxyId: pinned.id,
          contextKey: resolvedContextKey
        }
      }
      logger.warn(
        `🌐 [ProxyResolver] pinned proxy=${account.proxyId} 不存在，本次不使用代理（不回退静态）`
      )
      return { agent: null, proxyId: null, contextKey: resolvedContextKey }
    }

    // 未绑定代理池：账户静态 proxy（旧逻辑）；无则无代理
    const agent = account && account.proxy ? ProxyHelper.createProxyAgent(account.proxy) : null
    return { agent, proxyId: null, contextKey: resolvedContextKey }
  }

  // 解析出可用代理的「配置对象」({type,host,port,username,password})，供需要 proxy config
  // 而非 agent 的旧代码（如 gemini parseProxyConfig）使用。三态语义：
  //   返回配置对象 -> 用它；返回 null -> 已绑定池子但无可用，本次不使用代理（不回退静态）；
  //   返回 undefined -> 未绑定池子，调用方回退账户静态 proxy
  resolveProxyConfigForAccount(account, contextKey) {
    if (!this.isPoolBound(account) || !proxyPoolService.enabled) {
      return undefined
    }
    const resolvedContextKey = this.getAccountContextKey(account, contextKey)
    if (account.proxyGroupId) {
      const selected = proxyPoolService.sampleProxy(account.proxyGroupId, resolvedContextKey)
      return selected && selected.url ? parseProxyUrl(selected.url) : null
    }
    const pinned = proxyPoolService.getProxy(account.proxyId, resolvedContextKey)
    return pinned && pinned.url ? parseProxyUrl(pinned.url) : null
  }

  // 授权前置流程（OAuth/SetupToken/Cookie/设备码，账户落库前）用：绑池则解析池代理，未绑池回退静态 proxy
  // 绑池有可用 -> 池代理配置；绑池但无可用 -> 抛错（fail closed，禁止授权直连暴露真实出口）；
  // 未绑池/池未启用 -> 静态 proxy（外部传入）
  resolveAuthProxy(account, contextKey, staticProxy) {
    const resolved = this.resolveProxyConfigForAccount(account, contextKey)
    if (resolved === null) {
      throw new Error('账户绑定的代理池当前无可用代理，已阻止授权请求直连（避免暴露真实出口）')
    }
    return resolved === undefined ? staticProxy || null : resolved
  }

  // 反馈业务请求结果给代理池（仅 proxyId 来自池子时生效，fire-and-forget）。
  // [接线说明，承接 人工决策-2026-06-05 11:42:11] 此前为死代码，relay 只取 .agent 丢弃 proxyId，
  //   代理池熔断/动态权重/慢启动对真实流量空转、只靠 ~90s 健康定时器隔离坏代理。现已接线：各 relay 消费点
  //   把 proxyId/contextKey 保留到「请求结果已知」作用域后调本方法，按真实成败实时驱动熔断与权重。
  //   当年记录的两个陷阱已落实为安全设计：
  //     ① proxyId 的保留由各消费点在请求 try/catch 内显式传入；
  //     ② 业务流量裁决走 classifyBusinessTraffic（只认连接级错误为代理故障，任何 HTTP 响应含 403/429/5xx
  //        都按传输成功），并以 successIsTransport=true 调 recordResult，绕开探测语义里 403/429=封禁的判定，
  //        避免上游正常限流被误伤成代理熔断。故本方法【不接收也不向 recordResult 传 statusCode】。
  // 入参 error：请求异常对象（成功时传 null/undefined）。latencyMs：本次请求耗时（可选）。
  report(proxyId, contextKey, error, latencyMs) {
    if (!proxyId) {
      return
    }
    try {
      const { transportOk, errorType } = classifyBusinessTraffic(error)
      proxyPoolService.recordResult(
        proxyId,
        contextKey,
        transportOk, // success（按字面值，下面 successIsTransport=true）
        latencyMs,
        undefined, // statusCode：刻意不传，避免 403/429 被当封禁误熔断
        errorType,
        true // successIsTransport：success 即传输成败，绕开探测语义
      )
    } catch (err) {
      logger.error('❌ [ProxyResolver] report failed:', err)
    }
  }
}

module.exports = new ProxyResolver()
