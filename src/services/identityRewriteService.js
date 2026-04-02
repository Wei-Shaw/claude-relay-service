/**
 * Identity Rewrite Service
 *
 * 防封号统一身份重写服务
 * 移植自 cc-gateway 的 rewriter.ts 逻辑
 * 纯函数，无全局状态
 */

const logger = require('../utils/logger')
const redis = require('../models/redis')
const config = require('../../config/config')

// Redis 键前缀
const PROFILE_KEY_PREFIX = 'fmt_identity_profile:'
const PROFILE_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 天

// 关键正则表达式（来自 cc-gateway）
const REGEX = {
  billingFingerprint: /cc_version=[\d.]+\.[a-f0-9]{3}/g,
  platform: /Platform:\s*\S+/g,
  shell: /Shell:\s*\S+/g,
  osVersion: /OS Version:\s*[^\n<]+/g,
  workingDir: /((?:Primary )?[Ww]orking directory:\s*)\/\S+/g,
  homePath: /\/(?:Users|home)\/[^/\s]+\//g
}

/**
 * 获取规范化身份配置
 * 优先从 Redis 获取账户级配置，后备到全局默认值
 * @param {string} accountId - 账户 ID
 * @returns {Object} 身份配置
 */
async function getProfile(accountId) {
  if (!accountId) {
    return getDefaultProfile()
  }

  try {
    const key = `${PROFILE_KEY_PREFIX}${accountId}`
    const data = await redis.getClient().get(key)

    if (data) {
      logger.debug(`📋 Retrieved identity profile for account ${accountId}`)
      return JSON.parse(data)
    }
  } catch (error) {
    logger.warn(`⚠️ Failed to get identity profile for ${accountId}:`, error.message)
  }

  return getDefaultProfile()
}

/**
 * 播种账户级身份配置
 * 使用 NX（仅当不存在时设置），30 天 TTL
 * @param {string} accountId - 账户 ID
 * @param {Object} capturedEnv - 捕获的环境信息
 */
async function seedProfile(accountId, capturedEnv) {
  if (!accountId || !capturedEnv) {
    return
  }

  try {
    const key = `${PROFILE_KEY_PREFIX}${accountId}`

    // 根据捕获的平台选择合适的默认值，避免 Linux/Windows 混入 Darwin 特征
    const defaults = getDefaultProfile()
    const platformDefaults = getPlatformDefaults(capturedEnv.platform || defaults.platform)

    // 构建配置对象
    const profile = {
      platform: capturedEnv.platform || defaults.platform,
      shell: capturedEnv.shell || platformDefaults.shell,
      osVersion: capturedEnv.osVersion || platformDefaults.osVersion,
      workingDir: capturedEnv.workingDir || platformDefaults.workingDir,
      version: capturedEnv.version || defaults.version,
      arch: capturedEnv.arch || defaults.arch,
      nodeVersion: capturedEnv.nodeVersion || defaults.nodeVersion,
      terminal: capturedEnv.terminal || platformDefaults.terminal,
      constrainedMemory: capturedEnv.constrainedMemory || defaults.constrainedMemory,
      rssRange: defaults.rssRange,
      heapTotalRange: defaults.heapTotalRange,
      heapUsedRange: defaults.heapUsedRange,
      packageManagers: capturedEnv.packageManagers || 'npm',
      runtimes: capturedEnv.runtimes || 'node',
      buildTime: capturedEnv.buildTime || new Date().toISOString(),
      deploymentEnvironment: capturedEnv.deploymentEnvironment || 'unknown',
      vcs: capturedEnv.vcs || 'git',
      seededAt: new Date().toISOString()
    }

    // 使用 NX（仅当不存在时设置）
    await redis.getClient().set(key, JSON.stringify(profile), 'EX', PROFILE_TTL_SECONDS, 'NX')
    logger.info(`✅ Seeded identity profile for account ${accountId}`)
  } catch (error) {
    logger.warn(`⚠️ Failed to seed identity profile for ${accountId}:`, error.message)
  }
}

/**
 * 获取默认身份配置
 * @returns {Object} 默认配置
 */
function getDefaultProfile() {
  const defaults = config.identityRewrite?.defaults || {}

  return {
    platform: defaults.platform || 'darwin',
    shell: defaults.shell || 'zsh',
    osVersion: defaults.osVersion || 'Darwin 24.4.0',
    workingDir: defaults.workingDir || '/Users/user/projects',
    version: defaults.version || '2.1.81',
    arch: defaults.arch || 'arm64',
    nodeVersion: defaults.nodeVersion || 'v24.3.0',
    terminal: defaults.terminal || 'iTerm2.app',
    constrainedMemory: defaults.constrainedMemory || 34359738368,
    rssRange: defaults.rssRange || [300000000, 500000000],
    heapTotalRange: defaults.heapTotalRange || [40000000, 80000000],
    heapUsedRange: defaults.heapUsedRange || [100000000, 200000000],
    packageManagers: 'npm',
    runtimes: 'node',
    buildTime: new Date().toISOString(),
    deploymentEnvironment: 'unknown',
    vcs: 'git'
  }
}

