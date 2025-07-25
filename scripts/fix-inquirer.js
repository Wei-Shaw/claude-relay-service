#!/usr/bin/env node

/**
 * 修复 inquirer ESM 问题
 * 降级到支持 CommonJS 的版本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 修复 inquirer ESM 兼容性问题...\n');

try {
  // 卸载当前版本
  console.log('📦 卸载当前 inquirer 版本...');
  execSync('npm uninstall inquirer', { stdio: 'inherit' });
  
  // 安装兼容 CommonJS 的版本 (8.x 是最后支持 CommonJS 的主要版本)
  console.log('\n📦 安装兼容版本 inquirer@8.2.6...');
  execSync('npm install inquirer@8.2.6', { stdio: 'inherit' });
  
  console.log('\n✅ 修复完成！');
  console.log('\n现在可以正常使用 CLI 工具了：');
  console.log('  npm run cli admin');
  console.log('  npm run cli keys');
  console.log('  npm run cli status');
  
} catch (error) {
  console.error('❌ 修复失败:', error.message);
  process.exit(1);
}