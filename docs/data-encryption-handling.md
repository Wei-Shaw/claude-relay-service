# 数据导入/导出加密处理指南

## 概述

Claude Relay Service 使用 AES-256-CBC 加密算法来保护敏感数据。本文档详细说明了数据导入/导出工具如何处理加密和未加密的数据。

## 加密机制

### 加密的数据类型

1. **Claude 账户**
   - email
   - password
   - accessToken
   - refreshToken
   - claudeAiOauth (OAuth 数据)
   - 使用 salt: `'salt'`

2. **Gemini 账户**
   - geminiOauth (OAuth 数据)
   - accessToken
   - refreshToken
   - 使用 salt: `'gemini-account-salt'`

### 加密格式

加密后的数据格式：`{iv}:{encryptedData}`
- `iv`: 16字节的初始化向量（hex格式）
- `encryptedData`: 加密后的数据（hex格式）

## 导出功能

### 1. 解密导出（默认）
```bash
npm run data:export:enhanced
# 或
node scripts/data-transfer-enhanced.js export --decrypt=true
```

- **用途**：数据迁移到其他环境
- **特点**：
  - `metadata.decrypted = true`
  - 敏感数据以明文形式导出
  - 便于在不同加密密钥的环境间迁移

### 2. 加密导出
```bash
npm run data:export:encrypted
# 或
node scripts/data-transfer-enhanced.js export --decrypt=false
```

- **用途**：备份或在相同加密密钥的环境间传输
- **特点**：
  - `metadata.decrypted = false`
  - 保持数据的加密状态
  - 必须在相同的 ENCRYPTION_KEY 环境下才能使用

### 3. 脱敏导出
```bash
node scripts/data-transfer-enhanced.js export --sanitize
```

- **用途**：分享数据结构或调试
- **特点**：
  - `metadata.sanitized = true`
  - 敏感字段被替换为 `[REDACTED]`
  - 不能用于实际导入

## 导入功能

### 自动加密处理逻辑

```javascript
if (importData.metadata.decrypted && !importData.metadata.sanitized) {
  // 数据已解密且不是脱敏的，需要重新加密
  // 自动加密所有敏感字段
} else {
  // 数据已加密或是脱敏的，保持原样
}
```

### 导入场景

#### 场景 1：导入解密的数据
- **输入**：`metadata.decrypted = true`
- **处理**：自动加密所有敏感字段
- **结果**：数据以加密形式存储在 Redis

#### 场景 2：导入加密的数据
- **输入**：`metadata.decrypted = false`
- **处理**：直接存储，不做加密处理
- **结果**：保持原有加密状态
- **注意**：必须使用相同的 ENCRYPTION_KEY

#### 场景 3：导入脱敏的数据
- **输入**：`metadata.sanitized = true`
- **处理**：警告并询问是否继续
- **结果**：导入但缺少敏感数据，账户可能无法正常工作

## 使用示例

### 1. 跨环境迁移
```bash
# 在生产环境导出（解密）
npm run data:export:enhanced -- --output=prod-data.json

# 在测试环境导入（自动加密）
npm run data:import:enhanced -- --input=prod-data.json
```

### 2. 同环境备份恢复
```bash
# 备份（保持加密）
npm run data:export:encrypted -- --output=backup.json

# 恢复（保持加密）
npm run data:import:enhanced -- --input=backup.json
```

### 3. 选择性导入
```bash
# 跳过已存在的数据
npm run data:import:enhanced -- --input=data.json --skip-conflicts

# 强制覆盖所有数据
npm run data:import:enhanced -- --input=data.json --force
```

## 安全建议

1. **加密密钥管理**
   - 使用强随机密钥（至少32字符）
   - 不同环境使用不同的密钥
   - 定期轮换密钥

2. **导出文件保护**
   - 解密的导出文件包含明文敏感数据
   - 应立即加密存储或传输
   - 使用后及时删除

3. **权限控制**
   - 限制导出/导入工具的访问权限
   - 审计所有数据导出操作
   - 使用脱敏导出进行非生产用途

## 故障排除

### 常见问题

1. **导入后账户无法使用**
   - 检查 ENCRYPTION_KEY 是否正确
   - 确认不是导入了脱敏数据
   - 验证加密字段格式是否正确

2. **加密/解密失败**
   - 确保 ENCRYPTION_KEY 长度为32字符
   - 检查加密数据格式 `{iv}:{data}`
   - 查看日志中的解密警告

3. **数据不完整**
   - 检查导出时是否使用了 --types 限制
   - 确认 Redis 连接正常
   - 验证账户前缀（claude:account: vs claude_account:）

## 测试工具

运行测试脚本验证加密处理：
```bash
node scripts/test-import-encryption.js
```

该脚本会：
1. 创建测试导出文件（加密和解密版本）
2. 显示加密前后的数据对比
3. 提供测试导入命令
4. 验证加密/解密功能