/**
 * 根据平台返回匹配的默认值
 * 避免将 Darwin 特征混入 Linux/Windows 配置
 * @param {string} platform - 平台标识（darwin/linux/win32）
 * @returns {Object} 平台相关的默认值
 */
function getPlatformDefaults(platform) {
  const defaults = getDefaultProfile()

  switch (platform) {
    case 'linux':
      return {
        shell: 'bash',
        osVersion: 'Linux 6.8.0',
        workingDir: '/home/user/projects',
        terminal: 'xterm-256color'
      }
    case 'win32':
      return {
        shell: 'powershell',
        osVersion: 'Windows 10.0.22631',
        workingDir: 'C:\\Users\\user\\projects',
        terminal: 'Windows Terminal'
      }
    default:
      // darwin 或其他 — 使用全局配置的默认值
      return {
        shell: defaults.shell,
        osVersion: defaults.osVersion,
        workingDir: defaults.workingDir,
        terminal: defaults.terminal
      }
  }
}

/**
 * 重写系统提示词
 * 重写 Platform/Shell/OS/workingDir/homePaths + billing 指纹
 * @param {Object} body - 请求体（会被修改）
 * @param {Object} profile - 身份配置
 */
function rewriteSystemPrompt(body, profile) {
  if (!body || typeof body !== 'object') {
    return
  }

  const p = profile || getDefaultProfile()

  // 处理 system 字段
  if (body.system) {
    if (typeof body.system === 'string') {
      body.system = rewritePromptText(body.system, p)
    } else if (Array.isArray(body.system)) {
      body.system = body.system.map((item) => {
        if (item && typeof item.text === 'string') {
          return {
            ...item,
            text: rewritePromptText(item.text, p)
          }
        }
        return item
      })
    }
  }

  // 注意：不重写 body.messages 中的路径
  // 用户消息包含真实的文件路径，模型需要这些路径来正确调用工具（读/写文件）
  // 重写会导致模型引用不存在的路径
}

/**
 * 重写提示词文本
 * 替换 Platform/Shell/OS/workingDir/billing 指纹
 * @param {string} text - 原始文本
 * @param {Object} profile - 身份配置
 * @returns {string} 重写后的文本
 */
function rewritePromptText(text, profile) {
  if (typeof text !== 'string') {
    return text
  }

  const p = profile || getDefaultProfile()
  let result = text

  // 重写 billing header 指纹
  result = result.replace(REGEX.billingFingerprint, `cc_version=${p.version}.000`)

  // 重写 Platform
  result = result.replace(REGEX.platform, `Platform: ${p.platform}`)

  // 重写 Shell
  result = result.replace(REGEX.shell, `Shell: ${p.shell}`)

  // 重写 OS Version
  result = result.replace(REGEX.osVersion, `OS Version: ${p.osVersion}`)

  // 重写 Working directory
  result = result.replace(REGEX.workingDir, `$1${p.workingDir}`)

  // 重写 home 路径
  result = rewriteHomePaths(result, p.workingDir)

  return result
}

/**
 * 重写 home 路径
 * 将 /Users/xxx/ 或 /home/xxx/ 替换为规范路径
 * @param {string} text - 原始文本
 * @param {string} workingDir - 工作目录前缀
 * @returns {string} 重写后的文本
 */
function rewriteHomePaths(text, workingDir) {
  if (typeof text !== 'string') {
    return text
  }

  // 提取工作目录的前缀（如 /Users/user/）
  const prefix = workingDir || '/Users/user/'
  const homePrefix = prefix.endsWith('/') ? prefix : `${prefix}/`

  return text.replace(REGEX.homePath, homePrefix)
}

/**
 * 重写通用身份字段
 * 用于 /policy_limits、/settings 等非消息路径
 * 防止 device_id 和 email 通过旁路泄漏
 * @param {Object} body - 请求体（会被修改）
 * @param {Object} profile - 身份配置
 */
function rewriteGenericIdentity(body, profile) {
  if (!body || typeof body !== 'object') {
    return
  }

  if (body.device_id) {
    body.device_id = generateDeviceId(profile || getDefaultProfile())
  }
  if (body.email) {
    body.email = 'user@example.com'
  }
}

/**
 * 剥离泄漏字段
 * 删除可能暴露 relay/gateway 信息的字段
 * @param {Object} body - 请求体（会被修改）
 */
function stripLeakFields(body) {
  if (!body || typeof body !== 'object') {
    return
  }

  delete body.baseUrl
  delete body.base_url
  delete body.gateway
}

/**
 * 重写事件批量请求
 * 重写 device_id, email, env, process，剥离泄漏字段
 * @param {Object} body - 事件批量请求体
 * @param {Object} profile - 身份配置
 * @returns {Object} 重写后的请求体
 */
