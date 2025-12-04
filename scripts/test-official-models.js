#!/usr/bin/env node
/**
 * 官方模型版本识别测试 - 最终版 v2
 */

/**
 * 检查模型是否为 Opus 4.5 或更新版本
 * 支持格式:
 *   - 新格式: claude-opus-{major}[-{minor}][-date] 如 claude-opus-4-5-20251101
 *   - 新格式: claude-opus-{major}.{minor} 如 claude-opus-4.5
 *   - 旧格式: claude-{version}-opus[-date] 如 claude-3-opus-20240229
 *
 * @param {string} modelName - 模型名称
 * @returns {boolean} - 是否为 Opus 4.5+
 */
function isOpus45OrNewer(modelName) {
  if (!modelName) return false

  const lowerModel = modelName.toLowerCase()
  if (!lowerModel.includes('opus')) return false

  // 处理 latest 特殊情况
  if (lowerModel.includes('opus-latest') || lowerModel.includes('opus_latest')) {
    return true
  }

  // 旧格式: claude-{version}-opus (版本在 opus 前面)
  // 例如: claude-3-opus-20240229, claude-3.5-opus
  const oldFormatMatch = lowerModel.match(/claude[- ](\d+)(?:[\.-](\d+))?[- ]opus/)
  if (oldFormatMatch) {
    const majorVersion = parseInt(oldFormatMatch[1], 10)
    const minorVersion = oldFormatMatch[2] ? parseInt(oldFormatMatch[2], 10) : 0

    // 旧格式的版本号指的是 Claude 大版本
    if (majorVersion > 4) return true
    if (majorVersion === 4 && minorVersion >= 5) return true
    return false
  }

  // 新格式 1: opus-{major}.{minor} (点分隔)
  // 例如: claude-opus-4.5, opus-4.5
  const dotFormatMatch = lowerModel.match(/opus[- ]?(\d+)\.(\d+)/)
  if (dotFormatMatch) {
    const majorVersion = parseInt(dotFormatMatch[1], 10)
    const minorVersion = parseInt(dotFormatMatch[2], 10)

    if (majorVersion > 4) return true
    if (majorVersion === 4 && minorVersion >= 5) return true
    return false
  }

  // 新格式 2: opus-{major}[-{minor}][-date] (横线分隔)
  // 例如: claude-opus-4-5-20251101, claude-opus-4-20250514, claude-opus-4-1-20250805
  // 关键：小版本号必须是 1 位数字，且后面紧跟 8 位日期或结束
  // 如果 opus-{major} 后面直接是 8 位日期，则没有小版本号

  // 提取 opus 后面的部分
  const opusIndex = lowerModel.indexOf('opus')
  const afterOpus = lowerModel.substring(opusIndex + 4) // 'opus' 后面的内容

  // 尝试匹配: -{major}-{minor}-{date} 或 -{major}-{date} 或 -{major}
  // 小版本号只能是 1 位数字 (如 1, 5)，不会是 2 位以上
  const versionMatch = afterOpus.match(/^[- ](\d+)(?:[- ](\d)(?=[- ]\d{8}|$))?/)

  if (versionMatch) {
    const majorVersion = parseInt(versionMatch[1], 10)
    const minorVersion = versionMatch[2] ? parseInt(versionMatch[2], 10) : 0

    if (majorVersion > 4) return true
    if (majorVersion === 4 && minorVersion >= 5) return true
    return false
  }

  // 其他包含 opus 但无法解析版本的情况，默认认为是旧版本
  return false
}

// 官方模型
const officialModels = [
  { name: 'claude-3-opus-20240229', desc: 'Opus 3 (已弃用)', expectPro: false },
  { name: 'claude-opus-4-20250514', desc: 'Opus 4.0', expectPro: false },
  { name: 'claude-opus-4-1-20250805', desc: 'Opus 4.1', expectPro: false },
  { name: 'claude-opus-4-5-20251101', desc: 'Opus 4.5', expectPro: true }
]

