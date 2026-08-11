// 充值商品仓储：后台配置、用户可见的充值商品（额度 + 价格）。与额度卡完全独立。

const { v4: uuidv4 } = require('uuid')

const redis = require('../../models/redis')
const { RedisKeys } = require('../../constants/redisKeys')

const PLAN_KEY = (id) => RedisKeys.payment.plan(id)
const PLANS_ALL = RedisKeys.payment.plansAll
const NUMERIC_FIELDS = ['quotaAmount', 'price', 'sortOrder']

// 校验商品的额度/价格：非正额度或负价格会污染下单、履约（credit 反扣余额）与统计
const validatePlanAmounts = ({ quotaAmount, price }) => {
  if (quotaAmount !== undefined) {
    const quota = Number(quotaAmount)
    if (!Number.isFinite(quota) || quota <= 0) {
      throw new Error('充值商品额度必须是大于 0 的有限数字')
    }
  }
  if (price !== undefined) {
    const priceValue = Number(price)
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      throw new Error('充值商品价格必须是不小于 0 的有限数字')
    }
  }
}

class PlanRepository {
  _deserialize(data) {
    if (!data || Object.keys(data).length === 0) {
      return null
    }
    const plan = { ...data }
    for (const field of NUMERIC_FIELDS) {
      if (plan[field] !== undefined && plan[field] !== '') {
        plan[field] = parseFloat(plan[field])
      }
    }
    plan.enabled = data.enabled === 'true'
    return plan
  }

  async create({
    name,
    quotaAmount,
    price,
    currency = 'CNY',
    description = '',
    sortOrder = 0,
    enabled = true
  }) {
    validatePlanAmounts({ quotaAmount, price })
    const id = uuidv4()
    const plan = {
      id,
      name,
      quotaAmount: String(quotaAmount),
      price: String(price),
      currency,
      description,
      sortOrder: String(sortOrder),
      enabled: enabled ? 'true' : 'false',
      createdAt: new Date().toISOString()
    }
    await redis.client.hset(PLAN_KEY(id), plan)
    await redis.client.sadd(PLANS_ALL, id)
    return this._deserialize(plan)
  }

  async getById(id) {
    return this._deserialize(await redis.client.hgetall(PLAN_KEY(id)))
  }

  async update(id, patch) {
    const exist = await this.getById(id)
    if (!exist) {
      throw new Error('Plan not found')
    }
    validatePlanAmounts(patch)
    const hash = {}
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'enabled') {
        hash[k] = v ? 'true' : 'false'
      } else {
        hash[k] = v === null || v === undefined ? '' : String(v)
      }
    }
    await redis.client.hset(PLAN_KEY(id), hash)
    return this.getById(id)
  }

  async delete(id) {
    await redis.client.del(PLAN_KEY(id))
    await redis.client.srem(PLANS_ALL, id)
    return { success: true }
  }

  async list({ enabledOnly = false } = {}) {
    const ids = await redis.client.smembers(PLANS_ALL)
    let plans = []
    for (const id of ids) {
      const plan = await this.getById(id)
      if (plan) {
        plans.push(plan)
      }
    }
    if (enabledOnly) {
      plans = plans.filter((plan) => plan.enabled)
    }
    plans.sort((a, b) => a.sortOrder - b.sortOrder)
    return plans
  }
}

module.exports = new PlanRepository()
