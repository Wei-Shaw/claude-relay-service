const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const dns = require('dns')
const crypto = require('crypto')
const pricingSource = require('../../config/pricingSource')
const logger = require('../utils/logger')
const redis = require('../models/redis')
const { RedisKeys } = require('../constants/redisKeys')
const { createEncryptor } = require('../utils/commonHelper')

// 定价源 URL 的 query 可能带私有 token（私有仓库 raw 链接、带签名的 CDN 地址），
// 按项目约定敏感值必须 AES 加密存储：落 Redis 时只加密 query，origin+path 保持明文以便运维排查。
const encryptor = createEncryptor('pricing-source-salt')

// 远端响应体上限:定价源可由管理端改成任意地址,无上限时超大/无限响应会累积到内存后才解析,
// 直接把进程打满。上游 litellm 全量定价约 1.5MB,16MB 留足余量。
const MAX_PRICING_BYTES = 16 * 1024 * 1024
// 哈希文件只有一行 sha256,给 1KB 足够
const MAX_HASH_BYTES = 1024
// 重定向跟随上限:GitHub/CDN 通常 1-2 跳,5 跳足够且能挡住跳转环
const MAX_REDIRECTS = 5

// 落库用:origin 明文(便于运维核对"数据从哪个站来"),pathname + query 一起加密。
//
// 为什么连 pathname 也加密:凭据不只出现在 query。签名式地址会把 token 放进路径,
// 例如 /token/SECRET/prices.json、/s/AbCdEf123/pricing.json —— 只加密 query 的话
// 这类凭据仍会明文进 Redis、进日志、并由状态接口回显。既然无法穷举凭据的位置,
// 就把除 origin 以外的整段都当敏感数据处理。
const splitUrlForStorage = (url) => {
  const parsed = new URL(url)
  // pathname 恒以 '/' 开头,解密后据此判断是否解出了有效内容(见 joinUrlFromStorage)
  const secret = `${parsed.pathname}${parsed.search}`
  return {
    base: parsed.origin,
    pathEncrypted: encryptor.encrypt(secret)
  }
}

// 读库用:还原完整 URL。解密失败返回空串(视为"没有配置自定义源")并告警——
// 换过 ENCRYPTION_KEY 的实例解不出旧值,此时路径都拿不到、拼不出可用地址,
// 只能回落默认源(由 resolveSource 处理),但绝不能抛错中断定价服务。
//
// 关键:commonHelper 的 decrypt() 解密失败【不抛错,而是原样返回入参密文】(见其 catch),
// 所以不能靠 try/catch 判失败,必须按返回值形态判断:成功解出的内容必以 '/' 开头(pathname),
// 而密文是 "ivHex:cipherHex"。少了这一判,会把 iv:ciphertext 当路径拼进 URL。
const joinUrlFromStorage = (base, pathEncrypted, label) => {
  if (!base || !pathEncrypted) {
    return ''
  }
  const decrypted = encryptor.decrypt(pathEncrypted)
  if (!decrypted.startsWith('/')) {
    logger.warn(`⚠️  ${label} 解密失败(可能换过 ENCRYPTION_KEY)，将回落默认源`)
    return ''
  }
  return `${base}${decrypted}`
}

// 判定一个 IP 字面量是否属于禁止访问的网段。纯函数,字面量校验与 DNS 解析后校验共用,
// 保证"填 IP"和"填域名解析出 IP"两条路的口径完全一致(不一致就等于留后门)。
// 返回被命中的原因字符串,未命中返回 null。
const privateIpReason = (ip) => {
  const addr = String(ip || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')

  const ipv4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b, c] = ipv4.slice(1).map(Number)
    if (a === 127) {
      return '回环地址'
    }
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return '私有网段'
    }
    if (a === 169 && b === 254) {
      return '链路本地/云元数据地址'
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return 'CGNAT 网段'
    }
    // 非公网可路由的 IANA 特殊用途段(RFC 6890)。定价源不可能合法落在这些段里,
    // 而 DNS 劫持/内网解析常把域名指到这里(本机 WSL 的 DNS 就把 example.com 指到 198.18.2.42)
    if (a === 192 && b === 0 && (c === 0 || c === 2)) {
      return 'IETF 协议保留段'
    }
    if (a === 192 && b === 88 && c === 99) {
      return '6to4 中继任播段'
    }
    if (a === 198 && (b === 18 || b === 19)) {
      return '网络设备基准测试段'
    }
    if (a === 198 && b === 51 && c === 100) {
      return '文档示例段'
    }
    if (a === 203 && b === 0 && c === 113) {
      return '文档示例段'
    }
    if (a === 0 || a >= 224) {
      return '保留网段'
    }
    return null
  }

  if (addr.includes(':')) {
    if (addr === '::' || addr === '::1') {
      return '回环/未指定地址'
    }
    // new URL() 会把 ::ffff:127.0.0.1 规范化为 ::ffff:7f00:1,故按 "::" 前缀整段拒绝;
    // dns.lookup 返回的 IPv4-mapped 仍是点分形态,上面的 ipv4 分支已覆盖
    if (addr.startsWith('::')) {
      return 'IPv4-mapped/compatible 地址'
    }
    if (/^(fc|fd)/.test(addr)) {
      return '唯一本地地址'
    }
    if (/^fe[89ab]/.test(addr)) {
      return '链路本地地址'
    }
    return null
  }

  return null
}

// 定价源地址进日志/回显前只保留 origin,丢掉 pathname、query 与 userinfo。
// 与 splitUrlForStorage 同口径:凭据可能在 query(?token=)也可能在路径(/token/SECRET/…),
// 无法穷举,所以除 origin 以外一律隐去。比 upstreamErrorHelper.sanitizeUrl(按已知参数名脱敏)更硬。
// 管理端要核对"数据从哪个站来"看 origin 足够;要看完整地址应查自己填写时的记录。
const maskUrl = (url) => {
  if (!url) {
    return url
  }
  try {
    const parsed = new URL(url)
    // 有路径或参数时标注省略号,让管理端知道"这里还有内容,只是没显示"
    const suffix = parsed.pathname !== '/' || parsed.search ? '/…' : ''
    return `${parsed.origin}${suffix}`
  } catch {
    return '[invalid-url]'
  }
}

