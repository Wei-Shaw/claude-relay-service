/**
 * 初始化管理员账户 - Vercel 环境
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { kv } = require('@vercel/kv');

async function initAdmin() {
  try {
    console.log('🔄 Initializing admin account for Vercel...');
    
    // 生成随机管理员凭据
    const username = 'admin';
    const password = crypto.randomBytes(16).toString('hex');
    
    // 哈希密码
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // 存储管理员凭据
    const adminCredentials = {
      username: username,
      passwordHash: passwordHash,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      updatedAt: null
    };
    
    await kv.set('session:admin_credentials', JSON.stringify(adminCredentials));
    
    console.log('✅ Admin account initialized successfully!');
    console.log('');
    console.log('📋 Admin Credentials:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log('');
    console.log('⚠️  Please save these credentials securely!');
    console.log('   You can change the password after first login.');
    
  } catch (error) {
    console.error('❌ Failed to initialize admin account:', error);
    process.exit(1);
  }
}

// 运行初始化
initAdmin();