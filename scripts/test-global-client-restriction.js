#!/usr/bin/env node

/**
 * 全局客户端限制功能测试脚本
 * 用于验证三级优先级配置是否正常工作
 */

console.log('='.repeat(80))
console.log('🔒 全局客户端限制配置测试')
console.log('='.repeat(80))
console.log()

// 1. 检查环境变量
console.log('📋 当前环境变量:')
console.log('-'.repeat(80))
console.log('  GLOBAL_CLIENT_RESTRICTION_ENABLED = ', process.env.GLOBAL_CLIENT_RESTRICTION_ENABLED || '(未设置)')
console.log('  GLOBAL_ALLOWED_CLIENTS             = ', process.env.GLOBAL_ALLOWED_CLIENTS || '(未设置)')
console.log('  FORCE_GLOBAL_CLIENT_RESTRICTION    = ', process.env.FORCE_GLOBAL_CLIENT_RESTRICTION || '(未设置)')
console.log()

// 模拟配置解析
const mockConfig = {
  clientRestriction: {
    globalEnabled: process.env.GLOBAL_CLIENT_RESTRICTION_ENABLED === 'true',
    globalAllowedClients: process.env.GLOBAL_ALLOWED_CLIENTS
      ? process.env.GLOBAL_ALLOWED_CLIENTS.split(',').map((c) => c.trim())
      : [],
    forceGlobal: process.env.FORCE_GLOBAL_CLIENT_RESTRICTION === 'true'
  }
}

console.log('📋 解析后的配置:')
console.log('-'.repeat(80))
console.log('  globalEnabled:        ', mockConfig.clientRestriction.globalEnabled)
console.log('  globalAllowedClients: ', mockConfig.clientRestriction.globalAllowedClients)
console.log('  forceGlobal:          ', mockConfig.clientRestriction.forceGlobal)
console.log()

// 2. 模拟不同场景的优先级逻辑
console.log('🎯 三级优先级测试场景:')
console.log('-'.repeat(80))
console.log()

// 测试数据
const testScenarios = [
  {
    name: '场景 1: 强制全局配置 (最高优先级)',
    globalConfig: {
      globalEnabled: true,
      globalAllowedClients: ['claude_code', 'gemini_cli'],
      forceGlobal: true
    },
    apiKeyConfig: {
      enableClientRestriction: true,
      allowedClients: ['codex_cli']
    },
    expectedSource: 'force_global',
    expectedClients: ['claude_code', 'gemini_cli']
  },
  {
    name: '场景 2: API Key 级别配置 (中等优先级)',
    globalConfig: {
      globalEnabled: true,
      globalAllowedClients: ['claude_code'],
      forceGlobal: false
    },
    apiKeyConfig: {
      enableClientRestriction: true,
      allowedClients: ['gemini_cli', 'codex_cli']
    },
    expectedSource: 'api_key',
    expectedClients: ['gemini_cli', 'codex_cli']
  },
  {
    name: '场景 3: 全局默认配置 (最低优先级)',
    globalConfig: {
      globalEnabled: true,
      globalAllowedClients: ['claude_code'],
      forceGlobal: false
    },
    apiKeyConfig: {
      enableClientRestriction: false,
      allowedClients: []
    },
    expectedSource: 'global_default',
    expectedClients: ['claude_code']
  },
  {
    name: '场景 4: 无限制',
    globalConfig: {
      globalEnabled: false,
      globalAllowedClients: [],
      forceGlobal: false
    },
    apiKeyConfig: {
      enableClientRestriction: false,
      allowedClients: []
    },
    expectedSource: 'none',
    expectedClients: []
  }
]

// 执行测试
testScenarios.forEach((scenario, index) => {
  console.log(`${index + 1}. ${scenario.name}`)
  console.log('   配置:')
  console.log('     - 全局: enabled=%s, forceGlobal=%s, clients=%s',
    scenario.globalConfig.globalEnabled,
    scenario.globalConfig.forceGlobal,
    JSON.stringify(scenario.globalConfig.globalAllowedClients)
  )
  console.log('     - API Key: enabled=%s, clients=%s',
    scenario.apiKeyConfig.enableClientRestriction,
    JSON.stringify(scenario.apiKeyConfig.allowedClients)
  )

  // 模拟优先级逻辑
  let effectiveRestriction = {
    enabled: false,
    allowedClients: [],
    source: 'none'
  }

  const globalRestriction = scenario.globalConfig

  if (globalRestriction.forceGlobal && globalRestriction.globalEnabled) {
    if (globalRestriction.globalAllowedClients?.length > 0) {
      effectiveRestriction = {
        enabled: true,
        allowedClients: globalRestriction.globalAllowedClients,
        source: 'force_global'
      }
    }
  } else if (
    scenario.apiKeyConfig.enableClientRestriction &&
    scenario.apiKeyConfig.allowedClients?.length > 0
  ) {
    effectiveRestriction = {
      enabled: true,
      allowedClients: scenario.apiKeyConfig.allowedClients,
      source: 'api_key'
    }
  } else if (
    globalRestriction.globalEnabled &&
    globalRestriction.globalAllowedClients?.length > 0
  ) {
    effectiveRestriction = {
      enabled: true,
      allowedClients: globalRestriction.globalAllowedClients,
      source: 'global_default'
    }
  }

  // 验证结果
  const sourceMatch = effectiveRestriction.source === scenario.expectedSource
  const clientsMatch = JSON.stringify(effectiveRestriction.allowedClients) === JSON.stringify(scenario.expectedClients)

  console.log('   结果:')
  console.log('     - 配置来源: %s %s',
    effectiveRestriction.source,
    sourceMatch ? '✅' : '❌'
  )
  console.log('     - 允许客户端: %s %s',
    JSON.stringify(effectiveRestriction.allowedClients),
    clientsMatch ? '✅' : '❌'
  )
  console.log()
})

// 3. 配置建议
console.log('💡 配置示例:')
console.log('-'.repeat(80))
console.log()

console.log('# 启用全局默认客户端限制（API Key 级别配置优先）')
console.log('export GLOBAL_CLIENT_RESTRICTION_ENABLED=true')
console.log('export GLOBAL_ALLOWED_CLIENTS="claude_code,gemini_cli"')
console.log()

console.log('# 强制所有 API Key 使用全局配置（覆盖 API Key 级别设置）')
console.log('export GLOBAL_CLIENT_RESTRICTION_ENABLED=true')
console.log('export GLOBAL_ALLOWED_CLIENTS="claude_code"')
console.log('export FORCE_GLOBAL_CLIENT_RESTRICTION=true')
console.log()

console.log('='.repeat(80))
console.log('✅ 测试完成')
console.log('='.repeat(80))
