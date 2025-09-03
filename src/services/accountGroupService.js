const { v4: uuidv4 } = require('uuid')
const logger = require('../utils/logger')
const redis = require('../models/redis')

class AccountGroupService {
  constructor() {
    this.GROUPS_KEY = 'account_groups'
    this.GROUP_PREFIX = 'account_group:'
    this.GROUP_MEMBERS_PREFIX = 'account_group_members:'
  }

  /**
   * 创建账户分组
   * @param {Object} groupData - 分组数据
   * @param {string} groupData.name - 分组名称
   * @param {string} groupData.platform - 平台类型 (claude/gemini/openai)
   * @param {string} groupData.description - 分组描述
   * @returns {Object} 创建的分组
   */
  async createGroup(groupData) {
    try {
      const { name, platform, description = '' } = groupData

      // 验证必填字段
      if (!name || !platform) {
        throw new Error('分组名称和平台类型为必填项')
      }

      // 验证平台类型
      if (!['claude', 'gemini', 'openai'].includes(platform)) {
        throw new Error('平台类型必须是 claude、gemini 或 openai')
      }

      const client = redis.getClientSafe()
      const groupId = uuidv4()
      const now = new Date().toISOString()

      const group = {
        id: groupId,
        name,
        platform,
        description,
        createdAt: now,
        updatedAt: now
      }

      // 保存分组数据
      await client.hmset(`${this.GROUP_PREFIX}${groupId}`, group)

      // 添加到分组集合
      await client.sadd(this.GROUPS_KEY, groupId)

      logger.success(`✅ 创建账户分组成功: ${name} (${platform})`)

      return group
    } catch (error) {
      logger.error('❌ 创建账户分组失败:', error)
      throw error
    }
  }

