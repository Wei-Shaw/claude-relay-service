# 升级指南 - API Key 有效期功能

本指南说明如何从旧版本安全升级到支持 API Key 有效期限制的新版本。

## 升级前准备

### 1. 备份现有数据

在升级前，强烈建议备份您的生产数据：

```bash
# 导出所有数据（包含敏感信息）
npm run data:export -- --output=prod-backup-$(date +%Y%m%d).json

# 或导出脱敏数据（用于测试环境）
npm run data:export:sanitized -- --output=prod-backup-sanitized-$(date +%Y%m%d).json
```

### 2. 确认备份完整性

检查导出的文件，确保包含所有必要的数据：

```bash
# 查看备份文件信息
cat prod-backup-*.json | jq '.metadata'

# 查看数据统计
cat prod-backup-*.json | jq '.data | keys'
```

## 升级步骤

### 1. 停止服务

```bash
# 停止 Claude Relay Service
npm run service:stop

# 或如果使用 Docker
docker-compose down
```

### 2. 更新代码

```bash
# 拉取最新代码
git pull origin main

# 安装依赖
npm install

# 更新 Web 界面依赖
npm run install:web
```

### 3. 运行数据迁移

为现有的 API Key 设置默认 30 天有效期：

```bash
# 先进行模拟运行，查看将要修改的数据
npm run migrate:apikey-expiry:dry

# 确认无误后，执行实际迁移
npm run migrate:apikey-expiry
```

如果您想设置不同的默认有效期：

```bash
# 设置 90 天有效期
npm run migrate:apikey-expiry -- --days=90
```

### 4. 启动服务

```bash
# 启动服务
npm run service:start:daemon

# 或使用 Docker
docker-compose up -d
```

### 5. 验证升级

1. 登录 Web 管理界面
2. 检查 API Key 列表，确认显示过期时间列
3. 测试创建新的 API Key，确认可以设置过期时间
4. 测试续期功能是否正常工作

## 从生产环境导入数据（用于测试）

如果您需要在测试环境中使用生产数据：

### 1. 在生产环境导出数据

```bash
# 导出脱敏数据（推荐用于测试）
npm run data:export:sanitized -- --output=prod-export.json

# 或只导出特定类型的数据
npm run data:export -- --types=apikeys,accounts --sanitize --output=prod-partial.json
```

### 2. 传输文件到测试环境

使用安全的方式传输文件，如 SCP：

```bash
scp prod-export.json user@test-server:/path/to/claude-relay-service/
```

### 3. 在测试环境导入数据

```bash
# 导入数据，遇到冲突时询问
npm run data:import -- --input=prod-export.json

# 或跳过所有冲突
npm run data:import -- --input=prod-export.json --skip-conflicts

# 或强制覆盖所有数据（谨慎使用）
npm run data:import -- --input=prod-export.json --force
```

## 回滚方案

如果升级后遇到问题，可以按以下步骤回滚：

### 1. 停止服务

```bash
npm run service:stop
```

### 2. 恢复代码

```bash
# 切换到之前的版本
git checkout <previous-version-tag>

# 重新安装依赖
npm install
```

### 3. 恢复数据（如需要）

```bash
# 从备份恢复数据
npm run data:import -- --input=prod-backup-<date>.json --force
```

### 4. 重启服务

```bash
npm run service:start:daemon
```

## 注意事项

1. **数据迁移是幂等的**：迁移脚本可以安全地多次运行，已有过期时间的 API Key 不会被修改。

2. **过期的 API Key 处理**：
   - 过期的 API Key 会被自动禁用，而不是删除
   - 管理员可以通过续期功能重新激活过期的 Key

3. **定时任务**：
   - 系统会每小时自动检查并禁用过期的 API Key
   - 该任务在 `config.system.cleanupInterval` 中配置

4. **API 兼容性**：
   - 新增的过期时间功能完全向后兼容
   - 现有的 API 调用不会受到影响

## 常见问题

### Q: 如果不想某些 API Key 过期怎么办？

A: 您可以通过 Web 界面将特定 API Key 设置为"永不过期"，或在续期时选择"设为永不过期"。

### Q: 迁移脚本会影响已经设置了过期时间的 API Key 吗？

A: 不会。迁移脚本只会处理没有设置过期时间的 API Key。

### Q: 如何批量修改 API Key 的过期时间？

A: 您可以修改迁移脚本，或使用数据导出/导入工具批量处理。

### Q: 导出的脱敏数据可以用于生产环境吗？

A: 不建议。脱敏数据缺少关键的认证信息（如 OAuth tokens），仅适用于测试环境。

## 技术支持

如遇到问题，请检查：

1. 服务日志：`npm run service:logs`
2. Redis 连接：确保 Redis 服务正常运行
3. 配置文件：检查 `.env` 和 `config/config.js`

如需进一步帮助，请提供：
- 错误日志
- 使用的命令
- 系统环境信息