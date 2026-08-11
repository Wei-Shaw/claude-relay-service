// 兼容层台账(Compatibility Layer Registry)
//
// 收拢所有"兼容旧数据格式"的代码,在册有主、标注下线条件。统一出口 + 台账索引。
// 各函数的来源/收拢日期/原始语义/下线条件见对应子模块头注释。
//
// | 兼容点              | 位置                          | 类型                          | 下线条件                          |
// |--------------------|-------------------------------|-------------------------------|-----------------------------------|
// | permissions        | compat/permissions.js         | 权限旧格式(字符串/逗号/JSON)  | 所有 Key permissions 为规范数组   |
// | tokenStats         | compat/tokenStats.js          | usage token 旧单字段(30/70)   | 所有 usage 写分离字段             |
// | apiKeyHash         | compat/apiKeyHash.js          | apikey_hash 新旧双结构        | 旧结构清退、hash_map 完整         |
// | auth rate-limit    | src/middleware/auth.js:~1124  | tokenLimit 优先 rateLimitCost | 所有 Key 用 rateLimitCost         |
//
// 在册不搬:auth.js 的 token/cost 优先级判断与 res.status(429) HTTP 响应高度耦合,
//   抽取需拆分决策与响应、改动认证中间件,风险高收益低,故保留原地、仅在此登记。

const permissions = require('./permissions')
const tokenStats = require('./tokenStats')
const apiKeyHash = require('./apiKeyHash')

module.exports = {
  ...permissions,
  ...tokenStats,
  ...apiKeyHash
}
