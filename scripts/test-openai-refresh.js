#!/usr/bin/env node

/**
 * OpenAI Token 刷新功能测试脚本
 * 用于测试 openaiAccountService 的 token 刷新功能
 */

const openaiAccountService = require('../src/services/openaiAccountService')
const logger = require('../src/utils/logger')

// 测试配置（可以通过环境变量或命令行参数传入）
const TEST_REFRESH_TOKEN = process.env.OPENAI_REFRESH_TOKEN || process.argv[2]

async function testRefreshToken() {
  if (!TEST_REFRESH_TOKEN) {
    console.error('❌ 请提供 refresh token 作为参数或设置环境变量 OPENAI_REFRESH_TOKEN')
    console.log('使用方法:')
    console.log('  node scripts/test-openai-refresh.js <refresh_token>')
    console.log('  或')
    console.log('  OPENAI_REFRESH_TOKEN=<token> node scripts/test-openai-refresh.js')
    process.exit(1)
  }

  console.log('🔄 开始测试 OpenAI token 刷新功能...\n')

  try {
    // 测试不带代理的刷新
    console.log('1️⃣ 测试直接刷新（无代理）...')
    const result = await openaiAccountService.refreshAccessToken(TEST_REFRESH_TOKEN)
    
    console.log('✅ 刷新成功！')
    console.log('   Access Token:', result.access_token ? result.access_token.substring(0, 30) + '...' : 'N/A')
    console.log('   ID Token:', result.id_token ? result.id_token.substring(0, 30) + '...' : 'N/A')
    console.log('   Refresh Token:', result.refresh_token ? result.refresh_token.substring(0, 30) + '...' : 'N/A')
    console.log('   有效期:', result.expires_in, '秒')
    console.log('   过期时间:', new Date(result.expiry_date).toLocaleString())
    
    // 如果返回了新的 refresh token
    if (result.refresh_token && result.refresh_token !== TEST_REFRESH_TOKEN) {
      console.log('\n⚠️  注意：收到了新的 refresh token，请保存以供后续使用')
    }

    // 测试带代理的刷新（如果配置了代理）
    if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
      console.log('\n2️⃣ 测试通过代理刷新...')
      const proxy = {
        type: process.env.PROXY_TYPE || 'http',
        host: process.env.PROXY_HOST,
        port: parseInt(process.env.PROXY_PORT),
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD
      }
      
      console.log('   代理配置:', `${proxy.type}://${proxy.host}:${proxy.port}`)
      
      const proxyResult = await openaiAccountService.refreshAccessToken(
        result.refresh_token || TEST_REFRESH_TOKEN,
        proxy
      )
      
      console.log('✅ 通过代理刷新成功！')
      console.log('   Access Token:', proxyResult.access_token ? proxyResult.access_token.substring(0, 30) + '...' : 'N/A')
    }

    // 测试完整的账户刷新流程（如果提供了账户ID）
    if (process.env.OPENAI_ACCOUNT_ID) {
      console.log('\n3️⃣ 测试账户刷新流程...')
      console.log('   账户ID:', process.env.OPENAI_ACCOUNT_ID)
      
      try {
        const account = await openaiAccountService.getAccount(process.env.OPENAI_ACCOUNT_ID)
        if (account) {
          console.log('   账户名称:', account.name)
          console.log('   当前过期时间:', account.expiresAt)
          
          const refreshResult = await openaiAccountService.refreshAccountToken(process.env.OPENAI_ACCOUNT_ID)
          console.log('✅ 账户 token 刷新成功！')
          console.log('   新的过期时间:', new Date(refreshResult.expiry_date).toLocaleString())
        }
      } catch (error) {
        console.log('⚠️  账户刷新测试失败:', error.message)
      }
    }

    console.log('\n✅ 所有测试完成！')
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    if (error.response) {
      console.error('响应状态:', error.response.status)
      console.error('响应数据:', error.response.data)
    }
    process.exit(1)
  }
}

// 运行测试
testRefreshToken().then(() => {
  process.exit(0)
}).catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})