class PricingService {
  constructor() {
    this.dataDir = path.join(process.cwd(), 'data')
    this.pricingFile = path.join(this.dataDir, 'model_pricing.json')
    // 生效源由 resolveSource() 运行时解析:Redis(管理端可改) > config/pricingSource.js(env > 默认)
    // 这两个字段只是"当前生效值"的缓存快照,供 getStatus 回显;下载/校验一律先 resolveSource()
    this.pricingUrl = pricingSource.pricingUrl
    this.hashUrl = pricingSource.hashUrl
    this.sourceFromRedis = false
    this.fallbackFile = path.join(
      process.cwd(),
      'resources',
      'model-pricing',
      'model_prices_and_context_window.json'
    )
    this.localHashFile = path.join(this.dataDir, 'model_pricing.sha256')
    this.pricingData = null
    this.lastUpdated = null
    this.updateInterval = 24 * 60 * 60 * 1000 // 24小时
    this.hashCheckInterval = 10 * 60 * 1000 // 10分钟哈希校验
    this.fileWatcher = null // 文件监听器
    this.reloadDebounceTimer = null // 防抖定时器
    this.hashCheckTimer = null // 哈希轮询定时器
    this.updateTimer = null // 定时更新任务句柄
    this.hashSyncInProgress = false // 哈希同步状态

    // Claude Prompt Caching 官方倍率（基于输入价格）— 仅作为 model_pricing.json 缺失字段时的兜底
    this.claudeCacheMultipliers = {
      write5m: 1.25,
      write1h: 2,
      read: 0.1
    }

    // Claude 扩展计费特性
    this.claudeFeatureFlags = {
      context1mBeta: 'context-1m-2025-08-07',
      fastModeBeta: 'fast-mode-2026-02-01',
      fastModeSpeed: 'fast'
    }
  }

  // 按 URL 协议选 http/https 模块。校验层放行 http:// 就必须能真的发出 http 请求
  _clientFor(url) {
    return url.startsWith('http://') ? http : https
  }

