#!/usr/bin/env node

const bedrockRelayService = require('../src/services/relay/bedrockRelayService')

async function testBedrockModels() {
  try {
    console.log('🧪 测试Bedrock模型配置...')

    // 测试可用模型列表
    const models = await bedrockRelayService.getAvailableModels()
    console.log(`📋 找到 ${models.length} 个可用模型:`)
    models.forEach((model) => {
      console.log(`  - ${model.id} (${model.name})`)
    })

    // 测试默认模型
    console.log(`\n🎯 系统默认模型: ${bedrockRelayService.defaultModel}`)
    console.log(`🎯 系统默认小模型: ${bedrockRelayService.defaultSmallModel}`)

    console.log('\n✅ Bedrock模型配置测试完成')
    process.exit(0)
  } catch (error) {
    console.error('❌ Bedrock模型测试失败:', error)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testBedrockModels()
}

module.exports = { testBedrockModels }