function rewriteEventBatch(body, profile) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.events)) {
    return body
  }

  const p = profile || getDefaultProfile()
  const result = { ...body }

  result.events = body.events.map((event) => {
    if (!event || typeof event !== 'object' || !event.event_data) {
      return event
    }

    const data = { ...event.event_data }

    // 重写 identity 字段
    if (data.device_id) {
      data.device_id = generateDeviceId(p)
    }
    if (data.email) {
      data.email = 'user@example.com' // 使用默认邮箱
    }

    // 重写环境对象（完全替换）
    if (data.env && typeof data.env === 'object') {
      data.env = buildCanonicalEnv(p)
    }

    // 重写 process 指标
    if (data.process) {
      data.process = buildCanonicalProcess(data.process, p)
    }

    // 剥离泄漏字段
    stripLeakFields(data)

    // 重写 additional_metadata
    if (data.additional_metadata) {
      data.additional_metadata = rewriteAdditionalMetadata(data.additional_metadata, p)
    }

    return {
      ...event,
      event_data: data
    }
  })

  return result
}

/**
 * 构建规范化环境对象
 * @param {Object} profile - 身份配置
 * @returns {Object} 规范化环境对象
 */
function buildCanonicalEnv(profile) {
  const p = profile || getDefaultProfile()

  return {
    platform: p.platform,
    platform_raw: p.platform,
    arch: p.arch,
    node_version: p.nodeVersion,
    terminal: p.terminal,
    package_managers: p.packageManagers || 'npm',
    runtimes: p.runtimes || 'node',
    is_running_with_bun: false,
    is_ci: false, // 强制为 false
    is_claubbit: false,
    is_claude_code_remote: false,
    is_local_agent_mode: false,
    is_conductor: false,
    is_github_action: false,
    is_claude_code_action: false,
    is_claude_ai_auth: true,
    version: p.version,
    version_base: p.version,
    build_time: p.buildTime,
    deployment_environment: p.deploymentEnvironment,
    vcs: p.vcs
  }
}

/**
 * 构建规范化进程指标
 * 支持对象或 base64 编码字符串
 * @param {Object|string} original - 原始进程指标
 * @param {Object} profile - 身份配置
 * @returns {Object|string} 规范化进程指标
 */
function buildCanonicalProcess(original, profile) {
  const p = profile || getDefaultProfile()

  // 如果是 base64 字符串
  if (typeof original === 'string') {
    try {
      const decoded = JSON.parse(Buffer.from(original, 'base64').toString())
      const rewritten = rewriteProcessFields(decoded, p)
      return Buffer.from(JSON.stringify(rewritten)).toString('base64')
    } catch (error) {
      logger.warn('⚠️ Failed to decode base64 process metrics:', error.message)
      return original
    }
  }

  // 如果是对象
  if (original && typeof original === 'object') {
    return rewriteProcessFields(original, p)
  }

  return original
}

/**
 * 重写进程字段
 * @param {Object} proc - 原始进程对象
 * @param {Object} profile - 身份配置
 * @returns {Object} 重写后的进程对象
 */
function rewriteProcessFields(proc, profile) {
  const p = profile || getDefaultProfile()

  return {
    ...proc,
    constrainedMemory: p.constrainedMemory,
    rss: randomInRange(p.rssRange[0], p.rssRange[1]),
    heapTotal: randomInRange(p.heapTotalRange[0], p.heapTotalRange[1]),
    heapUsed: randomInRange(p.heapUsedRange[0], p.heapUsedRange[1])
    // uptime 和 cpuUsage 保留原值（自然变化）
  }
}

/**
 * 重写 additional_metadata
 * @param {string} b64 - base64 编码的元数据
 * @param {Object} profile - 身份配置
 * @returns {string} 重写后的 base64 编码
 */
function rewriteAdditionalMetadata(b64, _profile) {
  if (typeof b64 !== 'string') {
    return b64
  }

  try {
    const decoded = JSON.parse(Buffer.from(b64, 'base64').toString())

    // 剥离泄漏字段
    stripLeakFields(decoded)

    return Buffer.from(JSON.stringify(decoded)).toString('base64')
  } catch (error) {
    logger.warn('⚠️ Failed to rewrite additional_metadata:', error.message)
    return b64
  }
}

/**
 * 生成设备 ID
 * 基于配置生成确定性设备 ID（哈希）
 * @param {Object} profile - 身份配置
 * @returns {string} 64 字符十六进制设备 ID
 */
function generateDeviceId(profile) {
  const p = profile || getDefaultProfile()
  const crypto = require('crypto')

  // 基于配置生成确定性哈希
  const seed = `${p.platform}:${p.arch}:${p.nodeVersion}:${p.terminal}`
  return crypto.createHash('sha256').update(seed).digest('hex')
}

/**
 * 生成指定范围内的随机数
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 随机整数
 */
function randomInRange(min, max) {
  return Math.floor(min + Math.random() * (max - min))
}

module.exports = {
  getProfile,
  seedProfile,
  getDefaultProfile,
  getPlatformDefaults,
  rewriteSystemPrompt,
  rewritePromptText,
  rewriteHomePaths,
  rewriteGenericIdentity,
  rewriteEventBatch,
  buildCanonicalEnv,
  buildCanonicalProcess,
  rewriteProcessFields,
  rewriteAdditionalMetadata,
  stripLeakFields,
  generateDeviceId,
  REGEX
}
