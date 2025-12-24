# 上游仓库同步操作文档

## 📋 项目信息

- **上游仓库**: [Wei-Shaw/claude-relay-service](https://github.com/Wei-Shaw/claude-relay-service)
- **Fork 仓库**: [UncleJ-h/claude-relay-service](https://github.com/UncleJ-h/claude-relay-service)
- **本地路径**: `/Users/jeffreyhu/DEV/claude-relay-service`
- **部署平台**: Zeabur（自动部署）

---

## 🎯 快速开始

### 第一次同步？请看这里！

如果你是第一次同步，或者不确定如何开始，请使用 **Claude Code 自动化指令**：

```
请按照 SYNC_UPSTREAM.md 文档执行上游同步，使用 Rebase 策略，
遇到冲突自动处理（功能保留上游，UI保留我的定制），
同步完成后更新模型定价数据并推送到 GitHub
```

**只需复制上面这段话给 Claude Code，它会自动完成所有步骤！**

### 定期检查更新

建议每 1-2 周检查一次上游更新：

1. 访问 [上游 Releases 页面](https://github.com/Wei-Shaw/claude-relay-service/releases)
2. 查看是否有新版本发布
3. 阅读 Release Notes 了解新功能和改进
4. 使用本文档进行同步

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

### 方式一：自动同步（推荐）⭐

**使用 Claude Code 一键完成所有操作：**

1. 打开 Claude Code
2. 输入以下指令：

```
请按照 SYNC_UPSTREAM.md 文档执行上游同步，使用 Rebase 策略，
遇到冲突自动处理（功能保留上游，UI保留我的定制），
同步完成后更新模型定价数据并推送到 GitHub
```

3. 等待执行完成
4. 检查 Zeabur 部署状态

**Claude Code 会自动完成：**
- ✅ 配置 upstream 远程仓库
- ✅ 拉取最新代码并 rebase 合并
- ✅ 智能处理冲突（功能保留上游，UI保留定制）
- ✅ 测试构建
- ✅ 更新模型定价数据
- ✅ 提交并推送到 GitHub
- ✅ 触发 Zeabur 自动部署

---

### 方式二：手动同步（详细步骤）

#### 准备工作（首次执行需要）

```bash
# 1. 进入项目目录
cd /Users/jeffreyhu/DEV/claude-relay-service

# 2. 添加上游仓库（首次需要）
git remote add upstream https://github.com/Wei-Shaw/claude-relay-service.git

# 3. 验证远程仓库配置
git remote -v
# 应该看到：
# origin    git@github.com:UncleJ-h/claude-relay-service.git (fetch/push)
# upstream  https://github.com/Wei-Shaw/claude-relay-service.git (fetch/push)
```

#### 同步步骤（每次更新执行）

```bash
# ========================================
# 第一阶段：准备和获取更新
# ========================================

# 1. 确保在项目目录
cd /Users/jeffreyhu/DEV/claude-relay-service

# 2. 确保本地工作区干净
git status
# 如果有未提交的更改，先提交或暂存：
# git add .
# git commit -m "描述修改内容"

# 3. 拉取上游最新代码
git fetch upstream

# 4. 查看上游更新内容（可选但推荐）
echo "=== 上游新增的提交 ==="
git log --oneline HEAD..upstream/main | head -20

echo "=== 上游更新了多少个版本 ==="
git log --oneline HEAD..upstream/main | wc -l

# ========================================
# 第二阶段：合并更新
# ========================================

# 5. 执行 rebase 合并
git rebase upstream/main

# 6. 如果有冲突，解决后继续
# 如果出现冲突：
# - 编辑冲突文件（参考下面的冲突处理策略）
# - git add <已解决的文件>
# - git rebase --continue
#
# 如果想放弃 rebase：
# - git rebase --abort

# ========================================
# 第三阶段：测试和更新
# ========================================

# 7. 检查模型配置同步（重要！新增步骤）
bash scripts/check-model-sync.sh
# 如果检查失败，手动更新缺失的前端模型列表

# 8. 测试 Web 界面构建（重要！）
npm run build:web

# 9. 更新模型定价数据（如果上游有新模型）
npm run update:pricing

# 10. 提交定价更新（如果有变化）
git status
# 如果有变化（定价文件或模型配置）：
git add resources/model-pricing/model_prices_and_context_window.json
git add web/admin-spa/src/components/  # 如果有模型列表更新
git commit -m "chore: 同步上游 v<版本号> + 更新模型配置和定价数据"

# ========================================
# 第四阶段：推送和部署
# ========================================

# 10. 推送到 GitHub（强制推送，因为 rebase 改写了历史）
git push origin main --force-with-lease

# 如果上面失败（可能是远程有其他更新），使用：
# git push origin main --force

# 11. 等待 Zeabur 自动重新部署（约 2-5 分钟）
echo "✅ 推送成功！请访问 Zeabur 控制台查看部署状态"
echo "🔗 https://zeabur.com"
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

### 🎯 新模型同步检查清单（重要！）

**当上游添加新模型时，必须检查以下文件是否需要同步更新：**

#### 后端检查
- [ ] **src/services/modelService.js** - 模型列表是否已更新
  ```bash
  # 检查命令：
  grep -A 15 "getDefaultModels()" src/services/modelService.js
  ```

#### 前端检查（这些文件容易遗漏！）
- [ ] **web/admin-spa/src/components/apikeys/CreateApiKeyModal.vue** - commonModels 列表
  ```bash
  # 检查命令：
  grep -A 5 "常用模型列表" web/admin-spa/src/components/apikeys/CreateApiKeyModal.vue
  ```

- [ ] **web/admin-spa/src/components/apikeys/EditApiKeyModal.vue** - commonModels 列表
  ```bash
  # 检查命令：
  grep -A 5 "常用模型列表" web/admin-spa/src/components/apikeys/EditApiKeyModal.vue
  ```

- [ ] **web/admin-spa/src/components/accounts/AccountForm.vue** - commonModels 数组
  ```bash
  # 检查命令：
  grep -A 15 "常用模型列表" web/admin-spa/src/components/accounts/AccountForm.vue
  ```

#### 自动化检查脚本（推荐使用）

**方式 1：使用专用检查脚本（最简单）**
```bash
# 运行自动化检查脚本
bash scripts/check-model-sync.sh

# 如果所有检查通过，会显示：
# ✅ 所有检查通过！模型配置已同步
```

**方式 2：手动检查命令**
```bash
# 一键检查所有模型配置文件
echo "=== 后端模型列表 ==="
grep "claude-opus-4-5\|claude-sonnet-4-5\|claude-haiku-4-5" src/services/modelService.js

echo -e "\n=== 前端 CreateApiKeyModal ==="
grep -A 3 "commonModels.*ref" web/admin-spa/src/components/apikeys/CreateApiKeyModal.vue

echo -e "\n=== 前端 EditApiKeyModal ==="
grep -A 3 "commonModels.*ref" web/admin-spa/src/components/apikeys/EditApiKeyModal.vue

echo -e "\n=== 前端 AccountForm ==="
grep "claude-opus-4-5\|claude-sonnet-4-5\|claude-haiku-4-5" web/admin-spa/src/components/accounts/AccountForm.vue | head -5
```

### 视觉验证（部署后）
- [ ] 访问管理后台 URL
- [ ] 确认 Logo 是 Whoos Solutions
- [ ] 确认配色是红金渐变
- [ ] 确认页面标题是 "Whoos Solutions API Hub"
- [ ] **测试新模型是否在 API Key 创建/编辑界面的快捷选择中可见**
- [ ] **测试新模型是否在账户配置界面的模型映射中可选**
- [ ] 测试新功能是否正常工作

## 🔧 故障排除

### 常见问题速查表

| 错误信息 | 原因 | 解决方案 | 命令 |
|---------|------|---------|------|
| `fatal: remote upstream already exists` | upstream 已配置 | 更新 URL | `git remote set-url upstream https://github.com/Wei-Shaw/claude-relay-service.git` |
| `error: could not apply...` | rebase 冲突 | 解决冲突或中止 | 见下方"冲突处理详解" |
| `! [rejected] ... (non-fast-forward)` | 推送被拒绝 | 使用强制推送 | `git push origin main --force-with-lease` |
| `Failed to connect to github.com` | 网络问题 | 切换到 SSH | `git remote set-url origin git@github.com:UncleJ-h/claude-relay-service.git` |
| `npm run build:web` 失败 | 依赖问题 | 重新安装 | 见下方"构建失败" |

### 问题 1：upstream 已存在

**错误信息：**
```
fatal: remote upstream already exists.
```

**解决方案：**
```bash
# 方法 1：更新 upstream URL
git remote set-url upstream https://github.com/Wei-Shaw/claude-relay-service.git

# 方法 2：删除后重新添加
git remote remove upstream
git remote add upstream https://github.com/Wei-Shaw/claude-relay-service.git

# 验证配置
git remote -v
```

### 问题 2：rebase 过程中出现冲突

**冲突处理详解：**

```bash
# 1. 查看冲突文件
git status

# 2. 对于每个冲突文件，根据类型处理：

# UI/样式文件（保留我们的版本）：
# - web/admin-spa/src/styles/global.css
# - web/admin-spa/src/views/ApiStatsView.vue
# - web/admin-spa/public/logo.svg
# - web/admin-spa/public/favicon.ico
git checkout --ours <冲突文件>
git add <冲突文件>

# 功能性代码文件（保留上游版本）：
# - src/services/*.js
# - src/routes/*.js
# - src/utils/*.js
git checkout --theirs <冲突文件>
git add <冲突文件>

# 需要手动合并的文件：
# 编辑文件，手动解决冲突标记（<<<<<<< ======= >>>>>>>）
# 保存后：
git add <冲突文件>

# 3. 继续 rebase
git rebase --continue

# 如果想放弃 rebase：
git rebase --abort
git reset --hard origin/main
```

**快速解决冲突的技巧：**

```bash
# 批量接受我们的品牌文件
git checkout --ours web/admin-spa/src/styles/global.css
git checkout --ours web/admin-spa/src/views/ApiStatsView.vue
git checkout --ours web/admin-spa/public/logo.svg
git checkout --ours web/admin-spa/public/favicon.ico
git checkout --ours web/admin-spa/index.html
git add web/admin-spa/

# 批量接受上游的功能代码
git checkout --theirs src/
git add src/
```

### 问题 3：推送被拒绝

**错误信息：**
```
! [rejected] main -> main (non-fast-forward)
```

**解决方案（按顺序尝试）：**

```bash
# 方法 1：使用 --force-with-lease（推荐，更安全）
git push origin main --force-with-lease

# 方法 2：如果方法 1 失败，先检查远程状态
git fetch origin
git status
git log --oneline origin/main -5

# 方法 3：确认后使用强制推送（谨慎！会覆盖远程）
git push origin main --force
```

### 问题 4：网络连接问题

**错误信息：**
```
Failed to connect to github.com port 443
fatal: unable to access 'https://github.com/...'
```

**解决方案：**

```bash
# 方法 1：切换到 SSH 方式（推荐）
git remote set-url origin git@github.com:UncleJ-h/claude-relay-service.git

# 测试 SSH 连接
ssh -T git@github.com
# 应该看到：Hi UncleJ-h! You've successfully authenticated...

# 重新推送
git push origin main

# 方法 2：配置 Git 使用代理（如果需要）
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# 取消代理配置
git config --global --unset http.proxy
git config --global --unset https.proxy
```

### 问题 5：构建失败

**错误信息：**
```
npm ERR! code ELIFECYCLE
npm run build:web 失败
```

**解决方案（按顺序尝试）：**

```bash
# 方法 1：清理并重新安装 Web 依赖
cd web/admin-spa
rm -rf node_modules package-lock.json
npm install
npm run build
cd ../..

# 方法 2：清理 npm 缓存
npm cache clean --force
cd web/admin-spa
npm install
npm run build
cd ../..

# 方法 3：检查 Node.js 版本
node --version
# 应该是 >= 18.0.0

# 如果版本过低，升级 Node.js
# 使用 nvm：
# nvm install 20
# nvm use 20

# 方法 4：使用 --legacy-peer-deps
cd web/admin-spa
npm install --legacy-peer-deps
npm run build
cd ../..
```

### 问题 6：Zeabur 部署失败

**症状：推送成功但 Zeabur 部署失败**

**检查步骤：**

1. **访问 Zeabur 控制台**
   - 登录 https://zeabur.com
   - 进入 claude-relay-service 项目
   - 查看部署日志

2. **常见部署错误：**

```bash
# 错误 1：构建超时
# 解决：在 Zeabur 设置中增加构建超时时间

# 错误 2：内存不足
# 解决：升级 Zeabur 实例规格

# 错误 3：环境变量缺失
# 解决：在 Zeabur 设置中检查必需的环境变量：
# - JWT_SECRET
# - ENCRYPTION_KEY
# - REDIS_HOST
# - REDIS_PASSWORD

# 错误 4：端口冲突
# 解决：检查 Zeabur 端口配置是否正确（默认 3000）
```

3. **手动触发重新部署：**
   - 在 Zeabur 控制台点击 "Redeploy"
   - 或推送一个空提交：
   ```bash
   git commit --allow-empty -m "chore: 触发 Zeabur 重新部署"
   git push origin main
   ```

### 问题 7：同步后功能异常

**症状：同步成功但服务运行异常**

**检查清单：**

```bash
# 1. 检查本地代码是否完整
git status
git log --oneline -5

# 2. 验证关键文件
ls -la web/admin-spa/public/logo.svg
ls -la web/admin-spa/public/favicon.ico
grep -n "Whoos Solutions" web/admin-spa/index.html

# 3. 本地测试服务
npm install
npm run build:web
npm start

# 4. 检查端口（默认 3000）
curl http://localhost:3000/health

# 5. 如果一切正常，问题可能在 Zeabur
# 检查 Zeabur 环境变量和部署日志
```

### 紧急回滚方案

**如果同步后出现严重问题，需要紧急回滚：**

```bash
# 方法 1：回滚到上一次成功的提交
git log --oneline -10
# 找到同步前的 commit ID，例如 abc1234

git reset --hard abc1234
git push origin main --force

# 方法 2：使用 git revert（保留历史）
git revert HEAD
git push origin main

# 方法 3：在 Zeabur 回滚到之前的部署
# 在 Zeabur 控制台 → Deployments → 选择之前的成功部署 → Redeploy
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

| 日期 | 上游版本 | 操作 | 冲突 | 状态 | 备注 |
|------|---------|------|------|------|------|
| 2025-11-26 | v1.1.209 | 首次同步 56 个版本 + 模型更新 | 无冲突 | ✅ 成功 | 遗漏前端模型列表更新 |
| 2025-11-26 | - | 修复前端模型列表 | 无 | ✅ 完成 | 更新 CreateApiKeyModal 和 EditApiKeyModal 的 commonModels |
| 2025-11-26 | v1.1.211 | 同步 7 个提交 (v1.1.210 + v1.1.211) | 无冲突 | ✅ 成功 | 修复apikeys排序、移除x-authorization头、增加export等 |
| 2025-11-29 | v1.1.214 | 同步 6 个提交 (v1.1.212-214) | 无冲突 | ✅ 成功 | 修复Gemini/OpenAI账户分组调度、Claude Console测试、表格列宽优化 |
| 2025-11-30 | v1.1.215 | 同步 2 个提交 | 无冲突 | ✅ 成功 | 调整Gemini-API BaseApi后缀适配更多端点 |
| 2025-11-30 | v1.1.216 | 同步 3 个提交 | 无冲突 | ✅ 成功 | 修复Claude API 400错误(tool_result/tool_use不匹配) |
| 2025-12-11 | v1.1.231 | 同步 7 个提交 (v1.1.217-231) | 无冲突 | ✅ 成功 | 用户消息队列锁释放优化、并发路由安全修复、客户端断开日志优化 |
| 2025-12-11 | v1.1.232 | 同步 4 个提交 | 无冲突 | ✅ 成功 | Codex token统计修复、账户列表加载健壮性增强 |
| 2025-12-12 | v1.1.233 | 同步 8 个提交 | 无冲突 | ✅ 成功 | **重要功能**: 并发请求排队系统（解决Claude Code并行调用429问题） |
| 2025-12-15 | v1.1.235 | 同步 6 个提交 (v1.1.234-235) | 无冲突 | ✅ 成功 | Opus 4.5快捷映射、Console header白名单、API Key成本计算修复 |
| 2025-12-19 | v1.1.236 | 同步 11 个提交 | 无冲突 | ✅ 成功 | Cron定时测试功能、OpenAI调度priority修复、全时间统计修复 |
| 2025-12-20 | v1.1.237 | 同步 2 个提交 | 无冲突 | ✅ 成功 | Claude单账户串行队列支持（maxConcurrency配置） |
| 2025-12-22 | v1.1.238 | 同步 9 个提交 | 无冲突 | ✅ 成功 | 预热请求拦截(interceptWarmup)、遥测端点适配、Claude Code Plus推荐 |
| 2025-12-24 | v1.1.239 | 同步 3 个提交 | 无冲突 | ✅ 成功 | 403错误重试机制、并发清理WRONGTYPE修复 |

**下次更新请在此添加记录**

---

## 📋 同步前检查清单

在开始同步之前，请确认以下事项：

### 环境检查
- [ ] Git 已安装（`git --version`）
- [ ] Node.js >= 18.0.0（`node --version`）
- [ ] npm 已安装（`npm --version`）
- [ ] 已配置 SSH key 或 Git 凭据
- [ ] 网络连接正常

### 项目状态检查
- [ ] 本地没有未提交的更改（`git status` 显示 clean）
- [ ] 当前在 main 分支（`git branch` 显示 * main）
- [ ] upstream 远程仓库已配置（`git remote -v` 显示 upstream）
- [ ] 最近一次部署是成功的

### 备份检查
- [ ] GitHub 上有最新代码
- [ ] Zeabur 上的服务运行正常
- [ ] 已记录当前版本号（`git log -1`）

## 🎯 最佳实践

### 同步时机选择

**推荐时机：**
- ✅ 上游发布重要新功能时
- ✅ 上游发布安全更新时
- ✅ 上游添加新模型支持时
- ✅ 定期维护窗口（如每周五下午）

**避免时机：**
- ❌ 生产环境高峰期
- ❌ 正在开发新功能时（有未提交代码）
- ❌ 刚完成重要部署（等待稳定）
- ❌ 网络不稳定时

### 同步频率建议

| 项目阶段 | 建议频率 | 说明 |
|---------|---------|------|
| 初期（刚 fork） | 每周 1-2 次 | 快速跟进上游改进 |
| 稳定期 | 每 2-4 周 | 定期获取新功能 |
| 仅维护 | 每月或按需 | 重要更新时才同步 |

### 版本管理技巧

**使用 Git Tags 标记重要版本：**

```bash
# 同步成功后，打上版本标签
git tag -a v1.1.209-whoos -m "同步上游 v1.1.209 + Whoos 品牌定制"
git push origin v1.1.209-whoos

# 查看所有标签
git tag -l

# 回退到特定标签
git checkout v1.1.209-whoos
```

**创建同步记录文件：**

```bash
# 每次同步后记录信息
cat >> SYNC_LOG.md << EOF

## $(date +%Y-%m-%d) - 同步 v1.1.209
- 上游版本: v1.1.209
- 新增功能: Claude Opus 4.5 支持
- 冲突文件: 无
- 部署状态: ✅ 成功
- 验证结果: 所有功能正常

EOF
```

## 💡 提示与建议

### 日常维护

- **同步频率**: 建议每 1-2 周检查一次上游更新
- **检查更新**: 订阅上游 [Releases](https://github.com/Wei-Shaw/claude-relay-service/releases) 页面
- **备份策略**: GitHub 自动保存，本地定期 `git tag` 标记重要版本
- **回滚方案**: 保留最近 3 个成功版本的标签，以便快速回滚

### 监控和告警

**设置 GitHub 通知：**
1. 访问 https://github.com/Wei-Shaw/claude-relay-service
2. 点击 "Watch" → "Custom" → 选择 "Releases"
3. 收到新 Release 通知时及时同步

**Zeabur 部署监控：**
1. 在 Zeabur 设置中配置部署通知
2. 关注部署失败告警
3. 定期查看服务健康状态

### 团队协作

如果多人维护项目：

```bash
# 同步前先拉取团队的最新改动
git fetch origin
git rebase origin/main

# 然后再同步上游
git fetch upstream
git rebase upstream/main

# 推送时使用 --force-with-lease 而不是 --force
git push origin main --force-with-lease
```

### 自动化脚本

**创建同步脚本（可选）：**

```bash
# 创建 sync-upstream.sh
cat > sync-upstream.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 开始同步上游..."

# 1. 检查工作区
if [[ -n $(git status -s) ]]; then
  echo "❌ 错误：工作区不干净，请先提交或暂存更改"
  exit 1
fi

# 2. 拉取上游
echo "📥 拉取上游最新代码..."
git fetch upstream

# 3. 显示更新信息
echo "📊 上游新增提交："
git log --oneline HEAD..upstream/main | head -10

# 4. 询问是否继续
read -p "是否继续同步？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 1
fi

# 5. Rebase 合并
echo "🔄 执行 rebase..."
git rebase upstream/main

# 6. 更新定价
echo "💰 更新模型定价..."
npm run update:pricing

# 7. 构建测试
echo "🏗️ 测试构建..."
npm run build:web

# 8. 推送
echo "📤 推送到 GitHub..."
git push origin main --force-with-lease

echo "✅ 同步完成！"
echo "🔗 请访问 Zeabur 查看部署状态: https://zeabur.com"
EOF

chmod +x sync-upstream.sh

# 使用脚本
./sync-upstream.sh
```

## 📖 快速参考

### 常用命令速查

```bash
# 查看上游更新
git fetch upstream && git log --oneline HEAD..upstream/main

# 完整同步流程（一键复制执行）
cd /Users/jeffreyhu/DEV/claude-relay-service && \
git fetch upstream && \
git rebase upstream/main && \
npm run build:web && \
npm run update:pricing && \
git push origin main --force-with-lease

# 检查同步状态
git log --oneline -10
git remote -v
git status

# 紧急回滚
git reset --hard origin/main
git push origin main --force
```

### Git 远程仓库配置速查

```bash
# origin（你的 fork）
git remote set-url origin git@github.com:UncleJ-h/claude-relay-service.git

# upstream（上游仓库）
git remote set-url upstream https://github.com/Wei-Shaw/claude-relay-service.git

# 验证配置
git remote -v
```

### 冲突快速解决

```bash
# 保留我们的品牌文件
git checkout --ours web/admin-spa/src/styles/global.css
git checkout --ours web/admin-spa/src/views/ApiStatsView.vue
git checkout --ours web/admin-spa/public/*
git checkout --ours web/admin-spa/index.html
git add web/admin-spa/

# 保留上游功能代码
git checkout --theirs src/
git add src/

# 继续 rebase
git rebase --continue
```

## ❓ 常见问题 FAQ

### Q1: 多久同步一次上游比较合适？

**A:** 建议每 1-2 周检查一次上游更新。如果上游发布重要功能或安全更新，应立即同步。

### Q2: 如果同步后出现问题怎么办？

**A:** 使用紧急回滚方案：
```bash
git log --oneline -10  # 找到同步前的 commit
git reset --hard <commit-id>
git push origin main --force
```

### Q3: rebase 和 merge 有什么区别？为什么用 rebase？

**A:**
- **Rebase**: 将我们的定制提交"移动"到上游最新代码之上，保持线性历史
- **Merge**: 创建合并提交，历史会有分叉
- **我们用 rebase 因为**: 保持提交历史干净整洁，便于查看我们的定制内容

### Q4: 为什么推送要用 --force-with-lease？

**A:**
- `--force-with-lease` 比 `--force` 更安全
- 只有在远程没有其他人推送的情况下才会强制推送
- 避免意外覆盖他人的工作

### Q5: 如何知道上游有新版本发布？

**A:** 三种方式：
1. 订阅上游仓库的 Release 通知（推荐）
2. 定期访问 https://github.com/Wei-Shaw/claude-relay-service/releases
3. 使用 `git fetch upstream && git log HEAD..upstream/main` 查看

### Q6: 同步时出现网络超时怎么办？

**A:** 切换到 SSH 方式：
```bash
git remote set-url origin git@github.com:UncleJ-h/claude-relay-service.git
ssh -T git@github.com  # 测试连接
git push origin main
```

### Q7: Zeabur 部署需要多久？

**A:** 通常 2-5 分钟。如果超过 10 分钟，检查 Zeabur 控制台的部署日志。

### Q8: 如何验证新模型是否可用？

**A:** 同步并部署后：
1. 访问 `https://your-domain.zeabur.app/api/v1/models`
2. 查找新模型 ID（如 `claude-opus-4-5-20251101`）
3. 在 Claude Code CLI 中选择并测试

### Q9: 定价文件需要手动更新吗？

**A:** 不需要。运行 `npm run update:pricing` 会自动从上游的 price-mirror 分支拉取最新定价。

### Q10: 如果忘记更新定价会怎样？

**A:** 不影响功能。系统有回退机制，会使用硬编码的默认价格（见 `src/services/pricingService.js`）。

### Q11: 可以跳过某些上游更新吗？

**A:** 不建议。每次同步应该拉取所有上游更新，以保持功能完整性和安全性。

### Q12: 品牌定制会被覆盖吗？

**A:** 正常情况下不会。如果出现冲突，按照冲突处理策略保留我们的品牌文件即可。

## 🆘 紧急联系方式

如果遇到无法解决的问题：

1. **查看项目文档**:
   - `README.md` - 项目说明
   - `CLAUDE.md` - 开发指南
   - 本文档 - 同步指南

2. **检查上游问题**:
   - [上游 Issues](https://github.com/Wei-Shaw/claude-relay-service/issues)
   - [上游 Discussions](https://github.com/Wei-Shaw/claude-relay-service/discussions)

3. **使用 Claude Code 求助**:
   ```
   我在同步上游时遇到了问题：[描述问题]
   请参考 SYNC_UPSTREAM.md 文档帮我解决
   ```

## 🔗 相关链接

- [上游仓库](https://github.com/Wei-Shaw/claude-relay-service)
- [上游 Releases](https://github.com/Wei-Shaw/claude-relay-service/releases)
- [我们的 Fork](https://github.com/UncleJ-h/claude-relay-service)
- [Zeabur 部署控制台](https://zeabur.com)
- [Git Rebase 文档](https://git-scm.com/docs/git-rebase)
- [Git 强制推送最佳实践](https://git-scm.com/docs/git-push#Documentation/git-push.txt---force-with-lease)

---

**文档版本**: v1.1 (2025-11-26)
**最后更新**: 添加模型更新章节、故障排除、最佳实践和 FAQ
**维护者**: UncleJ-h
