# 变更日志 - 团队 Memory 功能

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