// 非 Opus 模型
const nonOpusModels = [
  { name: 'claude-sonnet-4-20250514', desc: 'Sonnet 4' },
  { name: 'claude-sonnet-4-5-20250929', desc: 'Sonnet 4.5' },
  { name: 'claude-haiku-4-5-20251001', desc: 'Haiku 4.5' },
  { name: 'claude-3-5-haiku-20241022', desc: 'Haiku 3.5' },
  { name: 'claude-3-haiku-20240307', desc: 'Haiku 3' },
  { name: 'claude-3-7-sonnet-20250219', desc: 'Sonnet 3.7 (已弃用)' }
]

// 其他格式测试
const otherFormats = [
  { name: 'claude-opus-4.5', expected: true, desc: 'Opus 4.5 点分隔' },
  { name: 'claude-opus-4-5', expected: true, desc: 'Opus 4.5 横线分隔' },
  { name: 'opus-4.5', expected: true, desc: 'Opus 4.5 无前缀' },
  { name: 'opus-4-5', expected: true, desc: 'Opus 4-5 无前缀' },
  { name: 'opus-latest', expected: true, desc: 'Opus latest' },
  { name: 'claude-opus-5', expected: true, desc: 'Opus 5 (未来)' },
  { name: 'claude-opus-5-0', expected: true, desc: 'Opus 5.0 (未来)' },
  { name: 'opus-4.0', expected: false, desc: 'Opus 4.0' },
  { name: 'opus-4.1', expected: false, desc: 'Opus 4.1' },
  { name: 'opus-4.4', expected: false, desc: 'Opus 4.4' },
  { name: 'opus-4', expected: false, desc: 'Opus 4' },
  { name: 'opus-4-0', expected: false, desc: 'Opus 4-0' },
  { name: 'opus-4-1', expected: false, desc: 'Opus 4-1' },
  { name: 'opus-4-4', expected: false, desc: 'Opus 4-4' },
  { name: 'opus', expected: false, desc: '仅 opus' },
  { name: null, expected: false, desc: 'null' },
  { name: '', expected: false, desc: '空字符串' }
]

console.log('='.repeat(90))
console.log('官方模型版本识别测试 - 最终版 v2')
console.log('='.repeat(90))
console.log()

let passed = 0
let failed = 0

// 测试官方 Opus 模型
console.log('📌 官方 Opus 模型:')
for (const m of officialModels) {
  const result = isOpus45OrNewer(m.name)
  const status = result === m.expectPro ? '✅ PASS' : '❌ FAIL'
  if (result === m.expectPro) passed++
  else failed++
  const proSupport = result ? 'Pro 可用 ✅' : 'Pro 不可用 ❌'
  console.log(`  ${status} | ${m.name.padEnd(32)} | ${m.desc.padEnd(18)} | ${proSupport}`)
}

console.log()
console.log('📌 非 Opus 模型 (不受此函数影响):')
for (const m of nonOpusModels) {
  const result = isOpus45OrNewer(m.name)
  console.log(
    `  ➖      | ${m.name.padEnd(32)} | ${m.desc.padEnd(18)} | ${result ? '⚠️ 异常' : '正确跳过'}`
  )
  if (result) failed++ // 非 Opus 模型不应返回 true
}

console.log()
console.log('📌 其他格式测试:')
for (const m of otherFormats) {
  const result = isOpus45OrNewer(m.name)
  const status = result === m.expected ? '✅ PASS' : '❌ FAIL'
  if (result === m.expected) passed++
  else failed++
  const display = m.name === null ? 'null' : m.name === '' ? '""' : m.name
  console.log(
    `  ${status} | ${display.padEnd(25)} | ${m.desc.padEnd(18)} | ${result ? 'Pro 可用' : 'Pro 不可用'}`
  )
}

console.log()
console.log('='.repeat(90))
console.log('测试结果:', passed, '通过,', failed, '失败')
console.log('='.repeat(90))

if (failed > 0) {
  console.log('\n❌ 有测试失败，请检查函数逻辑')
  process.exit(1)
} else {
  console.log('\n✅ 所有测试通过！函数可以安全使用')
  process.exit(0)
}
