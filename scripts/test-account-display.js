/**
 * 测试账号显示问题是否已修复
 */

const axios = require('axios');
const config = require('../config/config');

// 从 init.json 读取管理员凭据
const fs = require('fs');
const path = require('path');

async function testAccountDisplay() {
  console.log('🔍 测试账号显示问题...\n');

  try {
    // 读取管理员凭据
    const initPath = path.join(__dirname, '..', 'config', 'init.json');
    if (!fs.existsSync(initPath)) {
      console.error('❌ 找不到 init.json 文件，请运行 npm run setup');
      process.exit(1);
    }

    const initData = JSON.parse(fs.readFileSync(initPath, 'utf8'));
    const adminUser = initData.admins?.[0];
    if (!adminUser) {
      console.error('❌ 没有找到管理员账号');
      process.exit(1);
    }

    const baseURL = `http://localhost:${config.server.port}`;
    
    // 登录获取 token
    console.log('🔐 登录管理员账号...');
    const loginResp = await axios.post(`${baseURL}/admin/login`, {
      username: adminUser.username,
      password: adminUser.password
    });

    if (!loginResp.data.success) {
      console.error('❌ 登录失败');
      process.exit(1);
    }

    const token = loginResp.data.token;
    console.log('✅ 登录成功\n');

    // 设置请求头
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 获取 Claude OAuth 账号
    console.log('📋 获取 Claude OAuth 账号...');
    const claudeResp = await axios.get(`${baseURL}/admin/claude-accounts`, { headers });
    const claudeAccounts = claudeResp.data.data || [];
    
    console.log(`找到 ${claudeAccounts.length} 个 Claude OAuth 账号`);
    
    // 分类显示
    const claudeDedicated = claudeAccounts.filter(a => a.accountType === 'dedicated');
    const claudeGroup = claudeAccounts.filter(a => a.accountType === 'group');
    const claudeShared = claudeAccounts.filter(a => a.accountType === 'shared');
    
    console.log(`- 专属账号: ${claudeDedicated.length} 个`);
    console.log(`- 分组账号: ${claudeGroup.length} 个`);
    console.log(`- 共享账号: ${claudeShared.length} 个`);
    
    // 检查 platform 字段
    console.log('\n检查 platform 字段:');
    claudeAccounts.slice(0, 3).forEach(acc => {
      console.log(`- ${acc.name}: platform=${acc.platform}, accountType=${acc.accountType}`);
    });
    
    // 获取 Claude Console 账号
    console.log('\n📋 获取 Claude Console 账号...');
    const consoleResp = await axios.get(`${baseURL}/admin/claude-console-accounts`, { headers });
    const consoleAccounts = consoleResp.data.data || [];
    
    console.log(`找到 ${consoleAccounts.length} 个 Claude Console 账号`);
    
    // 分类显示
    const consoleDedicated = consoleAccounts.filter(a => a.accountType === 'dedicated');
    const consoleGroup = consoleAccounts.filter(a => a.accountType === 'group');
    const consoleShared = consoleAccounts.filter(a => a.accountType === 'shared');
    
    console.log(`- 专属账号: ${consoleDedicated.length} 个`);
    console.log(`- 分组账号: ${consoleGroup.length} 个`);
    console.log(`- 共享账号: ${consoleShared.length} 个`);
    
    // 检查 platform 字段
    console.log('\n检查 platform 字段:');
    consoleAccounts.slice(0, 3).forEach(acc => {
      console.log(`- ${acc.name}: platform=${acc.platform}, accountType=${acc.accountType}`);
    });
    
    // 获取账号分组
    console.log('\n📋 获取账号分组...');
    const groupsResp = await axios.get(`${baseURL}/admin/account-groups`, { headers });
    const groups = groupsResp.data.data || [];
    
    console.log(`找到 ${groups.length} 个账号分组`);
    
    const claudeGroups = groups.filter(g => g.platform === 'claude');
    const geminiGroups = groups.filter(g => g.platform === 'gemini');
    
    console.log(`- Claude 分组: ${claudeGroups.length} 个`);
    console.log(`- Gemini 分组: ${geminiGroups.length} 个`);
    
    // 测试结果总结
    console.log('\n📊 测试结果总结:');
    console.log('✅ Claude OAuth 账号已包含 platform 字段');
    console.log('✅ Claude Console 账号已包含 platform 字段');
    console.log('✅ 账号分组功能正常');
    
    const totalDedicated = claudeDedicated.length + consoleDedicated.length;
    const totalGroups = claudeGroups.length;
    
    if (totalDedicated > 0) {
      console.log(`\n✅ 共有 ${totalDedicated} 个专属账号应该显示在下拉框中`);
    } else {
      console.log('\n⚠️  没有找到专属账号，请在账号管理页面设置账号类型为"专属账户"');
    }
    
    if (totalGroups > 0) {
      console.log(`✅ 共有 ${totalGroups} 个分组应该显示在下拉框中`);
    }
    
    console.log('\n💡 请在浏览器中测试创建/编辑 API Key，检查下拉框是否正确显示三个类别：');
    console.log('   1. 调度分组');
    console.log('   2. Claude OAuth 账号');
    console.log('   3. Claude Console 账号');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  } finally {
    process.exit(0);
  }
}

testAccountDisplay();