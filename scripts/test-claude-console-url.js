#!/usr/bin/env node

// 测试Claude Console账号URL处理

const testUrls = [
  'https://api.example.com',
  'https://api.example.com/',
  'https://api.example.com/v1/messages',
  'https://api.example.com/v1/messages/',
  'https://api.example.com:8080',
  'https://api.example.com:8080/v1/messages'
];

console.log('🧪 Testing Claude Console URL handling:\n');

testUrls.forEach(url => {
  // 模拟账号服务的URL处理逻辑
  const cleanUrl = url.replace(/\/$/, ''); // 移除末尾斜杠
  const apiEndpoint = cleanUrl.endsWith('/v1/messages') 
    ? cleanUrl 
    : `${cleanUrl}/v1/messages`;
  
  console.log(`Input:  ${url}`);
  console.log(`Output: ${apiEndpoint}`);
  console.log('---');
});

console.log('\n✅ URL normalization logic test completed');