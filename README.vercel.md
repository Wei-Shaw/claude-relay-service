# Claude Relay Service - Vercel 部署版本

这是 Claude Relay Service 的 Vercel 无服务器版本，保留了核心代理功能。

## 🎯 功能特性

### 核心功能（100% 保留）
- ✅ Claude API 代理转发
- ✅ 流式响应支持
- ✅ OAuth 认证管理
- ✅ API Key 管理
- ✅ 使用统计记录
- ✅ 代理配置支持
- ✅ 智能账户选择
- ✅ Sticky Session 支持

### 架构优化
- 🚀 **无服务器架构**：自动扩展，按需付费
- 🌍 **全球分布**：Vercel 边缘网络，低延迟
- 📊 **Vercel KV**：高性能 Redis 兼容数据库
- 🔒 **安全优化**：环境变量加密，JWT 认证

## 🚀 快速部署

### 1. 准备工作

```bash
# 克隆项目
git clone <your-repo-url>
cd claude-relay-service

# 切换到 vercel 分支
git checkout vercel-deployment

# 安装依赖
npm install
```

### 2. 设置环境变量

复制环境变量示例：
```bash
cp .env.vercel.example .env.local
```

必须配置的环境变量：
```env
# 安全密钥
JWT_SECRET=your-secure-jwt-secret-key-here
ENCRYPTION_KEY=your-32-character-encryption-key

# Claude OAuth 配置
CLAUDE_OAUTH_CLIENT_ID=9d1c250a-e61b-44d9-88ed-5944d1962f5e
CLAUDE_OAUTH_CLIENT_SECRET=your-claude-oauth-client-secret

# Vercel KV 数据库（部署后自动生成）
KV_URL=your-vercel-kv-url
KV_REST_API_URL=your-vercel-kv-rest-api-url
KV_REST_API_TOKEN=your-vercel-kv-rest-api-token
```

### 3. 部署到 Vercel

#### 方法一：Vercel CLI（推荐）
```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录 Vercel
vercel login

# 部署
vercel --prod
```

#### 方法二：GitHub 集成
1. 将代码推送到 GitHub
2. 在 Vercel 控制台导入项目
3. 设置环境变量
4. 部署

### 4. 设置 Vercel KV

1. 在 Vercel 控制台进入项目
2. 前往 "Storage" 选项卡
3. 创建 KV 数据库
4. 复制环境变量到项目设置

### 5. 初始化管理员

部署完成后，需要初始化管理员账户：
```bash
# 使用 Vercel CLI 在部署环境中运行
vercel env pull .env.local
node scripts/init-admin.js
```

## 📋 API 端点

### 核心代理端点
- `POST /api/v1/messages` - Claude API 代理（支持流式）

### OAuth 认证
- `POST /api/oauth/generate-auth-url` - 生成授权 URL
- `POST /api/oauth/exchange-code` - 交换授权码
- `GET /api/oauth/callback` - OAuth 回调

### 管理 API
- `POST /api/admin/login` - 管理员登录
- `GET /api/admin/api-keys` - 获取 API Keys
- `POST /api/admin/api-keys` - 创建 API Key
- `PUT /api/admin/api-keys?keyId=xxx` - 更新 API Key
- `DELETE /api/admin/api-keys?keyId=xxx` - 删除 API Key
- `GET /api/admin/claude-accounts` - 获取 Claude 账户
- `POST /api/admin/claude-accounts` - 创建 Claude 账户

## 🔧 配置说明

### 环境变量详解

```env
# 必需配置
JWT_SECRET=至少32字符的随机字符串
ENCRYPTION_KEY=精确32字符的加密密钥

# Claude API 配置
CLAUDE_API_URL=https://api.anthropic.com/v1/messages
CLAUDE_API_VERSION=2023-06-01
CLAUDE_BETA_HEADER=claude-code-20250219,oauth-2025-04-20

# 可选配置
DEFAULT_TOKEN_LIMIT=1000000
DEFAULT_PROXY_TIMEOUT=30000
API_KEY_PREFIX=cr_
```

### Vercel 项目设置

在 `vercel.json` 中已预配置：
- Node.js 运行时
- 30秒超时限制
- 自动路由配置

## 🧪 使用示例

### 1. 创建 API Key

```bash
curl -X POST https://your-domain.vercel.app/api/admin/api-keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My API Key",
    "description": "Test key",
    "tokenLimit": 100000
  }'
```

### 2. 使用代理服务

```bash
curl -X POST https://your-domain.vercel.app/api/v1/messages \
  -H "Authorization: Bearer cr_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1000,
    "messages": [
      {"role": "user", "content": "Hello, Claude!"}
    ]
  }'
```

### 3. 流式请求

```bash
curl -X POST https://your-domain.vercel.app/api/v1/messages \
  -H "Authorization: Bearer cr_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1000,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Tell me a story"}
    ]
  }'
```

## 🔍 故障排除

### 常见问题

1. **KV 数据库连接失败**
   - 检查 KV 环境变量是否正确配置
   - 确认 KV 数据库已在 Vercel 控制台创建

2. **OAuth 认证失败**
   - 检查 OAuth 客户端密钥配置
   - 确认回调 URL 设置正确

3. **API Key 验证失败**
   - 确认 API Key 格式正确（cr_ 前缀）
   - 检查 Key 是否已激活且未过期

4. **管理员登录失败**
   - 运行管理员初始化脚本
   - 检查 JWT 密钥配置

### 日志查看

```bash
# 查看 Vercel 函数日志
vercel logs

# 实时日志
vercel logs --follow
```

## 🚀 性能优化

### 冷启动优化
- 使用轻量级依赖
- 优化模块导入
- 利用 Vercel 预热机制

### 数据库优化
- 使用 Vercel KV 连接池
- 批量操作优化
- 适当的缓存策略

## 📊 监控和分析

### Vercel 内置监控
- 函数调用次数
- 响应时间
- 错误率
- 带宽使用

### 自定义监控
```javascript
// 在函数中添加监控
logger.info('API call', {
  endpoint: '/api/v1/messages',
  duration: Date.now() - startTime,
  usage: tokenUsage
});
```

## 🔄 升级和维护

### 版本更新
```bash
# 拉取最新代码
git pull origin vercel-deployment

# 部署更新
vercel --prod
```

### 数据库维护
- Vercel KV 自动管理过期数据
- 定期检查使用统计
- 监控存储使用量

## 📞 支持

如遇问题，请：
1. 检查 Vercel 函数日志
2. 确认环境变量配置
3. 查看本文档的故障排除部分
4. 提交 GitHub Issue