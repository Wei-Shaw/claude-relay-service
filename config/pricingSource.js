// 定价数据源配置
// 优先级: PRICE_MIRROR_REPO > GITHUB_REPOSITORY (GitHub Actions自动设置)
// GitHub Actions 会自动设置 GITHUB_REPOSITORY 为当前仓库
// 本地开发/服务器部署: 请设置 PRICE_MIRROR_REPO 环境变量
const repository = process.env.PRICE_MIRROR_REPO || process.env.GITHUB_REPOSITORY

if (!repository) {
  console.warn(
    '[WARNING] 未设置 PRICE_MIRROR_REPO 或 GITHUB_REPOSITORY 环境变量，定价数据源未配置。'
  )
  console.warn('         请设置其中一个环境变量为您的仓库名称（格式: owner/repo）')
}
const branch = process.env.PRICE_MIRROR_BRANCH || 'price-mirror'
const pricingFileName = process.env.PRICE_MIRROR_FILENAME || 'model_prices_and_context_window.json'
const hashFileName =
  process.env.PRICE_MIRROR_HASH_FILENAME || 'model_prices_and_context_window.sha256'

const baseUrl = process.env.PRICE_MIRROR_BASE_URL
  ? process.env.PRICE_MIRROR_BASE_URL.replace(/\/$/, '')
  : `https://raw.githubusercontent.com/${repository}/${branch}`

module.exports = {
  pricingFileName,
  hashFileName,
  pricingUrl: process.env.PRICE_MIRROR_JSON_URL || `${baseUrl}/${pricingFileName}`,
  hashUrl: process.env.PRICE_MIRROR_HASH_URL || `${baseUrl}/${hashFileName}`
}
