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
遇到冲突自动处理（功能保留上游，UI保留我的定制）
```

**Claude Code 会自动：**
1. ✅ 定位项目目录
2. ✅ 添加/更新 upstream 远程仓库
3. ✅ 拉取上游最新代码
4. ✅ 执行 rebase 合并
5. ✅ 自动处理冲突（按策略：功能保留上游，UI保留定制）
6. ✅ 测试构建
7. ✅ 推送到 GitHub

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

## 📝 版本记录

| 日期 | 上游版本 | 操作 | 冲突 | 状态 |
|------|---------|------|------|------|
| 2025-11-26 | v1.1.209 | 首次同步 56 个版本 | 无冲突 | ✅ 成功 |

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
