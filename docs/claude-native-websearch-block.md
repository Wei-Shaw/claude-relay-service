# Claude Native Web Tool 禁用方案

## 目标

在 CRS 中间层禁用 Anthropic 原生的 `web_search` 和 `web_fetch` 工具，防止通过中转服务发起联网请求。

## 环境变量

```bash
DISABLE_WEB_TOOLS=true   # 启用禁用策略（默认不启用）
```

## 作用范围

**只影响 Claude 原生 Anthropic Messages API 入口：**

| 端点 | 文件 | 是否生效 |
|------|------|----------|
| `POST /api/v1/messages` | `src/routes/api.js` | ✅ |
| `POST /claude/v1/messages` | `src/routes/api.js` | ✅ |
| `POST /api/v1/messages/count_tokens` | `src/routes/api.js` | ✅ |
| `/antigravity/api/*` | Gemini 分流前已返回 | ❌ 不涉及 |
| `/gemini-cli/api/*` | Gemini 分流前已返回 | ❌ 不涉及 |
| `/openai/*` | `openaiRoutes.js` 等 | ❌ 不涉及 |

**不改动的文件：**
- `src/middleware/auth.js`
- `src/routes/openaiClaudeRoutes.js`
- `src/routes/unified.js`
- `src/services/relay/claudeRelayService.js`
- `src/services/relay/claudeConsoleRelayService.js`

## 行为说明

### 请求侧拦截（不是整单拒绝）

1. **从 `tools` 数组中移除 web_search / web_fetch 的 tool 定义**
   - 通过 `type` 前缀匹配识别 server tool（如 `web_search_20250305`）
   - 兼容 `name` 字段和 `function.name` 格式
   - 不误伤 `type: "custom"` 的用户自定义同名工具
   - 若移除后 `tools` 为空数组，删除整个 `tools` 字段

2. **删除指向 web 工具的 `tool_choice`**
   - 仅处理 `{ type: "tool", name: "web_search" }` 格式
   - `auto`/`any`/`none` 类型不受影响

3. **向 system 字段注入禁用说明**
   - 仅在实际移除了工具时才注入
   - 兼容 `system` 为字符串或数组两种格式
   - 防重复注入

### 不做响应侧篡改

不修改上游返回的 `tool_use` 事件、不碰 relay service 的流式/非流式响应链。

## 调用位置

在 `handleMessagesRequest()` 中：

```
1. 权限校验
2. 输入验证（body、messages）
3. 模型黑名单校验
4. 1M 上下文检查
5. 日志记录 & dump
6. Gemini 分流（如果命中则 return）
7. ★ applyWebToolDisablePolicy(req.body)   ← 插入点
8. 流式/非流式处理
9. 会话绑定、调度、转发...
```

## 测试

```bash
npx jest tests/apiWebSearchPolicy.test.js
```

覆盖场景：
- web_search / web_fetch server tool 被正确识别和移除
- 未来版本号变化（如 `web_search_20260101`）的兼容性
- 自定义同名工具（`type: "custom"`）不被误伤
- 其他 server tool（bash、text_editor、computer）不受影响
- tool_choice 指向 web 工具时被清除
- tool_choice 为 auto/any 时不受影响
- system 字符串格式和数组格式的注入
- 防重复注入
- 无 tools 字段的请求不受影响
- tools 全部被移除时删除 tools 字段

## 回滚

删除环境变量或设为 `false`：

```bash
# docker-compose.yml
environment:
  - DISABLE_WEB_TOOLS=false

# 或直接删除该行，然后重启
docker compose restart
```

代码层面所有改动集中在 `src/routes/api.js` 一个文件，回退 git 即可：

```bash
git checkout src/routes/api.js
```
