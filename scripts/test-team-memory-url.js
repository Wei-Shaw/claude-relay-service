#!/usr/bin/env node

/**
 * 团队 Memory URL 拉取和自动刷新功能测试脚本
 * 测试从远程 URL 加载团队 Memory 和定期刷新机制
 */

const http = require('http')
const path = require('path')
const fs = require('fs')

// 测试用的简单 HTTP 服务器
let testContent = '# Test Team Memory v1\n\nThis is test content.'
let requestCount = 0

const testServer = http.createServer((req, res) => {
  requestCount++
  console.log(`📡 Mock server received request #${requestCount}`)

  res.writeHead(200, {
    'Content-Type': 'text/markdown; charset=utf-8'
  })
  res.end(testContent)
})

const TEST_PORT = 8765
const TEST_URL = `http://localhost:${TEST_PORT}/team-memory.md`

// 临时文件路径
const localMemoryPath = path.join(process.cwd(), '.local', 'team-memory.md')
const backupPath = `${localMemoryPath}.backup`

async function runTests() {
  console.log('🧪 Testing Team Memory URL Loading and Auto-Refresh\n')

  // 备份并删除本地文件（如果存在）
  if (fs.existsSync(localMemoryPath)) {
    fs.renameSync(localMemoryPath, backupPath)
    console.log('📦 Backed up local team-memory.md')
  }

  // 启动测试服务器
  await new Promise((resolve) => {
    testServer.listen(TEST_PORT, () => {
      console.log(`✅ Test server started at ${TEST_URL}`)
      resolve()
    })
  })

  // 设置测试环境变量（在导入模块之前）
  process.env.CLAUDE_TEAM_MEMORY_ENABLED = 'true'
  process.env.CLAUDE_TEAM_MEMORY_URL = TEST_URL
  process.env.CLAUDE_TEAM_MEMORY_REFRESH_INTERVAL = '0.1' // 0.1分钟 = 6秒刷新一次

  // 清除所有缓存的模块
  delete require.cache[require.resolve('../config/config')]
  delete require.cache[require.resolve('../src/services/claudeMemoryService')]
  delete require.cache[require.resolve('../src/utils/logger')]

  // 导入服务（确保使用新的环境变量）
  const claudeMemoryService = require('../src/services/claudeMemoryService')

  console.log('\n📋 Test 1: Initial URL loading')
  console.log(`=${'='.repeat(50)}`)

  // 等待初始化完成
  await new Promise((resolve) => setTimeout(resolve, 1000))

  const status1 = claudeMemoryService.getStatus()
  console.log('Status:', JSON.stringify(status1, null, 2))

  if (status1.source !== 'url') {
    console.error('❌ Expected source to be "url", got:', status1.source)
  } else {
    console.log('✅ Source is correct: url')
  }

  if (status1.cacheSize === 0) {
    console.error('❌ Cache is empty, URL loading failed')
  } else {
    console.log('✅ Content loaded from URL, size:', status1.cacheSize)
  }

  console.log('\n📋 Test 2: Manual refresh')
  console.log(`=${'='.repeat(50)}`)

  // 修改测试内容
  testContent = '# Test Team Memory v2\n\nUpdated content!'
  const beforeRefreshCount = requestCount

  await claudeMemoryService.refreshMemory()

  if (requestCount <= beforeRefreshCount) {
    console.error('❌ No new request sent to URL')
  } else {
    console.log('✅ Refresh triggered new request')
  }

  const status2 = claudeMemoryService.getStatus()
  console.log('Updated cache size:', status2.cacheSize)

  console.log('\n📋 Test 3: Auto-refresh mechanism')
  console.log(`=${'='.repeat(50)}`)

  // 修改测试内容
  testContent = '# Test Team Memory v3\n\nAuto-refreshed content!'
  const beforeAutoRefreshCount = requestCount

  console.log('Waiting for auto-refresh (6 seconds)...')
  await new Promise((resolve) => setTimeout(resolve, 7000))

  if (requestCount <= beforeAutoRefreshCount) {
    console.error('❌ Auto-refresh did not trigger')
  } else {
    console.log('✅ Auto-refresh triggered successfully')
    console.log('Request count increased from', beforeAutoRefreshCount, 'to', requestCount)
  }

  const status3 = claudeMemoryService.getStatus()
  console.log('Final status:', JSON.stringify(status3, null, 2))

  console.log('\n📋 Test 4: Priority testing (content > url)')
  console.log(`=${'='.repeat(50)}`)

  // 临时设置直接内容（优先级更高）
  process.env.CLAUDE_TEAM_MEMORY_CONTENT = '# Direct Content\n\nThis has higher priority.'

  // 完全重新加载服务和配置
  claudeMemoryService.stopAutoRefresh()
  claudeMemoryService.clearCache()
  delete require.cache[require.resolve('../config/config')]
  delete require.cache[require.resolve('../src/services/claudeMemoryService')]

  // 重新导入服务
  const claudeMemoryService2 = require('../src/services/claudeMemoryService')

  // 等待异步初始化完成
  await new Promise((resolve) => setTimeout(resolve, 500))

  // 手动加载以确保测试
  const content4 = claudeMemoryService2.loadTeamMemory()
  let status4 = claudeMemoryService2.getStatus()

  if (status4.source === 'content' && content4.includes('Direct Content')) {
    console.log('✅ Direct content has higher priority than URL')
    console.log('Source:', status4.source, ', Size:', status4.cacheSize)
  } else {
    console.error('❌ Priority test failed')
    console.log('Source:', status4.source, ', Content preview:', content4.substring(0, 50))
  }

  // 清理
  delete process.env.CLAUDE_TEAM_MEMORY_CONTENT
  claudeMemoryService2.stopAutoRefresh()

  console.log('\n📋 Test 5: Error handling (invalid URL)')
  console.log(`=${'='.repeat(50)}`)

  claudeMemoryService.clearCache()
  process.env.CLAUDE_TEAM_MEMORY_URL = 'http://localhost:9999/nonexistent'
  delete require.cache[require.resolve('../config/config')]

  try {
    await claudeMemoryService.refreshMemory()
    console.log('⚠️  Refresh completed (expected to fail gracefully)')

    // 应该保留旧缓存或返回空
    status4 = claudeMemoryService.getStatus()
    console.log('✅ Error handled gracefully, cache:', status4.cacheSize)
  } catch (error) {
    console.error('❌ Unexpected error thrown:', error.message)
  }

  // 停止自动刷新和测试服务器
  claudeMemoryService.stopAutoRefresh()
  testServer.close()

  // 恢复备份文件
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, localMemoryPath)
    console.log('\n📦 Restored local team-memory.md from backup')
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('✅ All tests completed!')
  console.log('Total requests to mock server:', requestCount)
  console.log('='.repeat(60))

  process.exit(0)
}

// 运行测试
runTests().catch((error) => {
  console.error('❌ Test failed:', error)
  testServer.close()

  // 恢复备份文件（即使测试失败）
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, localMemoryPath)
    console.log('📦 Restored local team-memory.md from backup')
  }

  process.exit(1)
})
