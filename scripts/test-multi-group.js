/**
 * 多分组功能测试脚本
 * 测试一个账户可以属于多个分组的功能
 */

require('dotenv').config()
const redis = require('../src/models/redis')
const accountGroupService = require('../src/services/accountGroupService')
const claudeAccountService = require('../src/services/claudeAccountService')

// 测试配置
const TEST_PREFIX = 'multi_group_test_'
const CLEANUP_ON_FINISH = true

// 测试数据存储
const testData = {
  groups: [],
  accounts: []
}

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

function log(message, type = 'info') {
  const color =
    {
      success: colors.green,
      error: colors.red,
      warning: colors.yellow,
      info: colors.blue
    }[type] || colors.reset

  console.log(`${color}${message}${colors.reset}`)
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 清理测试数据
async function cleanup() {
  log('\n🧹 清理测试数据...', 'info')

  // 删除测试账户
  for (const account of testData.accounts) {
    try {
      await claudeAccountService.deleteAccount(account.id)
      log(`✅ 删除测试账户: ${account.name}`, 'success')
    } catch (error) {
      log(`❌ 删除账户失败: ${error.message}`, 'error')
    }
  }

  // 删除测试分组
  for (const group of testData.groups) {
    try {
      // 先移除所有成员
      const members = await accountGroupService.getGroupMembers(group.id)
      for (const memberId of members) {
        await accountGroupService.removeAccountFromGroup(memberId, group.id)
      }

      await accountGroupService.deleteGroup(group.id)
      log(`✅ 删除测试分组: ${group.name}`, 'success')
    } catch (error) {
      log(`❌ 删除分组失败: ${error.message}`, 'error')
    }
  }
}

// 测试1: 创建测试数据
async function test1_createTestData() {
  log('\n📝 测试1: 创建测试数据', 'info')

  try {
    // 创建3个测试分组
    const group1 = await accountGroupService.createGroup({
      name: `${TEST_PREFIX}高优先级组`,
      platform: 'claude',
      description: '高优先级账户分组'
    })
    testData.groups.push(group1)
    log(`✅ 创建分组1: ${group1.name}`, 'success')

    const group2 = await accountGroupService.createGroup({
      name: `${TEST_PREFIX}备用组`,
      platform: 'claude',
      description: '备用账户分组'
    })
    testData.groups.push(group2)
    log(`✅ 创建分组2: ${group2.name}`, 'success')

    const group3 = await accountGroupService.createGroup({
      name: `${TEST_PREFIX}专用组`,
      platform: 'claude',
      description: '专用账户分组'
    })
    testData.groups.push(group3)
    log(`✅ 创建分组3: ${group3.name}`, 'success')

    // 创建测试账户
    const account1 = await claudeAccountService.createAccount({
      name: `${TEST_PREFIX}测试账户1`,
      email: 'test1@example.com',
      refreshToken: 'test_refresh_token_1',
      accountType: 'group'
    })
    testData.accounts.push(account1)
    log(`✅ 创建测试账户1: ${account1.name}`, 'success')

    const account2 = await claudeAccountService.createAccount({
      name: `${TEST_PREFIX}测试账户2`,
      email: 'test2@example.com',
      refreshToken: 'test_refresh_token_2',
      accountType: 'group'
    })
    testData.accounts.push(account2)
    log(`✅ 创建测试账户2: ${account2.name}`, 'success')

    log(`✅ 测试数据创建完成: 3个分组, 2个账户`, 'success')
  } catch (error) {
    log(`❌ 测试1失败: ${error.message}`, 'error')
    throw error
  }
}

// 测试2: 账户加入多个分组
async function test2_addAccountToMultipleGroups() {
  log('\n📝 测试2: 账户加入多个分组', 'info')

  try {
    const [group1, group2, group3] = testData.groups
    const [account1, account2] = testData.accounts

    // 账户1加入分组1和分组2
    await accountGroupService.addAccountToGroup(account1.id, group1.id, 'claude')
    log(`✅ 账户1加入分组1: ${group1.name}`, 'success')

    await accountGroupService.addAccountToGroup(account1.id, group2.id, 'claude')
    log(`✅ 账户1加入分组2: ${group2.name}`, 'success')

    // 账户2加入分组2和分组3
    await accountGroupService.addAccountToGroup(account2.id, group2.id, 'claude')
    log(`✅ 账户2加入分组2: ${group2.name}`, 'success')

    await accountGroupService.addAccountToGroup(account2.id, group3.id, 'claude')
    log(`✅ 账户2加入分组3: ${group3.name}`, 'success')

    log(`✅ 多分组关系建立完成`, 'success')
  } catch (error) {
    log(`❌ 测试2失败: ${error.message}`, 'error')
    throw error
  }
}

// 测试3: 验证多分组关系
async function test3_verifyMultiGroupRelationships() {
  log('\n📝 测试3: 验证多分组关系', 'info')

  try {
    const [group1, group2, group3] = testData.groups
    const [account1, account2] = testData.accounts

    // 验证账户1的分组关系
    const account1Groups = await accountGroupService.getAccountGroup(account1.id)
    log(`📊 账户1所属分组数量: ${account1Groups.length}`, 'info')

    const account1GroupNames = account1Groups.map((g) => g.name).sort()
    const expectedAccount1Groups = [group1.name, group2.name].sort()

    if (JSON.stringify(account1GroupNames) === JSON.stringify(expectedAccount1Groups)) {
      log(`✅ 账户1分组关系正确: [${account1GroupNames.join(', ')}]`, 'success')
    } else {
      throw new Error(
        `账户1分组关系错误，期望: [${expectedAccount1Groups.join(', ')}], 实际: [${account1GroupNames.join(', ')}]`
      )
    }

    // 验证账户2的分组关系
    const account2Groups = await accountGroupService.getAccountGroup(account2.id)
    log(`📊 账户2所属分组数量: ${account2Groups.length}`, 'info')

    const account2GroupNames = account2Groups.map((g) => g.name).sort()
    const expectedAccount2Groups = [group2.name, group3.name].sort()

    if (JSON.stringify(account2GroupNames) === JSON.stringify(expectedAccount2Groups)) {
      log(`✅ 账户2分组关系正确: [${account2GroupNames.join(', ')}]`, 'success')
    } else {
      throw new Error(
        `账户2分组关系错误，期望: [${expectedAccount2Groups.join(', ')}], 实际: [${account2GroupNames.join(', ')}]`
      )
    }

    log(`✅ 多分组关系验证通过`, 'success')
  } catch (error) {
    log(`❌ 测试3失败: ${error.message}`, 'error')
    throw error
  }
}

// 测试4: 验证分组成员关系
async function test4_verifyGroupMemberships() {
  log('\n📝 测试4: 验证分组成员关系', 'info')

  try {
    const [group1, group2, group3] = testData.groups
    const [account1, account2] = testData.accounts

    // 验证分组1的成员
    const group1Members = await accountGroupService.getGroupMembers(group1.id)
    if (group1Members.includes(account1.id) && group1Members.length === 1) {
      log(`✅ 分组1成员正确: [${account1.name}]`, 'success')
    } else {
      throw new Error(`分组1成员错误，期望: [${account1.id}], 实际: [${group1Members.join(', ')}]`)
    }

    // 验证分组2的成员（应该包含两个账户）
    const group2Members = await accountGroupService.getGroupMembers(group2.id)
    const expectedGroup2Members = [account1.id, account2.id].sort()
    const actualGroup2Members = group2Members.sort()

    if (JSON.stringify(actualGroup2Members) === JSON.stringify(expectedGroup2Members)) {
      log(`✅ 分组2成员正确: [${account1.name}, ${account2.name}]`, 'success')
    } else {
      throw new Error(
        `分组2成员错误，期望: [${expectedGroup2Members.join(', ')}], 实际: [${actualGroup2Members.join(', ')}]`
      )
    }

    // 验证分组3的成员
    const group3Members = await accountGroupService.getGroupMembers(group3.id)
    if (group3Members.includes(account2.id) && group3Members.length === 1) {
      log(`✅ 分组3成员正确: [${account2.name}]`, 'success')
    } else {
      throw new Error(`分组3成员错误，期望: [${account2.id}], 实际: [${group3Members.join(', ')}]`)
    }

    log(`✅ 分组成员关系验证通过`, 'success')
  } catch (error) {
    log(`❌ 测试4失败: ${error.message}`, 'error')
    throw error
  }
}

// 测试5: 从部分分组中移除账户
async function test5_removeFromPartialGroups() {
  log('\n📝 测试5: 从部分分组中移除账户', 'info')

  try {
    const [group1, group2] = testData.groups
    const [account1] = testData.accounts

    // 将账户1从分组1中移除（但仍在分组2中）
    await accountGroupService.removeAccountFromGroup(account1.id, group1.id)
    log(`✅ 从分组1中移除账户1`, 'success')

    // 验证账户1现在只属于分组2
    const account1Groups = await accountGroupService.getAccountGroup(account1.id)
    if (account1Groups.length === 1 && account1Groups[0].id === group2.id) {
      log(`✅ 账户1现在只属于分组2: ${account1Groups[0].name}`, 'success')
    } else {
      const groupNames = account1Groups.map((g) => g.name)
      throw new Error(`账户1分组状态错误，期望只在分组2中，实际: [${groupNames.join(', ')}]`)
    }

    // 验证分组1现在为空
    const group1Members = await accountGroupService.getGroupMembers(group1.id)
    if (group1Members.length === 0) {
      log(`✅ 分组1现在为空`, 'success')
    } else {
      throw new Error(`分组1应该为空，但还有成员: [${group1Members.join(', ')}]`)
    }

    // 验证分组2仍有两个成员
    const group2Members = await accountGroupService.getGroupMembers(group2.id)
    if (group2Members.length === 2) {
      log(`✅ 分组2仍有两个成员`, 'success')
    } else {
      throw new Error(`分组2应该有2个成员，实际: ${group2Members.length}个`)
    }

    log(`✅ 部分移除测试通过`, 'success')
  } catch (error) {
    log(`❌ 测试5失败: ${error.message}`, 'error')
    throw error
  }
}

// 测试6: 账户完全移除时的分组清理
async function test6_accountDeletionGroupCleanup() {
  log('\n📝 测试6: 账户删除时的分组清理', 'info')

  try {
    const [, group2, group3] = testData.groups // 跳过第一个元素
    const [account1, account2] = testData.accounts

    // 记录删除前的状态
    const beforeGroup2Members = await accountGroupService.getGroupMembers(group2.id)
    const beforeGroup3Members = await accountGroupService.getGroupMembers(group3.id)

    log(`📊 删除前分组2成员数: ${beforeGroup2Members.length}`, 'info')
    log(`📊 删除前分组3成员数: ${beforeGroup3Members.length}`, 'info')

    // 删除账户2（这应该会触发从所有分组中移除的逻辑）
    await claudeAccountService.deleteAccount(account2.id)
    log(`✅ 删除账户2: ${account2.name}`, 'success')

    // 从测试数据中移除，避免cleanup时重复删除
    testData.accounts = testData.accounts.filter((acc) => acc.id !== account2.id)

    // 等待一下确保删除操作完成
    await sleep(500)

    // 验证分组2现在只有账户1
    const afterGroup2Members = await accountGroupService.getGroupMembers(group2.id)
    if (afterGroup2Members.length === 1 && afterGroup2Members[0] === account1.id) {
      log(`✅ 分组2现在只有账户1`, 'success')
    } else {
      throw new Error(`分组2成员状态错误，期望只有账户1，实际: [${afterGroup2Members.join(', ')}]`)
    }

    // 验证分组3现在为空
    const afterGroup3Members = await accountGroupService.getGroupMembers(group3.id)
    if (afterGroup3Members.length === 0) {
      log(`✅ 分组3现在为空`, 'success')
    } else {
      throw new Error(`分组3应该为空，但还有成员: [${afterGroup3Members.join(', ')}]`)
    }

    log(`✅ 账户删除的分组清理测试通过`, 'success')
  } catch (error) {
    log(`❌ 测试6失败: ${error.message}`, 'error')
    throw error
  }
}

// 主测试函数
async function runTests() {
  log('\n🚀 开始多分组功能测试\n', 'info')

  try {
    // 连接Redis
    await redis.connect()
    log('✅ Redis连接成功', 'success')

    // 执行测试
    await test1_createTestData()
    await test2_addAccountToMultipleGroups()
    await test3_verifyMultiGroupRelationships()
    await test4_verifyGroupMemberships()
    await test5_removeFromPartialGroups()
    await test6_accountDeletionGroupCleanup()

    log('\n🎉 所有测试通过！多分组功能工作正常', 'success')
  } catch (error) {
    log(`\n❌ 测试失败: ${error.message}`, 'error')
    console.error(error)
  } finally {
    // 清理测试数据
    if (CLEANUP_ON_FINISH) {
      await cleanup()
    } else {
      log('\n⚠️ 测试数据未清理，请手动清理', 'warning')
    }

    // 关闭Redis连接
    await redis.disconnect()
    process.exit(0)
  }
}

// 运行测试
runTests()
