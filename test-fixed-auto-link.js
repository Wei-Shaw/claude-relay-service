const jwt = require('jsonwebtoken');
const config = require('./config/config');
const fetch = require('node-fetch');

// 模拟创建一个包含displayName的JWT token
const userInfo = {
  type: 'ad_user',
  username: 'zhangji',
  displayName: '张佶',
  email: 'zhangji@weidian.com',
  groups: ['CN=Weidian-IT组,OU=Weidian Groups,OU=微店,DC=corp,DC=weidian-inc,DC=com'],
  loginTime: new Date().toISOString()
};

const token = jwt.sign(userInfo, config.security.jwtSecret, {
  expiresIn: '8h'
});

console.log('测试修正后的自动关联功能');
console.log('用户displayName: 张佶');

async function testFixedAutoLink() {
  try {
    console.log('\n=== 测试获取用户API Keys ===');
    
    const response = await fetch('http://localhost:3000/admin/ldap/user/api-keys', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    
    console.log('\n结果:', JSON.stringify(result, null, 2));
    
    if (result.success && result.apiKeys && result.apiKeys.length > 0) {
      console.log('\n✅ 成功！找到了关联的API Key:');
      result.apiKeys.forEach(key => {
        console.log(`- ID: ${key.id}`);
        console.log(`- Name: ${key.name}`);
        console.log(`- Key: ${key.key.substring(0, 10)}...${key.key.substring(key.key.length-10)}`);
        console.log(`- Limit: ${key.limit}`);
        console.log(`- Status: ${key.status}`);
      });
    } else {
      console.log('\n❌ 没有找到关联的API Key');
    }
    
  } catch (error) {
    console.error('测试错误:', error.message);
  }
}

testFixedAutoLink();