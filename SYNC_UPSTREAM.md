# 上游仓库同步操作文档

## 📋 项目信息

- **上游仓库**: [Wei-Shaw/claude-relay-service](https://github.com/Wei-Shaw/claude-relay-service)
- **Fork 仓库**: [UncleJ-h/claude-relay-service](https://github.com/UncleJ-h/claude-relay-service)
- **本地路径**: `/Users/jeffreyhu/DEV/claude-relay-service`
- **部署平台**: Zeabur（自动部署）

## 🎨 本地定制内容

以下内容是我们的品牌定制，**需要在每次同步时保留**：

### 品牌信息
- **品牌名称**: Whoos Solutions API Hub
- **Logo**: `web/admin-spa/public/logo.svg`
- **Favicon**: `web/admin-spa/public/favicon.ico`

### UI 配色方案
- **主题**: 北大红金渐变
- **颜色值**:
  - 深红: `#b31b1b` (北京大学红)
  - 亮红: `#e4002b`
  - 金黄: `#ffcd00`

### 修改的文件
1. `web/admin-spa/src/styles/global.css` - 全局渐变配色
2. `web/admin-spa/src/views/ApiStatsView.vue` - API 统计页面配色
3. `web/admin-spa/public/logo.svg` - 品牌 Logo
4. `web/admin-spa/public/favicon.ico` - 网站图标
5. `web/admin-spa/index.html` - 站点标题
6. `vite.config.js` - ESLint 构建配置（如有）

## 🚀 同步流程（完整版）

### 准备工作（首次执行需要）

```bash
# 1. 进入项目目录
cd /Users/jeffreyhu/DEV/claude-relay-service

# 2. 添加上游仓库（首次需要）
git remote add upstream https://github.com/Wei-Shaw/claude-relay-service.git

# 3. 验证远程仓库配置
git remote -v
# 应该看到：
# origin    https://github.com/UncleJ-h/claude-relay-service.git (fetch/push)
# upstream  https://github.com/Wei-Shaw/claude-relay-service.git (fetch/push)
```

### 同步步骤（每次更新执行）

```bash
# 1. 确保在项目目录
cd /Users/jeffreyhu/DEV/claude-relay-service

# 2. 确保本地工作区干净
git status
# 如果有未提交的更改，先提交或暂存：
# git add .
# git commit -m "描述修改内容"

# 3. 拉取上游最新代码
git fetch upstream

# 4. 查看上游更新内容（可选）
git log --oneline HEAD...upstream/main | head -20

# 5. 执行 rebase 合并
git rebase upstream/main

# 6. 如果有冲突，解决后继续（通常我们的 UI 定制不会冲突）
# 如果出现冲突：
# - 编辑冲突文件
# - git add <已解决的文件>
# - git rebase --continue

# 7. 测试构建（重要！）
npm run build:web

# 8. 推送到 GitHub（强制推送，因为 rebase 改写了历史）
git push origin main --force-with-lease

# 9. 等待 Zeabur 自动重新部署
```

## 🤖 Claude Code 快速执行指令

**当您需要同步时，只需告诉 Claude Code：**

```
请按照 SYNC_UPSTREAM.md 文档执行上游同步，使用 Rebase 策略，
遇到冲突自动处理（功能保留上游，UI保留我的定制），
同步完成后更新模型定价数据并推送到 GitHub
```

**Claude Code 会自动：**
1. ✅ 定位项目目录
2. ✅ 添加/更新 upstream 远程仓库
3. ✅ 拉取上游最新代码
4. ✅ 执行 rebase 合并
5. ✅ 自动处理冲突（按策略：功能保留上游，UI保留定制）
6. ✅ 测试构建
7. ✅ 更新模型定价数据（`npm run update:pricing`）
8. ✅ 提交并推送到 GitHub（触发 Zeabur 自动部署）

## ⚠️ 冲突处理策略

### 自动处理原则
- **功能性代码**: 优先保留上游的新功能
- **UI/样式代码**: 优先保留我们的品牌定制
- **配置文件**: 根据具体情况判断

### 可能冲突的文件
如果以下文件发生冲突，优先保留我们的版本：
- `web/admin-spa/src/styles/global.css` → 保留红金渐变
- `web/admin-spa/src/views/ApiStatsView.vue` → 保留红金配色
- `web/admin-spa/public/logo.svg` → 保留 Whoos Logo
- `web/admin-spa/public/favicon.ico` → 保留 Whoos 图标
- `web/admin-spa/index.html` → 保留 "Whoos Solutions API Hub" 标题

## 📊 同步检查清单

同步完成后，验证以下内容：

### Git 状态
```bash
# 查看提交历史（我们的定制应该在最上面）
git log --oneline -10

# 查看远程同步状态
git status
```

### 构建测试
```bash
# Web 界面构建
npm run build:web

# 应该看到成功信息：
# ✓ built in X.XXs
```

### 视觉验证（部署后）
- [ ] 访问管理后台 URL
- [ ] 确认 Logo 是 Whoos Solutions
- [ ] 确认配色是红金渐变
- [ ] 确认页面标题是 "Whoos Solutions API Hub"
- [ ] 测试新功能是否正常工作

## 🔧 故障排除

### 问题：upstream 已存在
```bash
# 错误：fatal: remote upstream already exists.
# 解决：更新 upstream URL
git remote set-url upstream https://github.com/Wei-Shaw/claude-relay-service.git
```

### 问题：rebase 过程中出错
```bash
# 中止 rebase
git rebase --abort

# 回到安全状态
git reset --hard origin/main
```

### 问题：推送被拒绝
```bash
# 如果 --force-with-lease 失败，检查是否有其他人推送
git fetch origin
git status

# 确认后使用强制推送（谨慎！）
git push origin main --force
```

### 问题：构建失败
```bash
# 清理并重新安装依赖
cd web/admin-spa
rm -rf node_modules package-lock.json
npm install
npm run build

# 如果还是失败，检查 Node.js 版本
node --version  # 应该是 >= 18.0.0
```

## 🔄 新模型支持和定价更新

### 当上游发布新模型支持时（如 Claude Opus 4.5）

新模型通常会通过以下方式集成到项目中：

1. **模型 ID 注册** - 在 `src/services/modelService.js` 中添加模型 ID
2. **定价数据更新** - 通过 price-mirror 分支自动同步
3. **服务重启** - 自动部署时重新加载配置

### 同步后的模型更新步骤

**在完成上游同步后，需要更新模型定价数据：**

```bash
# 1. 更新模型定价数据（拉取最新价格）
npm run update:pricing

# 2. 验证新模型是否已注册
grep -A 5 "getDefaultModels()" src/services/modelService.js

# 3. （可选）检查定价文件中的模型数量
grep -c '"litellm_provider":' resources/model-pricing/model_prices_and_context_window.json

# 4. 提交定价文件更新（如果有变化）
git add resources/model-pricing/model_prices_and_context_window.json
git commit -m "chore: 更新模型定价数据"

# 5. 推送到 GitHub 触发 Zeabur 自动部署
git push origin main
```

### Zeabur 自动部署机制

**重要：Zeabur 部署说明**

- ✅ **代码推送后自动部署**: 推送到 GitHub 后，Zeabur 会自动检测并重新部署
- ✅ **部署包含最新模型**: 新的模型 ID 和定价数据会在部署时生效
- ✅ **无需手动重启**: 部署完成后服务自动重启，新模型立即可用
- ⏱️ **部署时间**: 通常 2-5 分钟完成（取决于依赖安装）

**检查部署状态：**
1. 访问 [Zeabur 控制台](https://zeabur.com)
2. 查看 claude-relay-service 项目的部署日志
3. 等待 "Running" 状态显示

### 新模型验证清单

部署完成后，验证新模型可用性：

- [ ] Zeabur 部署状态显示 "Running"
- [ ] 访问 `/api/v1/models` 端点，确认新模型在列表中
- [ ] 在 Claude Code CLI 中选择新模型（如 `claude-opus-4-5-20251101`）
- [ ] 发送测试请求，确认返回正常响应
- [ ] 检查管理后台的使用统计是否正常记录

### 模型定价回退机制

**如果定价文件中缺少新模型的价格数据：**

项目有内置的回退机制（见 `src/services/pricingService.js`）：

1. **硬编码价格**: Opus 系列默认使用 `$30/MTok` (1小时缓存)
2. **相似模型参考**: 系统会使用同系列模型的价格
3. **不影响功能**: 即使没有准确价格，模型仍然可用

**常见模型系列的回退价格：**
- Opus 系列: `$15/MTok` (input), `$75/MTok` (output)
- Sonnet 系列: `$3/MTok` (input), `$15/MTok` (output)
- Haiku 系列: `$0.8/MTok` (input), `$4/MTok` (output)

## 📝 版本记录

| 日期 | 上游版本 | 操作 | 冲突 | 状态 |
|------|---------|------|------|------|
| 2025-11-26 | v1.1.209 | 首次同步 56 个版本 + 模型更新 | 无冲突 | ✅ 成功 |

**下次更新请在此添加记录**

---

## 💡 提示

- **同步频率**: 建议每 1-2 周检查一次上游更新
- **检查更新**: 访问 https://github.com/Wei-Shaw/claude-relay-service/releases
- **备份策略**: GitHub 上永久保存，本地可以定期 `git tag` 标记重要版本
- **回滚方案**: 如果同步出问题，可以 `git reset --hard <之前的commit>` 回退

## 🔗 相关链接

- [上游仓库 Releases](https://github.com/Wei-Shaw/claude-relay-service/releases)
- [我们的 Fork](https://github.com/UncleJ-h/claude-relay-service)
- [Zeabur 部署控制台](https://zeabur.com)
- [Git Rebase 文档](https://git-scm.com/docs/git-rebase)
