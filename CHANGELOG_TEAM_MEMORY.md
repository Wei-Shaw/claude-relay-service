# 变更日志 - 团队 Memory 功能

## [1.1.0] - 2025-10-20

### 新增功能 ✨

#### URL 加载和自动刷新支持

为团队 Memory 功能增加从远程 URL 加载和定期自动刷新机制，特别适合 K8S/云环境部署。

**核心特性**：
- ✅ 支持从远程 URL 拉取团队 Memory 内容
- ✅ 可配置自动刷新间隔（支持浮点数分钟）
- ✅ 智能加载优先级（直接配置 > URL > 本地文件）
- ✅ 错误处理：网络失败时保留旧缓存
- ✅ 10秒请求超时保护
- ✅ 完整的状态监控和调试接口

**新增环境变量**：

```bash
# 团队 Memory URL（可选，优先级第二）
CLAUDE_TEAM_MEMORY_URL=https://example.com/team-memory.md

# 刷新间隔（分钟），0 表示禁用，支持小数
CLAUDE_TEAM_MEMORY_REFRESH_INTERVAL=60
```

**加载优先级**（从高到低）：
1. `CLAUDE_TEAM_MEMORY_CONTENT` - 直接配置（最高优先级，不刷新）
2. `CLAUDE_TEAM_MEMORY_URL` - URL 拉取（支持自动刷新）
3. 本地文件 - 文件系统（支持热更新）

### 文件变更 📁

#### 修改的文件
- `src/services/claudeMemoryService.js` - 实现 URL 加载和自动刷新
- `config/config.js` - 新增 url 和 refreshInterval 配置
- `config/config.example.js` - 新增 url 和 refreshInterval 配置
- `.env.example` - 更新环境变量说明

#### 新增的文件
- `docs/TEAM_MEMORY_URL_USAGE.md` - URL 加载和自动刷新使用指南
- `scripts/test-team-memory-url.js` - URL 功能测试脚本

### 测试结果 ✅

```bash
✅ Test 1: Initial URL loading - 通过
✅ Test 2: Manual refresh - 通过
✅ Test 3: Auto-refresh mechanism - 通过
✅ Test 4: Priority testing (content > url > file) - 通过
✅ Test 5: Error handling (invalid URL) - 通过
```

### 使用示例 📝

#### K8S 环境（ConfigMap + Service）

```bash
CLAUDE_TEAM_MEMORY_ENABLED=true
CLAUDE_TEAM_MEMORY_URL=http://team-memory-service/team-memory.md
CLAUDE_TEAM_MEMORY_REFRESH_INTERVAL=60  # 每小时刷新
```

#### 从 CDN/对象存储加载

```bash
CLAUDE_TEAM_MEMORY_ENABLED=true
CLAUDE_TEAM_MEMORY_URL=https://your-cdn.com/team-memory.md
CLAUDE_TEAM_MEMORY_REFRESH_INTERVAL=1440  # 每天刷新
```

#### 本地文件 + 热更新

```bash
CLAUDE_TEAM_MEMORY_ENABLED=true
# 不设置 URL，使用本地文件
CLAUDE_TEAM_MEMORY_REFRESH_INTERVAL=1  # 每分钟检查更新
```

### API 变更 🔧

**新增方法**：

```javascript
// 从 URL 加载
await claudeMemoryService.loadTeamMemoryFromUrl()

// 手动刷新
await claudeMemoryService.refreshMemory()

// 启动/停止自动刷新
claudeMemoryService.startAutoRefresh()
claudeMemoryService.stopAutoRefresh()

// 获取状态
const status = claudeMemoryService.getStatus()
// {
//   enabled: true,
//   source: 'url',  // 'content' | 'url' | 'file'
//   lastLoadedTime: Date,
//   cacheSize: number,
//   autoRefreshEnabled: boolean,
//   config: {...}
// }
```

### 向后兼容 🔄

✅ 完全向后兼容
✅ 不设置 URL 时行为与之前完全一致
✅ 默认刷新间隔为 0（禁用）
✅ 现有配置无需修改

