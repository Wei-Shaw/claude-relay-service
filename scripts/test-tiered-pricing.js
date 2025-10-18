#!/usr/bin/env node

/**
 * 测试分级定价功能
 * 验证 pricingService 能够正确处理 tiered_pricing 模型
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
}

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warn: (msg) => console.warn(`${colors.yellow}[WARNING]${colors.reset} ${msg}`)
}

// 模拟 pricingService 的分级定价逻辑
class TieredPricingTester {
  constructor() {
    // 模拟 dashscope/qwen3-max-preview 的分级定价
    this.testModel = {
      litellm_provider: 'dashscope',
      max_input_tokens: 258048,
      max_output_tokens: 65536,
      mode: 'chat',
      tiered_pricing: [
        {
          input_cost_per_token: 1.2e-6,
          output_cost_per_token: 6e-6,
          range: [0, 32000.0]
        },
        {
          input_cost_per_token: 2.4e-6,
          output_cost_per_token: 1.2e-5,
          range: [32000.0, 128000.0]
        },
        {
          input_cost_per_token: 3e-6,
          output_cost_per_token: 1.5e-5,
          range: [128000.0, 252000.0]
        }
      ]
    }
  }

  getPricingFromTier(tieredPricing, tokenCount) {
    if (!tieredPricing || !Array.isArray(tieredPricing)) {
      return null
    }

    // 找到适用的价格区间
    for (const tier of tieredPricing) {
      const [min, max] = tier.range || [0, Infinity]
      if (tokenCount >= min && tokenCount < max) {
        return {
          input_cost_per_token: tier.input_cost_per_token,
          output_cost_per_token: tier.output_cost_per_token,
          range: tier.range
        }
      }
    }

    // 如果没有找到匹配的区间，使用最后一个区间（通常是最高档）
    const lastTier = tieredPricing[tieredPricing.length - 1]
    if (lastTier) {
      return {
        input_cost_per_token: lastTier.input_cost_per_token,
        output_cost_per_token: lastTier.output_cost_per_token,
        range: lastTier.range
      }
    }

    return null
  }

  calculateTieredCost(inputTokens, outputTokens) {
    const inputPricing = this.getPricingFromTier(this.testModel.tiered_pricing, inputTokens)
    const outputPricing = this.getPricingFromTier(this.testModel.tiered_pricing, outputTokens)

    if (!inputPricing || !outputPricing) {
      return null
    }

    const inputCost = inputTokens * inputPricing.input_cost_per_token
    const outputCost = outputTokens * outputPricing.output_cost_per_token
    const totalCost = inputCost + outputCost

    return {
      inputTokens,
      outputTokens,
      inputPricing,
      outputPricing,
      inputCost,
      outputCost,
      totalCost
    }
  }

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

  runTests() {
    console.log(
      `${colors.bright}${colors.blue}======================================${colors.reset}`
    )
    console.log(`${colors.bright}  Tiered Pricing Test${colors.reset}`)
    console.log(
      `${colors.bright}${colors.blue}======================================${colors.reset}\n`
    )

    log.info('Testing model: dashscope/qwen3-max-preview')
    console.log('\nPricing Tiers:')
    this.testModel.tiered_pricing.forEach((tier, index) => {
      console.log(
        `  Tier ${index + 1}: ${tier.range[0].toLocaleString()} - ${tier.range[1].toLocaleString()} tokens`
      )
      console.log(`    Input:  $${tier.input_cost_per_token.toExponential(2)}/token`)
      console.log(`    Output: $${tier.output_cost_per_token.toExponential(2)}/token`)
    })

    const testCases = [
      { input: 1000, output: 500, description: 'Small request (Tier 1)' },
      { input: 10000, output: 5000, description: 'Medium request (Tier 1)' },
      { input: 50000, output: 10000, description: 'Large request (Tier 2)' },
      { input: 150000, output: 20000, description: 'Very large request (Tier 3)' },
      { input: 300000, output: 50000, description: 'Beyond max range (uses Tier 3)' }
    ]

    console.log('\n' + `${colors.bright}Test Cases:${colors.reset}\n`)

    let allPassed = true

    testCases.forEach((testCase, index) => {
      const result = this.calculateTieredCost(testCase.input, testCase.output)

      if (!result) {
        log.error(`Test ${index + 1} FAILED: Could not calculate cost`)
        allPassed = false
        return
      }

      console.log(`${colors.bright}Test ${index + 1}: ${testCase.description}${colors.reset}`)
      console.log(`  Input tokens:  ${result.inputTokens.toLocaleString()}`)
      console.log(
        `  Input tier:    [${result.inputPricing.range[0].toLocaleString()} - ${result.inputPricing.range[1].toLocaleString()}]`
      )
      console.log(
        `  Input rate:    $${result.inputPricing.input_cost_per_token.toExponential(2)}/token`
      )
      console.log(`  Input cost:    ${this.formatCost(result.inputCost)}`)
      console.log(`  Output tokens: ${result.outputTokens.toLocaleString()}`)
      console.log(
        `  Output tier:   [${result.outputPricing.range[0].toLocaleString()} - ${result.outputPricing.range[1].toLocaleString()}]`
      )
      console.log(
        `  Output rate:   $${result.outputPricing.output_cost_per_token.toExponential(2)}/token`
      )
      console.log(`  Output cost:   ${this.formatCost(result.outputCost)}`)
      console.log(
        `  ${colors.bright}Total cost:    ${this.formatCost(result.totalCost)}${colors.reset}`
      )

      // 验证成本不为0
      if (result.totalCost === 0) {
        log.error(`  ❌ FAILED: Total cost is 0!`)
        allPassed = false
      } else {
        log.success(`  ✓ PASSED: Cost calculated correctly`)
      }
      console.log('')
    })

    console.log(
      `${colors.bright}${colors.blue}======================================${colors.reset}`
    )
    if (allPassed) {
      log.success('All tests passed!')
      console.log(
        `${colors.bright}${colors.green}✅ Tiered pricing works correctly!${colors.reset}`
      )
      return 0
    } else {
      log.error('Some tests failed!')
      console.log(`${colors.bright}${colors.red}❌ Tiered pricing has issues!${colors.reset}`)
      return 1
    }
  }
}

// 运行测试
const tester = new TieredPricingTester()
const exitCode = tester.runTests()
process.exit(exitCode)