  // 第二道防线:DNS 解析后校验。传给 http.get 的 lookup 选项,把连接前的解析结果拦下来,
  // 解析出的任一 IP 命中禁止网段就直接失败。
  //
  // 这是闭合"内部域名 / 解析到私网的公网域名 / DNS rebinding"的关键——字面量黑名单做不到,
  // 因为要判的是解析结果而不是字面串。all:true 拿到全部记录逐个判(只判第一个会被多 A 记录绕过),
  // 校验通过后【只把已校验的地址交给连接】,不让底层再解析一次,消除"校验用一个结果、连接用另一个"
  // 的 TOCTOU 窗口(DNS rebinding 正是打这个窗口)。
  _guardedLookup(label) {
    return (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) {
          callback(error)
          return
        }
        const list = Array.isArray(addresses) ? addresses : [addresses]
        for (const entry of list) {
          const ip = entry?.address || entry
          const reason = privateIpReason(ip)
          if (reason) {
            logger.warn(`⚠️  ${label} 的域名 ${hostname} 解析到${reason}(${ip})，已阻止请求`)
            callback(new Error(`${label}的域名解析到${reason}，已阻止访问内网`))
            return
          }
        }
        // 回传已校验过的地址,不让底层重新解析(否则校验结果与实际连接目标可能不同)
        if (options?.all) {
          callback(null, list)
          return
        }
        const first = list[0]
        callback(null, first?.address || first, first?.family)
      })
    }
  }

  // 校验管理端提交的定价源地址(第一道:字面量)。定价源会被服务端主动请求(定时轮询 + 手动拉取),
  // 所以必须挡住"让服务端代为访问内网"和"把凭据存进 Redis/日志"两类问题。
  //
  // 两道防线共用 privateIpReason 判定,口径一致:
  //   本函数     = 字面量校验(填的是 IP 就直接判;域名只查黑名单)
  //   _guardedLookup = DNS 解析后校验(域名解析出的每个 IP 都判,挡内部域名/解析到私网/rebinding)
  // 错误消息不回显原始 URL:畸形 URL 的 query 可能带 token,而错误会进日志(见 maskUrl 的理由)。
  _assertSafeSourceUrl(rawUrl, label) {
    let parsed
    try {
      parsed = new URL(rawUrl)
    } catch {
      // 只说"不是合法 URL",不带 rawUrl——非法 URL 无法用 URL 解析来剥 query,
      // 拼进消息就会把 ?token=xxx 原样带进 logger/console.error
      throw new Error(`${label}不是合法 URL（已隐去内容，请检查是否漏写协议或含非法字符）`)
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`${label}必须以 http:// 或 https:// 开头`)
    }

    // 凭据不能出现在定价源地址里:该地址会存 Redis、写日志、并由状态接口回显给管理端,
    // 与项目"敏感凭据加密存储 + 日志脱敏"的约束冲突。需要鉴权的源请走网关或反代注入。
    if (parsed.username || parsed.password) {
      throw new Error(`${label}不能包含用户名/密码，请改用无凭据的公开地址`)
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')

    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '0.0.0.0') {
      throw new Error(`${label}不允许指向本机地址：${hostname}`)
    }

    // 容器/编排环境里指向宿主或集群内部的常见域名。快速失败用,
    // 真正兜底的是 _guardedLookup(解析后按 IP 判),故这里不必穷举
    const internalHosts = [
      'host.docker.internal',
      'gateway.docker.internal',
      'kubernetes.default',
      'metadata.google.internal',
      'instance-data'
    ]
    if (internalHosts.includes(hostname) || hostname.endsWith('.svc.cluster.local')) {
      throw new Error(`${label}不允许指向容器/集群内部地址：${hostname}`)
    }

    const reason = privateIpReason(hostname)
    if (reason) {
      throw new Error(`${label}不允许指向${reason}：${hostname}`)
    }

    return parsed.toString()
  }

  // 解析当前生效的定价源:Redis(管理端可改) > config/pricingSource.js(env > 默认)
  // Redis 不可用/无记录一律回落默认值,不抛错——定价源是配置读取,拿不到就用默认继续跑
  async resolveSource() {
    let stored = null
    try {
      // getClient() 未连接时返回 null(不抛),显式判空:定价源解析发生在启动早期,不该因此中断
      const client = redis.getClient()
      const raw = client ? await client.get(RedisKeys.pricingSource) : null
      if (raw) {
        stored = JSON.parse(raw)
      }
    } catch (error) {
      logger.warn(`⚠️  读取定价源配置失败,回落默认源：${error.message}`)
      console.error(error)
    }

    // 落库时 pathname+query 是加密的,这里拼回完整地址供实际请求使用。
    // 解密失败(换过 ENCRYPTION_KEY)时 joinUrlFromStorage 返回空串 —— 此时按"无自定义源"处理、
    // 回落默认源,而不是拿一个拼不全的地址去请求。
    const storedPricingUrl = stored?.pricingOrigin
      ? joinUrlFromStorage(stored.pricingOrigin, stored.pricingPathEncrypted, '定价 JSON 地址')
      : ''
    const overridden = Boolean(storedPricingUrl)

    // 自定义源生效时 hashUrl 原样生效(含空串=该源不提供 sha256,不回落默认源的哈希地址,
    // 否则会拿默认源的哈希与自定义源的文件比对、每轮都判定"有更新"从而反复下载)
    const pricingUrl = overridden ? storedPricingUrl : pricingSource.pricingUrl
    const hashUrl = overridden
      ? joinUrlFromStorage(stored.hashOrigin || '', stored.hashPathEncrypted, 'sha256 校验地址')
      : pricingSource.hashUrl
    this.sourceFromRedis = overridden
    this.pricingUrl = pricingUrl
    this.hashUrl = hashUrl
    return { pricingUrl, hashUrl }
  }

  // 管理端保存定价源。pricingUrl 为空视为「恢复默认」(删除 Redis 记录)
  // hashUrl 可空:留空表示该源不提供 sha256 校验文件,此时跳过哈希轮询、仅靠 24h 定时与手动刷新
  async setSource({ pricingUrl, hashUrl }) {
    const client = redis.getClientSafe()
    const trimmedPricingUrl = (pricingUrl || '').trim()
    const trimmedHashUrl = (hashUrl || '').trim()

    if (!trimmedPricingUrl) {
      await client.del(RedisKeys.pricingSource)
      logger.info('💰 定价源已恢复默认(删除 Redis 覆盖记录)')
    } else {
      // 校验通过后用 URL 归一化后的字符串落库(剥掉多余空白、统一编码)
      const safePricingUrl = this._assertSafeSourceUrl(trimmedPricingUrl, '定价 JSON 地址')
      const safeHashUrl = trimmedHashUrl
        ? this._assertSafeSourceUrl(trimmedHashUrl, 'sha256 校验地址')
        : ''

      // 落库:只有 origin 明文,pathname+query 加密(凭据可能在两者任一处,见 splitUrlForStorage)
      const pricingParts = splitUrlForStorage(safePricingUrl)
      const hashParts = safeHashUrl ? splitUrlForStorage(safeHashUrl) : { base: '', pathEncrypted: '' }

      await client.set(
        RedisKeys.pricingSource,
        JSON.stringify({
          pricingOrigin: pricingParts.base,
          pricingPathEncrypted: pricingParts.pathEncrypted,
          hashOrigin: hashParts.base,
          hashPathEncrypted: hashParts.pathEncrypted
        })
      )
      // 日志只记 origin+path,不记 query(校验已挡掉 userinfo,query 里仍可能带 token 形态的参数)
      logger.info(
        `💰 定价源已更新 pricingUrl=${maskUrl(safePricingUrl)} hashUrl=${maskUrl(safeHashUrl) || '-'}`
      )
    }

    await this.resolveSource()
    // 与 getStatus 同口径:返回脱敏值,调用方(管理端)只用于展示
    return { pricingUrl: maskUrl(this.pricingUrl), hashUrl: maskUrl(this.hashUrl) }
  }

  // 初始化价格服务
  async initialize() {
    try {
      // 确保data目录存在
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true })
        logger.info('📁 Created data directory')
      }

      // 先解析生效源(Redis 覆盖 > 默认),后续下载/校验都用它
      await this.resolveSource()

      // 检查是否需要下载或更新价格数据
      await this.checkAndUpdatePricing()

      // 初次启动时执行一次哈希校验，确保与远端保持一致
      await this.syncWithRemoteHash()

      // 设置定时更新
      if (this.updateTimer) {
        clearInterval(this.updateTimer)
      }
      this.updateTimer = setInterval(() => {
        this.checkAndUpdatePricing()
      }, this.updateInterval)

      // 设置哈希轮询
      this.setupHashCheck()

      // 设置文件监听器
      this.setupFileWatcher()

      logger.success('Pricing service initialized successfully')
    } catch (error) {
      logger.error('❌ Failed to initialize pricing service:', error)
    }
  }

  // 检查并更新价格数据
  async checkAndUpdatePricing() {
    try {
      const needsUpdate = this.needsUpdate()

      if (needsUpdate) {
        logger.info('🔄 Updating model pricing data...')
        await this.downloadPricingData()
      } else {
        // 如果不需要更新，加载现有数据
        await this.loadPricingData()
      }
    } catch (error) {
      logger.error('❌ Failed to check/update pricing:', error)
      // 如果更新失败，尝试使用fallback
      await this.useFallbackPricing()
    }
  }

  // 检查是否需要更新
  needsUpdate() {
    if (!fs.existsSync(this.pricingFile)) {
      logger.info('📋 Pricing file not found, will download')
      return true
    }

    const stats = fs.statSync(this.pricingFile)
    const fileAge = Date.now() - stats.mtime.getTime()

    if (fileAge > this.updateInterval) {
      logger.info(
        `📋 Pricing file is ${Math.round(fileAge / (60 * 60 * 1000))} hours old, will update`
      )
      return true
    }

    return false
  }

  // 下载价格数据
  async downloadPricingData() {
    try {
      await this._downloadFromRemote()
    } catch (downloadError) {
      logger.warn(`⚠️  Failed to download pricing data: ${downloadError.message}`)
      logger.info('📋 Using local fallback pricing data...')
      await this.useFallbackPricing()
    }
  }

  // 哈希轮询设置
  setupHashCheck() {
    if (this.hashCheckTimer) {
      clearInterval(this.hashCheckTimer)
    }

    this.hashCheckTimer = setInterval(() => {
      this.syncWithRemoteHash()
    }, this.hashCheckInterval)

    logger.info('🕒 已启用价格文件哈希轮询（每10分钟校验一次）')
  }

  // 与远端哈希对比
  async syncWithRemoteHash() {
    if (this.hashSyncInProgress) {
      return
    }

    this.hashSyncInProgress = true
    try {
      // 每轮重新解析:管理端改源后无需重启即生效
      const { hashUrl } = await this.resolveSource()
      if (!hashUrl) {
        logger.debug('💰 当前定价源未配置哈希文件地址,跳过哈希校验')
        return
      }

      const remoteHash = await this.fetchRemoteHash(hashUrl)

      if (!remoteHash) {
        return
      }

      const localHash = this.computeLocalHash()

      if (!localHash) {
        logger.info('📄 本地价格文件缺失，尝试下载最新版本')
        await this.downloadPricingData()
        return
      }

      if (remoteHash !== localHash) {
        logger.info('🔁 检测到远端价格文件更新，开始下载最新数据')
        await this.downloadPricingData()
      }
    } catch (error) {
      logger.warn(`⚠️  哈希校验失败：${error.message}`)
    } finally {
      this.hashSyncInProgress = false
    }
  }

  // 解析 3xx 的跳转目标。GitHub 文件链接、CDN 都会 302,不跟随会保存成功但拉取必失败。
  // 关键:跳转目标必须重跑 SSRF 校验——否则一个公网 URL 可以 302 到内网,把前置校验绕干净。
  // 返回 null 表示不是重定向。
  _resolveRedirect(response, currentUrl, remaining, label) {
    const status = response.statusCode
    if (![301, 302, 303, 307, 308].includes(status)) {
      return null
    }
    if (remaining <= 0) {
      throw new Error(`${label}重定向次数过多`)
    }
    const location = response.headers.location
    if (!location) {
      throw new Error(`${label}返回 ${status} 但缺少 Location 头`)
    }
    // 相对跳转按当前 URL 解析
    const target = new URL(location, currentUrl).toString()
    this._assertSafeSourceUrl(target, `${label}的重定向目标`)
    logger.debug(`[pricing] redirect status=${status} to=${maskUrl(target)}`)
    return target
  }

  // 获取远端哈希值
  fetchRemoteHash(hashUrl = this.hashUrl, redirectsLeft = MAX_REDIRECTS) {
    return new Promise((resolve, reject) => {
      const options = { lookup: this._guardedLookup('哈希文件') }
      const request = this._clientFor(hashUrl).get(hashUrl, options, (response) => {
        let redirectTarget
        try {
          redirectTarget = this._resolveRedirect(response, hashUrl, redirectsLeft, '哈希文件')
        } catch (error) {
          response.resume()
          reject(error)
          return
        }
        if (redirectTarget) {
          response.resume()
          this.fetchRemoteHash(redirectTarget, redirectsLeft - 1).then(resolve, reject)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`哈希文件获取失败：HTTP ${response.statusCode}`))
          return
        }

        let data = ''
        response.on('data', (chunk) => {
          data += chunk
          if (data.length > MAX_HASH_BYTES) {
            request.destroy()
            reject(new Error(`哈希文件超过大小上限 ${MAX_HASH_BYTES} 字节`))
          }
        })

        response.on('end', () => {
          const hash = data.trim().split(/\s+/)[0]

          if (!hash) {
            reject(new Error('哈希文件内容为空'))
            return
          }

          resolve(hash)
        })
      })

      request.on('error', (error) => {
        reject(new Error(`网络错误：${error.message}`))
      })

      request.setTimeout(30000, () => {
        request.destroy()
        reject(new Error('获取哈希超时（30秒）'))
      })
    })
  }

  // 计算本地文件哈希
  computeLocalHash() {
    if (!fs.existsSync(this.pricingFile)) {
      return null
    }

    if (fs.existsSync(this.localHashFile)) {
      const cached = fs.readFileSync(this.localHashFile, 'utf8').trim()
      if (cached) {
        return cached
      }
    }

    const fileBuffer = fs.readFileSync(this.pricingFile)
    return this.persistLocalHash(fileBuffer)
  }

  // 写入本地哈希文件
  persistLocalHash(content) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')
    fs.writeFileSync(this.localHashFile, `${hash}\n`)
    return hash
  }

  // 实际的下载逻辑。调用前先解析生效源,保证管理端改源后立即用新地址
  async _downloadFromRemote() {
    const { pricingUrl } = await this.resolveSource()
    return this._downloadFromUrl(pricingUrl)
  }

  _downloadFromUrl(pricingUrl, redirectsLeft = MAX_REDIRECTS) {
    return new Promise((resolve, reject) => {
      const options = { lookup: this._guardedLookup('定价文件') }
      const request = this._clientFor(pricingUrl).get(pricingUrl, options, (response) => {
        let redirectTarget
        try {
          redirectTarget = this._resolveRedirect(response, pricingUrl, redirectsLeft, '定价文件')
        } catch (error) {
          response.resume()
          reject(error)
          return
        }
        if (redirectTarget) {
          response.resume()
          this._downloadFromUrl(redirectTarget, redirectsLeft - 1).then(resolve, reject)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
          return
        }

        const chunks = []
        let received = 0
        response.on('data', (chunk) => {
          const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          received += bufferChunk.length
          // 超限立即断流:不能等 'end' 才判断,否则内存已经被吃掉了
          if (received > MAX_PRICING_BYTES) {
            request.destroy()
            reject(
              new Error(`定价文件超过大小上限 ${Math.round(MAX_PRICING_BYTES / 1024 / 1024)}MB`)
            )
            return
          }
          chunks.push(bufferChunk)
        })

        response.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks)
            const rawContent = buffer.toString('utf8')
            const jsonData = JSON.parse(rawContent)

            // 保存到文件并更新哈希
            fs.writeFileSync(this.pricingFile, rawContent)
            this.persistLocalHash(buffer)

            // 更新内存中的数据
            this.pricingData = jsonData
            this.lastUpdated = new Date()

            logger.success(`Downloaded pricing data for ${Object.keys(jsonData).length} models`)

            // 设置或重新设置文件监听器
            this.setupFileWatcher()

            resolve()
          } catch (error) {
            reject(new Error(`Failed to parse pricing data: ${error.message}`))
          }
        })
      })

      request.on('error', (error) => {
        reject(new Error(`Network error: ${error.message}`))
      })

      request.setTimeout(30000, () => {
        request.destroy()
        reject(new Error('Download timeout after 30 seconds'))
      })
    })
  }

  // 加载本地价格数据
  async loadPricingData() {
    try {
      if (fs.existsSync(this.pricingFile)) {
        const data = fs.readFileSync(this.pricingFile, 'utf8')
        this.pricingData = JSON.parse(data)

        const stats = fs.statSync(this.pricingFile)
        this.lastUpdated = stats.mtime

        logger.info(
          `💰 Loaded pricing data for ${Object.keys(this.pricingData).length} models from cache`
        )
      } else {
        logger.warn('💰 No pricing data file found, will use fallback')
        await this.useFallbackPricing()
      }
    } catch (error) {
      logger.error('❌ Failed to load pricing data:', error)
      await this.useFallbackPricing()
    }
  }

  // 使用fallback价格数据
  async useFallbackPricing() {
    try {
      if (fs.existsSync(this.fallbackFile)) {
        logger.info('📋 Copying fallback pricing data to data directory...')

        // 读取fallback文件
        const fallbackData = fs.readFileSync(this.fallbackFile, 'utf8')
        const jsonData = JSON.parse(fallbackData)

        const formattedJson = JSON.stringify(jsonData, null, 2)

        // 保存到data目录
        fs.writeFileSync(this.pricingFile, formattedJson)
        this.persistLocalHash(formattedJson)

        // 更新内存中的数据
        this.pricingData = jsonData
        this.lastUpdated = new Date()

        // 设置或重新设置文件监听器
        this.setupFileWatcher()

        logger.warn(`⚠️  Using fallback pricing data for ${Object.keys(jsonData).length} models`)
        logger.info(
          '💡 Note: This fallback data may be outdated. The system will try to update from the remote source on next check.'
        )
      } else {
        logger.error('❌ Fallback pricing file not found at:', this.fallbackFile)
        logger.error(
          '❌ Please ensure the resources/model-pricing directory exists with the pricing file'
        )
        this.pricingData = {}
      }
    } catch (error) {
      logger.error('❌ Failed to use fallback pricing data:', error)
      this.pricingData = {}
    }
  }

  // 获取模型价格信息
  getModelPricing(modelName) {
    if (!this.pricingData || !modelName) {
      return null
    }

    // 尝试直接匹配
    if (this.pricingData[modelName]) {
      logger.debug(`💰 Found exact pricing match for ${modelName}`)
      return this.pricingData[modelName]
    }

    // 特殊处理：gpt-5.5 回退到 gpt-5
    if (modelName === 'gpt-5.5' && !this.pricingData['gpt-5.5']) {
      const fallbackPricing = this.pricingData['gpt-5']
      if (fallbackPricing) {
        logger.info(`💰 Using gpt-5 pricing as fallback for ${modelName}`)
        return fallbackPricing
      }
    }

    // 特殊处理：gpt-5.6 系列（sol/terra/luna）在 LiteLLM 收录前回退到 gpt-5
    if (modelName.startsWith('gpt-5.6') && !this.pricingData[modelName]) {
      const fallbackPricing = this.pricingData['gpt-5']
      if (fallbackPricing) {
        logger.info(`💰 Using gpt-5 pricing as fallback for ${modelName}`)
        return fallbackPricing
      }
    }

    // 对于Bedrock区域前缀模型（如 us.anthropic.claude-sonnet-4-20250514-v1:0），
    // 尝试去掉区域前缀进行匹配
    if (modelName.includes('.anthropic.') || modelName.includes('.claude')) {
      // 提取不带区域前缀的模型名
      const withoutRegion = modelName.replace(/^(us|eu|apac)\./, '')
      if (this.pricingData[withoutRegion]) {
        logger.debug(
          `💰 Found pricing for ${modelName} by removing region prefix: ${withoutRegion}`
        )
        return this.pricingData[withoutRegion]
      }
    }

    // 尝试模糊匹配（处理版本号等变化）
    const normalizedModel = modelName.toLowerCase().replace(/[_-]/g, '')

    for (const [key, value] of Object.entries(this.pricingData)) {
      const normalizedKey = key.toLowerCase().replace(/[_-]/g, '')
      if (normalizedKey.includes(normalizedModel) || normalizedModel.includes(normalizedKey)) {
        logger.debug(`💰 Found pricing for ${modelName} using fuzzy match: ${key}`)
        return value
      }
    }

    // 对于Bedrock模型，尝试更智能的匹配
    if (modelName.includes('anthropic.claude')) {
      // 提取核心模型名部分（去掉区域和前缀）
      const coreModel = modelName.replace(/^(us|eu|apac)\./, '').replace('anthropic.', '')

      for (const [key, value] of Object.entries(this.pricingData)) {
        if (key.includes(coreModel) || key.replace('anthropic.', '').includes(coreModel)) {
          logger.debug(`💰 Found pricing for ${modelName} using Bedrock core model match: ${key}`)
          return value
        }
      }
    }

    logger.debug(`💰 No pricing found for model: ${modelName}`)
    return null
  }

  // 确保价格对象包含缓存价格
  ensureCachePricing(pricing) {
    if (!pricing) {
      return pricing
    }

    // 如果缺少缓存价格，根据输入价格计算（缓存创建价格通常是输入价格的1.25倍，缓存读取是0.1倍）
    if (!pricing.cache_creation_input_token_cost && pricing.input_cost_per_token) {
      pricing.cache_creation_input_token_cost = pricing.input_cost_per_token * 1.25
    }
    if (!pricing.cache_read_input_token_cost && pricing.input_cost_per_token) {
      pricing.cache_read_input_token_cost = pricing.input_cost_per_token * 0.1
    }
    return pricing
  }

  // 从 usage 对象中提取 beta 特性列表（小写）
  extractBetaFeatures(usage) {
    const features = new Set()
    if (!usage || typeof usage !== 'object') {
      return features
    }

    const requestHeaders = usage.request_headers || usage.requestHeaders || null
    const headerBeta =
      requestHeaders && typeof requestHeaders === 'object'
        ? requestHeaders['anthropic-beta'] ||
          requestHeaders['Anthropic-Beta'] ||
          requestHeaders['ANTHROPIC-BETA']
        : null

    const candidates = [
      usage.anthropic_beta,
      usage.anthropicBeta,
      usage.request_anthropic_beta,
      usage.requestAnthropicBeta,
      usage.beta_header,
      usage.betaHeader,
      usage.beta_features,
      headerBeta
    ]

    const addFeature = (value) => {
      if (!value || typeof value !== 'string') {
        return
      }
      value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .forEach((item) => features.add(item))
    }

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        candidate.forEach(addFeature)
      } else {
        addFeature(candidate)
      }
    }

    return features
  }

  // 提取请求/响应中的 speed 字段（小写）
  extractSpeedSignal(usage) {
    if (!usage || typeof usage !== 'object') {
      return { responseSpeed: '', requestSpeed: '' }
    }

    const normalize = (value) =>
      typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : ''

    return {
      responseSpeed: normalize(usage.speed),
      requestSpeed: normalize(usage.request_speed || usage.requestSpeed)
    }
  }

  // 去掉模型名中的 [1m] 后缀，便于价格查找
  stripLongContextSuffix(modelName) {
    if (typeof modelName !== 'string') {
      return modelName
    }
    return modelName.replace(/\[1m\]/gi, '').trim()
  }

  // 计算使用费用
  calculateCost(usage, modelName) {
    const normalizedModelName = this.stripLongContextSuffix(modelName)

    // 检查是否为 1M 上下文模型（用户通过 [1m] 后缀主动选择长上下文模式）
    const isLongContextModel = typeof modelName === 'string' && modelName.includes('[1m]')
    let isLongContextRequest = false
    let useLongContextPricing = false

    // 计算总输入 tokens（用于判断是否超过 200K 阈值）
    const inputTokens = usage.input_tokens || 0
    const cacheCreationTokens = usage.cache_creation_input_tokens || 0
    const cacheReadTokens = usage.cache_read_input_tokens || 0
    const totalInputTokens = inputTokens + cacheCreationTokens + cacheReadTokens

    // 识别 Claude 特性标识
    const betaFeatures = this.extractBetaFeatures(usage)
    const hasContext1mBeta = betaFeatures.has(this.claudeFeatureFlags.context1mBeta)
    const hasFastModeBeta = betaFeatures.has(this.claudeFeatureFlags.fastModeBeta)
    const { responseSpeed, requestSpeed } = this.extractSpeedSignal(usage)
    const hasFastSpeedSignal =
      responseSpeed === this.claudeFeatureFlags.fastModeSpeed ||
      requestSpeed === this.claudeFeatureFlags.fastModeSpeed
    const isFastModeRequest = hasFastModeBeta && hasFastSpeedSignal
    const standardPricing = this.getModelPricing(modelName)
    const pricing = standardPricing
    const isLongContextModeEnabled = isLongContextModel || hasContext1mBeta
    // Per official Anthropic pricing: all Claude models have flat pricing with no 200K+ premium
    // https://platform.claude.com/docs/en/about-claude/pricing
    const ignores200kLongContextPricing =
      (typeof normalizedModelName === 'string' &&
        normalizedModelName.toLowerCase().includes('claude')) ||
      (typeof standardPricing?.litellm_provider === 'string' &&
        standardPricing.litellm_provider.toLowerCase().includes('anthropic'))

    // Fast Mode 倍率：优先从 provider_specific_entry.fast 读取，默认 6 倍
    const fastMultiplier = isFastModeRequest ? pricing?.provider_specific_entry?.fast || 6 : 1

    // 当 [1m] 模型总输入超过 200K 时，进入 200K+ 计费逻辑
    // 根据 Anthropic 官方文档：当总输入超过 200K 时，整个请求所有 token 类型都使用高档价格
    if (isLongContextModeEnabled && totalInputTokens > 200000) {
      if (ignores200kLongContextPricing) {
        logger.info(
          `💰 Skipping 200K+ pricing for ${modelName}: Claude models use flat pricing regardless of context length`
        )
      } else {
        isLongContextRequest = true
        useLongContextPricing = true
        logger.info(
          `💰 Using 200K+ pricing for ${modelName}: total input tokens = ${totalInputTokens.toLocaleString()}`
        )
      }
    }

    if (!pricing) {
      return {
        inputCost: 0,
        outputCost: 0,
        cacheCreateCost: 0,
        cacheReadCost: 0,
        ephemeral5mCost: 0,
        ephemeral1hCost: 0,
        totalCost: 0,
        hasPricing: false,
        isLongContextRequest: false
      }
    }

    const isClaudeModel =
      (modelName && modelName.toLowerCase().includes('claude')) ||
      (typeof pricing?.litellm_provider === 'string' &&
        pricing.litellm_provider.toLowerCase().includes('anthropic'))

    if (isFastModeRequest && fastMultiplier > 1) {
      logger.info(
        `🚀 Fast mode ${fastMultiplier}x multiplier applied for ${normalizedModelName} (from provider_specific_entry)`
      )
    } else if (isFastModeRequest) {
      logger.warn(
        `⚠️ Fast mode request detected but no fast pricing found for ${normalizedModelName}; fallback to standard profile`
      )
    }

    const baseInputPrice = pricing.input_cost_per_token || 0
    const hasInput200kPrice =
      pricing.input_cost_per_token_above_200k_tokens !== null &&
      pricing.input_cost_per_token_above_200k_tokens !== undefined

    // 确定实际使用的输入价格（普通或 200K+ 高档价格）
    // Claude 模型在 200K+ 场景下如果缺少官方字段，按 2 倍输入价兜底
    let actualInputPrice = useLongContextPricing
      ? hasInput200kPrice
        ? pricing.input_cost_per_token_above_200k_tokens
        : isClaudeModel
          ? baseInputPrice * 2
          : baseInputPrice
      : baseInputPrice

    const baseOutputPrice = pricing.output_cost_per_token || 0
    const hasOutput200kPrice =
      pricing.output_cost_per_token_above_200k_tokens !== null &&
      pricing.output_cost_per_token_above_200k_tokens !== undefined
    let actualOutputPrice = useLongContextPricing
      ? hasOutput200kPrice
        ? pricing.output_cost_per_token_above_200k_tokens
        : baseOutputPrice
      : baseOutputPrice

    // 缓存价格：优先从 model_pricing.json 取，Claude 缺失时用倍率兜底
    let actualCacheCreatePrice = 0
    let actualCacheReadPrice = 0
    let actualEphemeral1hPrice = 0

    if (useLongContextPricing) {
      // 200K+：Claude 仅用 above_200k 专用字段，缺失留 0 让下方兜底从 actualInputPrice 推导
      actualCacheCreatePrice = isClaudeModel
        ? pricing.cache_creation_input_token_cost_above_200k_tokens || 0
        : pricing.cache_creation_input_token_cost_above_200k_tokens ||
          pricing.cache_creation_input_token_cost ||
          0
      actualCacheReadPrice = isClaudeModel
        ? pricing.cache_read_input_token_cost_above_200k_tokens || 0
        : pricing.cache_read_input_token_cost_above_200k_tokens ||
          pricing.cache_read_input_token_cost ||
          0
      const has1h200k =
        pricing.cache_creation_input_token_cost_above_1hr_above_200k_tokens !== null &&
        pricing.cache_creation_input_token_cost_above_1hr_above_200k_tokens !== undefined
      actualEphemeral1hPrice = has1h200k
        ? pricing.cache_creation_input_token_cost_above_1hr_above_200k_tokens
        : isClaudeModel
          ? 0
          : pricing.cache_creation_input_token_cost_above_1hr || 0
    } else {
      actualCacheCreatePrice = pricing.cache_creation_input_token_cost || 0
      actualCacheReadPrice = pricing.cache_read_input_token_cost || 0
      actualEphemeral1hPrice = pricing.cache_creation_input_token_cost_above_1hr || 0
    }

    // Claude 兜底：pricing 字段缺失时用倍率从 actualInputPrice 推导
    // 此时 actualInputPrice 尚未含 fastMultiplier，下方统一应用
    if (isClaudeModel) {
      if (!actualCacheCreatePrice) {
        actualCacheCreatePrice = actualInputPrice * this.claudeCacheMultipliers.write5m
      }
      if (!actualCacheReadPrice) {
        actualCacheReadPrice = actualInputPrice * this.claudeCacheMultipliers.read
      }
      if (!actualEphemeral1hPrice) {
        actualEphemeral1hPrice = actualInputPrice * this.claudeCacheMultipliers.write1h
      }
    }

    // Fast Mode 倍率：统一一次性应用于所有价格
    if (fastMultiplier > 1) {
      actualInputPrice *= fastMultiplier
      actualOutputPrice *= fastMultiplier
      actualCacheCreatePrice *= fastMultiplier
      actualCacheReadPrice *= fastMultiplier
      actualEphemeral1hPrice *= fastMultiplier
    }

    // 计算各项费用
    const inputCost = inputTokens * actualInputPrice
    const outputCost = (usage.output_tokens || 0) * actualOutputPrice

    // 处理缓存费用
    let ephemeral5mCost = 0
    let ephemeral1hCost = 0
    let cacheCreateCost = 0
    let cacheReadCost = 0

    if (usage.cache_creation && typeof usage.cache_creation === 'object') {
      // 有详细的缓存创建数据
      const ephemeral5mTokens = usage.cache_creation.ephemeral_5m_input_tokens || 0
      const ephemeral1hTokens = usage.cache_creation.ephemeral_1h_input_tokens || 0

      // 5分钟缓存使用 cache_creation 价格
      ephemeral5mCost = ephemeral5mTokens * actualCacheCreatePrice

      // 1小时缓存使用 ephemeral_1h 价格
      ephemeral1hCost = ephemeral1hTokens * actualEphemeral1hPrice

      // 总的缓存创建费用
      cacheCreateCost = ephemeral5mCost + ephemeral1hCost
    } else if (cacheCreationTokens) {
      // 旧格式，所有缓存创建 tokens 都按 5 分钟价格计算（向后兼容）
      cacheCreateCost = cacheCreationTokens * actualCacheCreatePrice
      ephemeral5mCost = cacheCreateCost
    }

    // 缓存读取费用
    cacheReadCost = cacheReadTokens * actualCacheReadPrice

    return {
      inputCost,
      outputCost,
      cacheCreateCost,
      cacheReadCost,
      ephemeral5mCost,
      ephemeral1hCost,
      totalCost: inputCost + outputCost + cacheCreateCost + cacheReadCost,
      hasPricing: true,
      isLongContextRequest,
      pricing: {
        input: actualInputPrice,
        output: actualOutputPrice,
        cacheCreate: actualCacheCreatePrice,
        cacheRead: actualCacheReadPrice,
        ephemeral1h: actualEphemeral1hPrice
      }
    }
  }

  // 格式化价格显示
  formatCost(cost) {
    if (cost === 0) {
      return '$0.000000'
    }
    if (cost < 0.000001) {
      return `$${cost.toExponential(2)}`
    }
    if (cost < 0.01) {
      return `$${cost.toFixed(6)}`
    }
    if (cost < 1) {
      return `$${cost.toFixed(4)}`
    }
    return `$${cost.toFixed(2)}`
  }

  // 获取服务状态。source 段回显当前生效源,供管理端展示"数据从哪来"
  getStatus() {
    return {
      initialized: this.pricingData !== null,
      lastUpdated: this.lastUpdated,
      modelCount: this.pricingData ? Object.keys(this.pricingData).length : 0,
      nextUpdate: this.lastUpdated
        ? new Date(this.lastUpdated.getTime() + this.updateInterval)
        : null,
      // 回显一律走 maskUrl:状态接口是管理端可读的,而 env 配的源(PRICE_MIRROR_JSON_URL)
      // 也可能带私有 token,不能原样返回
      source: {
        pricingUrl: maskUrl(this.pricingUrl),
        hashUrl: maskUrl(this.hashUrl),
        custom: this.sourceFromRedis,
        defaultPricingUrl: maskUrl(pricingSource.pricingUrl),
        defaultHashUrl: maskUrl(pricingSource.hashUrl)
      }
    }
  }

  // 强制更新价格数据
  async forceUpdate() {
    try {
      await this._downloadFromRemote()
      return { success: true, message: 'Pricing data updated successfully' }
    } catch (error) {
      logger.error('❌ Force update failed:', error)
      logger.info('📋 Force update failed, using fallback pricing data...')
      await this.useFallbackPricing()
      return {
        success: false,
        message: `Download failed: ${error.message}. Using fallback pricing data instead.`
      }
    }
  }

  // 设置文件监听器
  setupFileWatcher() {
    try {
      // 如果已有监听器，先关闭
      if (this.fileWatcher) {
        this.fileWatcher.close()
        this.fileWatcher = null
      }

      // 只有文件存在时才设置监听器
      if (!fs.existsSync(this.pricingFile)) {
        logger.debug('💰 Pricing file does not exist yet, skipping file watcher setup')
        return
      }

      // 使用 fs.watchFile 作为更可靠的文件监听方式
      // 它使用轮询，虽然性能稍差，但更可靠
      const watchOptions = {
        persistent: true,
        interval: 60000 // 每60秒检查一次
      }

      // 记录初始的修改时间
      let lastMtime = fs.statSync(this.pricingFile).mtimeMs

      fs.watchFile(this.pricingFile, watchOptions, (curr, _prev) => {
        // 检查文件是否真的被修改了（不仅仅是访问）
        if (curr.mtimeMs !== lastMtime) {
          lastMtime = curr.mtimeMs
          logger.debug(
            `💰 Detected change in pricing file (mtime: ${new Date(curr.mtime).toISOString()})`
          )
          this.handleFileChange()
        }
      })

      // 保存引用以便清理
      this.fileWatcher = {
        close: () => fs.unwatchFile(this.pricingFile)
      }

      logger.info('👁️  File watcher set up for model_pricing.json (polling every 60s)')
    } catch (error) {
      logger.error('❌ Failed to setup file watcher:', error)
    }
  }

  // 处理文件变化（带防抖）
  handleFileChange() {
    // 清除之前的定时器
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer)
    }

    // 设置新的定时器（防抖500ms）
    this.reloadDebounceTimer = setTimeout(async () => {
      logger.info('🔄 Reloading pricing data due to file change...')
      await this.reloadPricingData()
    }, 500)
  }

  // 重新加载价格数据
  async reloadPricingData() {
    try {
      // 验证文件是否存在
      if (!fs.existsSync(this.pricingFile)) {
        logger.warn('💰 Pricing file was deleted, using fallback')
        await this.useFallbackPricing()
        // 重新设置文件监听器（fallback会创建新文件）
        this.setupFileWatcher()
        return
      }

      // 读取文件内容
      const data = fs.readFileSync(this.pricingFile, 'utf8')

      // 尝试解析JSON
      const jsonData = JSON.parse(data)

      // 验证数据结构
      if (typeof jsonData !== 'object' || Object.keys(jsonData).length === 0) {
        throw new Error('Invalid pricing data structure')
      }

      // 更新内存中的数据
      this.pricingData = jsonData
      this.lastUpdated = new Date()

      const modelCount = Object.keys(jsonData).length
      logger.success(`Reloaded pricing data for ${modelCount} models from file`)

      // 显示一些统计信息
      const claudeModels = Object.keys(jsonData).filter((k) => k.includes('claude')).length
      const gptModels = Object.keys(jsonData).filter((k) => k.includes('gpt')).length
      const geminiModels = Object.keys(jsonData).filter((k) => k.includes('gemini')).length

      logger.debug(
        `💰 Model breakdown: Claude=${claudeModels}, GPT=${gptModels}, Gemini=${geminiModels}`
      )
    } catch (error) {
      logger.error('❌ Failed to reload pricing data:', error)
      logger.warn('💰 Keeping existing pricing data in memory')
    }
  }

  // 清理资源
  cleanup() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = null
      logger.debug('💰 Pricing update timer cleared')
    }
    if (this.fileWatcher) {
      this.fileWatcher.close()
      this.fileWatcher = null
      logger.debug('💰 File watcher closed')
    }
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer)
      this.reloadDebounceTimer = null
    }
    if (this.hashCheckTimer) {
      clearInterval(this.hashCheckTimer)
      this.hashCheckTimer = null
      logger.debug('💰 Hash check timer cleared')
    }
  }
}

module.exports = new PricingService()