### 性能影响 ⚡

- **启动延迟**：首次加载 URL < 10s（异步，不阻塞启动）
- **内存影响**：仅缓存一份内容（忽略不计）
- **网络流量**：按刷新间隔定期请求（推荐 60+ 分钟）
- **CPU 影响**：定时器和 HTTP 请求开销极小

### 注意事项 ⚠️

1. **刷新间隔**：推荐 60-1440 分钟，不建议过短
2. **网络稳定性**：失败时保留旧缓存，不影响服务
3. **HTTPS**：生产环境建议使用 HTTPS URL
4. **内容大小**：建议控制在 2000-5000 tokens
5. **K8S 环境**：使用内部 Service 无需公网访问

### 后续规划 🚀

#### 阶段 2：API Key 级别配置（计划中）
- [ ] 在 API Key 中添加 `teamMemoryUrl` 字段
- [ ] 支持不同项目/团队使用不同的 Memory URL
- [ ] Web 界面支持配置和预览
- [ ] 支持多个 URL 加载和合并

#### 阶段 3：高级功能（计划中）
- [ ] 支持 HTTP 认证（Basic Auth / Bearer Token）
- [ ] 支持 URL 模板变量（如 ${apiKeyId}）
- [ ] 支持从数据库动态加载
- [ ] 支持条件注入和内容过滤

---

## [1.0.0] - 2025-01-20

### 新增功能 ✨

#### 团队 Memory 统一注入（阶段 1）

为所有通过中转服务的 Claude Code 请求自动注入团队级别的开发规范和最佳实践。

**核心特性**：
- ✅ 全局团队 Memory 配置
- ✅ 支持从环境变量、配置文件、外部文件读取
- ✅ 智能注入位置（Claude Code prompt 之后，用户 prompt 之前）
- ✅ cache_control 支持（降低 API 成本）
- ✅ 可配置是否仅对真实 Claude Code 请求注入
- ✅ 完整的错误处理和日志记录

**配置方式**：
1. 环境变量配置（适合短内容）
2. 配置文件配置（适合中等内容）
3. 外部文件配置（推荐，适合长内容）

**文件读取优先级**：
1. `.local/team-memory.md`
2. `.local/TEAM_CLAUDE.md`
3. `data/team-memory.md`

### 文件变更 📁

#### 修改的文件
- `config/config.example.js` - 添加 teamMemory 配置对象
- `src/services/claudeRelayService.js` - 实现注入逻辑
- `.env.example` - 添加环境变量示例

#### 新增的文件
- `docs/design/team-memory-injection.md` - 完整设计文档（13000+ 字）
- `docs/design/team-memory-implementation-summary.md` - 实施总结
- `docs/TEAM_MEMORY_QUICK_START.md` - 快速启用指南
- `.local/team-memory.example.md` - 团队规范示例模板
- `scripts/test-team-memory.js` - 功能测试脚本
- `CHANGELOG_TEAM_MEMORY.md` - 本变更日志

### 环境变量 🔧

新增环境变量：

```bash
# 启用团队 Memory（默认 false）
CLAUDE_TEAM_MEMORY_ENABLED=true

# 直接配置内容（可选）
CLAUDE_TEAM_MEMORY_CONTENT=""

# 启用缓存控制（默认 true）
CLAUDE_TEAM_MEMORY_USE_CACHE=true

# 仅对真实 Claude Code 请求注入（默认 true）
CLAUDE_TEAM_MEMORY_ONLY_REAL_CC=true
```

### 使用示例 📝

#### 快速启用

```bash
# 1. 创建团队 Memory 文件
cp .local/team-memory.example.md .local/team-memory.md
nano .local/team-memory.md

# 2. 启用功能
echo "CLAUDE_TEAM_MEMORY_ENABLED=true" >> .env

# 3. 重启服务
npm run service:stop
npm run service:start:daemon

# 4. 验证
tail -f logs/claude-relay-*.log | grep "team memory"
```

#### 配置示例

