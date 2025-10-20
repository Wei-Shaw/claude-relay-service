#!/usr/bin/env node

/**
 * 测试团队 Memory 注入功能
 *
 * 用法：
 * 1. 启用团队 Memory 测试：CLAUDE_TEAM_MEMORY_ENABLED=true node scripts/test-team-memory.js
 * 2. 禁用团队 Memory 测试：node scripts/test-team-memory.js
 */

const path = require('path')
const dotenv = require('dotenv')
const fs = require('fs')

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') })

// 尝试加载 config.js，如果不存在则使用 config.example.js
let config
try {
  config = require('../config/config')
} catch {
  config = require('../config/config.example')
}

const redis = require('../src/models/redis')
const claudeRelayService = require('../src/services/claudeRelayService')

async function testTeamMemory() {
  try {
    console.log('=== 团队 Memory 功能测试 ===\n')

    // 1. 显示当前配置
    console.log('📋 当前配置:')
    console.log(`   - enabled: ${config.claude.teamMemory.enabled}`)
    console.log(`   - useCacheControl: ${config.claude.teamMemory.useCacheControl}`)
    console.log(`   - onlyForRealClaudeCode: ${config.claude.teamMemory.onlyForRealClaudeCode}`)
    console.log(`   - content length: ${config.claude.teamMemory.content?.length || 0} 字符\n`)

    // 2. 检查文件
    console.log('📂 检查团队 Memory 文件:')
    const memoryFilePaths = [
      path.join(process.cwd(), '.local', 'team-memory.md'),
      path.join(process.cwd(), '.local', 'TEAM_CLAUDE.md'),
      path.join(process.cwd(), 'data', 'team-memory.md')
    ]

    let foundFile = null
    for (const filePath of memoryFilePaths) {
      const exists = fs.existsSync(filePath)
      console.log(`   ${exists ? '✅' : '❌'} ${filePath}`)
      if (exists && !foundFile) {
        const content = fs.readFileSync(filePath, 'utf8')
        console.log(`      文件大小: ${content.length} 字符`)
        console.log(`      预览: ${content.substring(0, 80).replace(/\n/g, ' ')}...`)
        foundFile = filePath
      }
    }
    console.log()

    // 3. 连接 Redis（可选，某些测试可以不依赖 Redis）
    let _redisConnected = false
    try {
      console.log('📡 尝试连接 Redis...')
      await redis.connect()
      console.log('✅ Redis 连接成功\n')
      _redisConnected = true
    } catch (error) {
      console.log('⚠️  Redis 连接失败，跳过需要 Redis 的测试')
      console.log(`   错误: ${error.message}\n`)
    }

    // 4. 测试真实的 Claude Code 请求
    console.log('🧪 测试场景 1: 真实的 Claude Code 请求\n')

    const realClaudeCodeBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: "You are Claude Code, Anthropic's official CLI for Claude.",
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: '# User Project CLAUDE.md\n\nThis is user project specific instructions.'
        }
      ],
      messages: [
        {
          role: 'user',
          content: 'Hello, test team memory injection!'
        }
      ]
    }

    console.log(`   原始 system prompts 数量: ${realClaudeCodeBody.system.length}`)

    // 调用真实的 _processRequestBody 方法
    const processedBody1 = claudeRelayService._processRequestBody(
      JSON.parse(JSON.stringify(realClaudeCodeBody)),
      null
    )

    console.log(`   处理后 system prompts 数量: ${processedBody1.system.length}`)
    console.log('\n   📊 最终 system prompts 结构:')
    processedBody1.system.forEach((item, index) => {
      const hasCache = item.cache_control ? ' [cached]' : ''
      const preview = item.text.substring(0, 60).replace(/\n/g, ' ')
      console.log(`      [${index}]${hasCache} ${preview}...`)
    })

    // 验证注入位置
    if (config.claude.teamMemory.enabled && (foundFile || config.claude.teamMemory.content)) {
      if (processedBody1.system.length >= 2) {
        const secondPrompt = processedBody1.system[1]
        const isTeamMemory =
          secondPrompt.text.includes('团队') ||
          secondPrompt.text.includes('规范') ||
          secondPrompt.text === config.claude.teamMemory.content

        if (isTeamMemory) {
          console.log('\n   ✅ 团队 Memory 已成功注入到第 2 个位置（Claude Code prompt 之后）')
        } else {
          console.log('\n   ⚠️  第 2 个位置不是团队 Memory，注入可能失败')
        }
      } else {
        console.log('\n   ❌ system prompts 数量不足，团队 Memory 未注入')
      }
    } else {
      console.log('\n   ℹ️  团队 Memory 未启用或内容为空')
    }

    // 5. 测试非 Claude Code 请求（如果 onlyForRealClaudeCode=true，不应注入）
    console.log('\n\n🧪 测试场景 2: 非 Claude Code 请求\n')

    const nonClaudeCodeBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: 'This is a regular system prompt, not Claude Code.',
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    }

    console.log(`   原始 system: ${typeof nonClaudeCodeBody.system}`)

    const processedBody2 = claudeRelayService._processRequestBody(
      JSON.parse(JSON.stringify(nonClaudeCodeBody)),
      null
    )

    console.log(`   处理后 system prompts 数量: ${processedBody2.system.length}`)
    console.log('\n   📊 最终 system prompts 结构:')
    processedBody2.system.forEach((item, index) => {
      const hasCache = item.cache_control ? ' [cached]' : ''
      const preview = item.text.substring(0, 60).replace(/\n/g, ' ')
      console.log(`      [${index}]${hasCache} ${preview}...`)
    })

    if (config.claude.teamMemory.enabled && config.claude.teamMemory.onlyForRealClaudeCode) {
      // 非 Claude Code 请求，应该有：Claude Code prompt (0) + 用户 prompt (1) = 2
      // 不应该有团队 Memory
      if (processedBody2.system.length === 2) {
        console.log(
          '\n   ✅ 正确：非 Claude Code 请求未注入团队 Memory（onlyForRealClaudeCode=true）'
        )
      } else {
        console.log('\n   ⚠️  注意：system prompts 数量不符合预期')
      }
    } else if (
      config.claude.teamMemory.enabled &&
      !config.claude.teamMemory.onlyForRealClaudeCode
    ) {
      // 应该注入团队 Memory
      if (processedBody2.system.length >= 2) {
        console.log(
          '\n   ✅ 正确：非 Claude Code 请求也注入了团队 Memory（onlyForRealClaudeCode=false）'
        )
      }
    } else {
      console.log('\n   ℹ️  团队 Memory 未启用')
    }

    // 6. 测试 cache_control 限制
    console.log('\n\n🧪 测试场景 3: Cache Control 限制（最多4个）\n')

    const bodyCacheTest = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: "You are Claude Code, Anthropic's official CLI for Claude.",
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: 'User prompt 1',
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: 'User prompt 2',
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: 'User prompt 3',
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [{ role: 'user', content: 'Test' }]
    }

    console.log(
      `   原始带 cache_control 的 prompts: ${bodyCacheTest.system.filter((s) => s.cache_control).length}`
    )

    const processedBody3 = claudeRelayService._processRequestBody(
      JSON.parse(JSON.stringify(bodyCacheTest)),
      null
    )

    const cacheCount = processedBody3.system.filter((s) => s.cache_control).length
    console.log(`   处理后带 cache_control 的 prompts: ${cacheCount}`)

    if (cacheCount <= 4) {
      console.log('   ✅ Cache control 限制检查通过（≤4）')
    } else {
      console.log('   ❌ Cache control 超过限制（>4）')
    }

    console.log('\n✅ 测试完成！')
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    console.error(error.stack)
  } finally {
    // 断开 Redis 连接（如果已连接）
    try {
      if (redis.getClient()?.status === 'ready') {
        await redis.disconnect()
      }
    } catch (e) {
      // 忽略断开连接时的错误
    }
    process.exit(0)
  }
}

// 使用提示
if (!config.claude.teamMemory.enabled) {
  console.log('💡 提示：当前团队 Memory 未启用')
  console.log('   设置 CLAUDE_TEAM_MEMORY_ENABLED=true 启用功能\n')
}

// 运行测试
testTeamMemory()