  /**
   * 更新分组信息
   * @param {string} groupId - 分组ID
   * @param {Object} updates - 更新的字段
   * @returns {Object} 更新后的分组
   */
  async updateGroup(groupId, updates) {
    try {
      const client = redis.getClientSafe()
      const groupKey = `${this.GROUP_PREFIX}${groupId}`

      // 检查分组是否存在
      const exists = await client.exists(groupKey)
      if (!exists) {
        throw new Error('分组不存在')
      }

      // 获取现有分组数据
      const existingGroup = await client.hgetall(groupKey)

      // 不允许修改平台类型
      if (updates.platform && updates.platform !== existingGroup.platform) {
        throw new Error('不能修改分组的平台类型')
      }

      // 准备更新数据
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString()
      }

      // 移除不允许修改的字段
      delete updateData.id
      delete updateData.platform
      delete updateData.createdAt

      // 更新分组
      await client.hmset(groupKey, updateData)

      // 返回更新后的完整数据
      const updatedGroup = await client.hgetall(groupKey)

      logger.success(`✅ 更新账户分组成功: ${updatedGroup.name}`)

      return updatedGroup
    } catch (error) {
      logger.error('❌ 更新账户分组失败:', error)
      throw error
    }
  }

  /**
   * 删除分组
   * @param {string} groupId - 分组ID
   */
  async deleteGroup(groupId) {
    try {
      const client = redis.getClientSafe()

      // 检查分组是否存在
      const group = await this.getGroup(groupId)
      if (!group) {
        throw new Error('分组不存在')
      }

      // 检查分组是否为空
      const members = await this.getGroupMembers(groupId)
      if (members.length > 0) {
        throw new Error('分组内还有账户，无法删除')
      }

      // 检查是否有API Key绑定此分组
      const boundApiKeys = await this.getApiKeysUsingGroup(groupId)
      if (boundApiKeys.length > 0) {
        throw new Error('还有API Key使用此分组，无法删除')
      }

      // 删除分组数据
      await client.del(`${this.GROUP_PREFIX}${groupId}`)
      await client.del(`${this.GROUP_MEMBERS_PREFIX}${groupId}`)

      // 从分组集合中移除
      await client.srem(this.GROUPS_KEY, groupId)

      logger.success(`✅ 删除账户分组成功: ${group.name}`)
    } catch (error) {
      logger.error('❌ 删除账户分组失败:', error)
      throw error
    }
  }

  /**
   * 获取分组详情
   * @param {string} groupId - 分组ID
   * @returns {Object|null} 分组信息
   */
  async getGroup(groupId) {
    try {
      const client = redis.getClientSafe()
      const groupData = await client.hgetall(`${this.GROUP_PREFIX}${groupId}`)

      if (!groupData || Object.keys(groupData).length === 0) {
        return null
      }

      // 获取成员数量
      const memberCount = await client.scard(`${this.GROUP_MEMBERS_PREFIX}${groupId}`)

      return {
        ...groupData,
        memberCount: memberCount || 0
      }
    } catch (error) {
      logger.error('❌ 获取分组详情失败:', error)
      throw error
    }
  }

  /**
   * 获取所有分组
   * @param {string} platform - 平台筛选 (可选)
   * @returns {Array} 分组列表
   */
  async getAllGroups(platform = null) {
    try {
      const client = redis.getClientSafe()
      const groupIds = await client.smembers(this.GROUPS_KEY)

      const groups = []
      for (const groupId of groupIds) {
        const group = await this.getGroup(groupId)
        if (group) {
          // 如果指定了平台，进行筛选
          if (!platform || group.platform === platform) {
            groups.push(group)
          }
        }
      }

      // 按创建时间倒序排序
      groups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      return groups
    } catch (error) {
      logger.error('❌ 获取分组列表失败:', error)
      throw error
    }
  }

  /**
   * 添加账户到分组
   * @param {string} accountId - 账户ID
   * @param {string} groupId - 分组ID
   * @param {string} accountPlatform - 账户平台
   */
  async addAccountToGroup(accountId, groupId, accountPlatform) {
    try {
      const client = redis.getClientSafe()

      // 获取分组信息
      const group = await this.getGroup(groupId)
      if (!group) {
        throw new Error('分组不存在')
      }

      // 验证平台一致性 (Claude和Claude Console视为同一平台)
      const normalizedAccountPlatform =
        accountPlatform === 'claude-console' ? 'claude' : accountPlatform
      if (normalizedAccountPlatform !== group.platform) {
        throw new Error('账户平台与分组平台不匹配')
      }

      // 添加到分组成员集合
      await client.sadd(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)

      logger.success(`✅ 添加账户到分组成功: ${accountId} -> ${group.name}`)
    } catch (error) {
      logger.error('❌ 添加账户到分组失败:', error)
      throw error
    }
  }

  /**
   * 从分组移除账户
   * @param {string} accountId - 账户ID
   * @param {string} groupId - 分组ID
   */
  async removeAccountFromGroup(accountId, groupId) {
    try {
      const client = redis.getClientSafe()

      // 从分组成员集合中移除
      await client.srem(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)

      logger.success(`✅ 从分组移除账户成功: ${accountId}`)
    } catch (error) {
      logger.error('❌ 从分组移除账户失败:', error)
      throw error
    }
  }

  /**
   * 获取分组成员
   * @param {string} groupId - 分组ID
   * @returns {Array} 成员ID列表
   */
  async getGroupMembers(groupId) {
    try {
      const client = redis.getClientSafe()
      const members = await client.smembers(`${this.GROUP_MEMBERS_PREFIX}${groupId}`)
      return members || []
    } catch (error) {
      logger.error('❌ 获取分组成员失败:', error)
      throw error
    }
  }

  /**
   * 检查分组是否为空
   * @param {string} groupId - 分组ID
   * @returns {boolean} 是否为空
   */
  async isGroupEmpty(groupId) {
    try {
      const members = await this.getGroupMembers(groupId)
      return members.length === 0
    } catch (error) {
      logger.error('❌ 检查分组是否为空失败:', error)
      throw error
    }
  }

  /**
   * 获取使用指定分组的API Key列表
   * @param {string} groupId - 分组ID
   * @returns {Array} API Key列表
   */
  async getApiKeysUsingGroup(groupId) {
    try {
      const client = redis.getClientSafe()
      const groupKey = `group:${groupId}`

      // 获取所有API Key
      const apiKeyIds = await client.smembers('api_keys')
      const boundApiKeys = []

      for (const keyId of apiKeyIds) {
        const keyData = await client.hgetall(`api_key:${keyId}`)
        if (
          keyData &&
          (keyData.claudeAccountId === groupKey ||
            keyData.geminiAccountId === groupKey ||
            keyData.openaiAccountId === groupKey)
        ) {
          boundApiKeys.push({
            id: keyId,
            name: keyData.name
          })
        }
      }

      return boundApiKeys
    } catch (error) {
      logger.error('❌ 获取使用分组的API Key失败:', error)
      throw error
    }
  }

  /**
   * 根据账户ID获取其所属的分组（兼容性方法，返回单个分组）
   * @param {string} accountId - 账户ID
   * @returns {Object|null} 分组信息
   */
  async getAccountGroup(accountId) {
    try {
      const client = redis.getClientSafe()
      const allGroupIds = await client.smembers(this.GROUPS_KEY)

      for (const groupId of allGroupIds) {
        const isMember = await client.sismember(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)
        if (isMember) {
          return await this.getGroup(groupId)
        }
      }

      return null
    } catch (error) {
      logger.error('❌ 获取账户所属分组失败:', error)
      throw error
    }
  }

  /**
   * 根据账户ID获取其所属的所有分组
   * @param {string} accountId - 账户ID
   * @returns {Array} 分组信息数组
   */
  async getAccountGroups(accountId) {
    try {
      const client = redis.getClientSafe()
      const allGroupIds = await client.smembers(this.GROUPS_KEY)
      const memberGroups = []

      for (const groupId of allGroupIds) {
        const isMember = await client.sismember(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)
        if (isMember) {
          const group = await this.getGroup(groupId)
          if (group) {
            memberGroups.push(group)
          }
        }
      }

      // 按创建时间倒序排序
      memberGroups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      return memberGroups
    } catch (error) {
      logger.error('❌ 获取账户所属分组列表失败:', error)
      throw error
    }
  }

  /**
   * 批量设置账户的分组
   * @param {string} accountId - 账户ID
   * @param {Array} groupIds - 分组ID数组
   * @param {string} accountPlatform - 账户平台
   */
  async setAccountGroups(accountId, groupIds, accountPlatform) {
    try {
      // 首先移除账户的所有现有分组
      await this.removeAccountFromAllGroups(accountId)

      // 然后添加到新的分组中
      for (const groupId of groupIds) {
        await this.addAccountToGroup(accountId, groupId, accountPlatform)
      }

      logger.success(`✅ 批量设置账户分组成功: ${accountId} -> [${groupIds.join(', ')}]`)
    } catch (error) {
      logger.error('❌ 批量设置账户分组失败:', error)
      throw error
    }
  }

  /**
   * 从所有分组中移除账户
   * @param {string} accountId - 账户ID
   */
  async removeAccountFromAllGroups(accountId) {
    try {
      const client = redis.getClientSafe()
      const allGroupIds = await client.smembers(this.GROUPS_KEY)

      for (const groupId of allGroupIds) {
        await client.srem(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)
      }

      logger.success(`✅ 从所有分组移除账户成功: ${accountId}`)
    } catch (error) {
      logger.error('❌ 从所有分组移除账户失败:', error)
      throw error
    }
  }
}

module.exports = new AccountGroupService()