**方式 1：从文件读取（推荐）**
```bash
# .local/team-memory.md
# AI Agent 团队工作指南

## 代码规范
- 使用 TypeScript
- 遵循 ESLint 规则

## 架构约定
- 组件使用 PascalCase
```

**方式 2：从环境变量配置**
```bash
CLAUDE_TEAM_MEMORY_CONTENT="# 团队规范\n\n- 使用 TypeScript"
```

**方式 3：从配置文件配置**
```javascript
// config/config.js
claude: {
  teamMemory: {
    enabled: true,
    content: `# 团队开发规范...`
  }
}
```

### 注入效果 🎯

最终发送到 Anthropic API 的请求结构：

```json
{
  "model": "claude-sonnet-4-20250514",
  "system": [
    {
      "type": "text",
      "text": "You are Claude Code, Anthropic's official CLI for Claude.",
      "cache_control": { "type": "ephemeral" }
    },
    {
      "type": "text",
      "text": "# AI Agent 团队工作指南\n\n（团队规范内容）",
      "cache_control": { "type": "ephemeral" }
    },
    {
      "type": "text",
      "text": "（用户项目的 CLAUDE.md 内容）"
    }
  ],
  "messages": [...]
}
```

### 测试结果 ✅

#### 语法检查
```
✅ config.example.js 语法正确
✅ claudeRelayService.js 语法正确
```

#### 功能测试
```
✅ 禁用状态测试通过
✅ 启用状态测试通过
✅ 文件读取测试通过
✅ 注入位置正确
✅ cache_control 正确添加
```

#### 代码格式化
```
✅ 所有文件格式正确
```

### 性能影响 ⚡

- **内存影响**: 忽略不计（仅首次读取文件）
- **延迟影响**: <1ms（仅文件读取和插入操作）
- **成本影响**: 使用 cache_control 后，缓存命中时成本几乎为 0

### 注意事项 ⚠️

1. **Context Window**: 团队 Memory 会占用 context window，建议控制在 2000-5000 tokens
2. **Cache 限制**: Claude API 最多允许 4 个 cache_control 块，超限会自动处理
3. **安全性**: 团队 Memory 对所有使用该服务的人可见，不要包含敏感信息
4. **优先级**: 用户的 CLAUDE.md 可以覆盖团队 Memory

### 向后兼容 🔄

✅ 完全向后兼容，对现有功能无影响
✅ 默认禁用，需要显式启用
✅ 可随时通过环境变量禁用

### 回滚方案 ↩️

如需回滚：

```bash
# 方式 1：禁用功能（推荐）
echo "CLAUDE_TEAM_MEMORY_ENABLED=false" >> .env
npm run service:stop && npm run service:start:daemon

# 方式 2：完全回滚代码
git checkout config/config.example.js
git checkout src/services/claudeRelayService.js
git checkout .env.example
npm run service:stop && npm run service:start:daemon
```

### 后续规划 🚀

#### 阶段 2：API Key 级别配置（计划中）
- [ ] 在 API Key 中添加 `claudeCodeMemory` 字段
- [ ] 支持不同项目/团队使用不同的 Memory
- [ ] Web 界面支持配置和预览

#### 阶段 3：高级插件支持（计划中）
- [ ] 传递 `apiKeyData` 到 runtimeAddon 插件
- [ ] 支持从数据库/外部 API 动态加载
- [ ] 支持条件注入和模板变量替换

### 文档资源 📚

- **设计文档**: `docs/design/team-memory-injection.md`
- **实施总结**: `docs/design/team-memory-implementation-summary.md`
- **快速启动**: `docs/TEAM_MEMORY_QUICK_START.md`
- **示例文件**: `.local/team-memory.example.md`
- **测试脚本**: `scripts/test-team-memory.js`

### 贡献者 👥

- AI Agent - 设计与实施

---

## 版本说明

**v1.0.0** - 初始版本，实现阶段 1（全局配置方案）

下次版本计划：v2.0.0（阶段 2 - API Key 级别配置）
