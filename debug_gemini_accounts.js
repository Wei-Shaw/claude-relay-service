const redis = require('./src/models/redis');
const geminiAccountService = require('./src/services/geminiAccountService');

async function debugGeminiAccounts() {
  try {
    await redis.connect();
    
    console.log('🔍 检查 Gemini 账户配置...\n');
    
    // 获取所有 Gemini 账户
    const accounts = await geminiAccountService.getAllAccounts();
    console.log(`找到 ${accounts.length} 个 Gemini 账户:`);
    
    accounts.forEach((account, index) => {
      console.log(`\n账户 ${index + 1}:`);
      console.log(`  ID: ${account.id}`);
      console.log(`  名称: ${account.name}`);
      console.log(`  描述: ${account.description || '无'}`);
      console.log(`  用户邮箱: ${account.userEmail || '无'}`);
      console.log(`  用户 Project ID: ${account.userProjectId || '❌ 缺失'}`);
      console.log(`  账户类型: ${account.accountType || 'shared'}`);
      console.log(`  状态: ${account.status || 'unknown'}`);
      console.log(`  是否激活: ${account.isActive}`);
      console.log(`  是否有 OAuth 令牌: ${account.geminiOauth ? '✅' : '❌'}`);
      console.log(`  是否有 Access Token: ${account.accessToken ? '✅' : '❌'}`);
      console.log(`  是否有 Refresh Token: ${account.refreshToken ? '✅' : '❌'}`);
      console.log(`  过期时间: ${account.expiresAt || '无'}`);
      console.log(`  代理配置: ${account.proxy ? '✅' : '无'}`);
      console.log(`  创建时间: ${account.createdAt || '无'}`);
      console.log(`  最后使用: ${account.lastUsedAt || '从未使用'}`);
      
      // 检查项目 ID 缺失的问题
      if (!account.userProjectId) {
        console.log(`  ⚠️ 这个账户缺少 Project ID，需要补充配置`);
      }
    });
    
    if (accounts.length === 0) {
      console.log('  没有找到任何 Gemini 账户');
    }
    
    // 检查 Redis 键的结构
    console.log('\n🔍 检查 Redis 键结构...');
    const client = redis.getClientSafe();
    const keys = await client.keys('gemini_account:*');
    console.log(`找到 ${keys.length} 个 Gemini 账户键:`);
    
    for (const key of keys.slice(0, 3)) { // 只显示前3个
      console.log(`\n键: ${key}`);
      const data = await client.hgetall(key);
      const fields = Object.keys(data);
      console.log(`  字段数: ${fields.length}`);
      console.log(`  字段列表: ${fields.join(', ')}`);
      
      // 特别检查 projectId 相关字段
      const projectFields = fields.filter(f => f.toLowerCase().includes('project'));
      if (projectFields.length > 0) {
        console.log(`  Project 相关字段: ${projectFields.join(', ')}`);
        projectFields.forEach(field => {
          console.log(`    ${field}: ${data[field] || '空'}`);
        });
      } else {
        console.log(`  ❌ 没有找到 Project 相关字段`);
      }
    }
    
  } catch (error) {
    console.error('❌ 调试过程中发生错误:', error);
  } finally {
    await redis.disconnect();
  }
}

debugGeminiAccounts();