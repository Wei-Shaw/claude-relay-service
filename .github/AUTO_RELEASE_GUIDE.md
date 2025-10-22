# 自动版本发布指南

## 📋 概述

本项目配置了自动版本发布功能，每次推送到 `main` 分支时会自动递增版本号并创建 GitHub Release。

## 🚀 工作原理

### 自动版本递增规则

- **版本格式**: `v<major>.<minor>.<patch>` （例如: v1.0.2）
- **递增规则**: 每次推送到 main 分支，自动递增 patch 版本号
  - v1.0.1 → v1.0.2
  - v1.0.9 → v1.0.10
  - v1.0.99 → v1.0.100

### 触发条件

当满足以下条件时，会自动创建新版本：

1. 推送到 `main` 分支
2. 有实际的代码变更（不包括纯文档更新）
3. 自上次发布以来有新的提交

## 📝 使用方法

### 1. 常规开发流程

```bash
# 在 dev 分支开发
git checkout dev
# ... 进行开发 ...
git add .
git commit -m "feat: 添加新功能"
git push origin dev

# 合并到 main 分支
git checkout main
git merge dev
git push origin main  # 这会触发自动发布
```

### 2. 跳过自动发布

如果你的提交不想触发自动发布，在 commit 消息中添加 `[skip ci]`：

```bash
git commit -m "docs: 更新文档 [skip ci]"
```

### 3. 手动控制版本号

如果需要发布大版本或中版本更新：

```bash
# 大版本更新 (1.0.x → 2.0.0)
git tag -a v2.0.0 -m "Major release v2.0.0"
git push origin v2.0.0

# 中版本更新 (1.0.x → 1.1.0)
git tag -a v1.1.0 -m "Minor release v1.1.0"
git push origin v1.1.0
```

## 🔧 配置说明

### 工作流文件

- **位置**: `.github/workflows/auto-release.yml`
- **功能**:
  - 获取最新版本标签
  - 计算下一个版本号
  - 生成 changelog
  - 创建 GitHub Release
  - 更新 CHANGELOG.md 文件
  - 发送 Telegram 通知（可选）

### Changelog 生成

使用 [git-cliff](https://github.com/orhun/git-cliff) 自动生成更新日志：

- **配置文件**: `.github/cliff.toml`
- **提交规范**: 遵循 [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat:` 新功能
  - `fix:` Bug 修复
  - `docs:` 文档更新
  - `chore:` 其他变更
  - `refactor:` 代码重构
  - `perf:` 性能优化

## 📊 查看发布历史

1. **GitHub Releases 页面**:
   - 访问 `https://github.com/<owner>/<repo>/releases`
   - 查看所有发布版本和更新内容

2. **CHANGELOG.md**:
   - 项目根目录的 `CHANGELOG.md` 文件
   - 包含完整的版本历史

## ❓ 常见问题

### Q: 如何查看当前版本？

```bash
# 查看最新标签
git describe --tags --abbrev=0

# 查看所有标签
git tag -l
```

### Q: 自动发布失败怎么办？

1. 检查 GitHub Actions 日志
2. 确认是否有权限创建标签和发布
3. 检查是否有语法错误

### Q: 如何回滚版本？

自动发布只是创建标签和 Release，不会影响代码：

```bash
# 回滚到特定版本
git checkout v1.0.1

# 或者使用 Docker 镜像的特定版本
docker pull weishaw/claude-relay-service:v1.0.1
```

### Q: 如何修改版本递增规则？

编辑 `.github/workflows/auto-release.yml` 中的版本计算逻辑：

```yaml
# 当前是递增 patch 版本
NEW_PATCH=$((PATCH + 1))

# 可以改为递增 minor 版本
NEW_MINOR=$((MINOR + 1))
NEW_PATCH=0
```

## 📱 Telegram 通知（可选）

自动发布系统支持发送通知到 Telegram 频道。配置后，每次发布新版本都会自动发送通知。

### 快速设置

1. 创建 Telegram Bot（通过 @BotFather）
2. 将 Bot 添加到频道作为管理员
3. 获取频道的 Chat ID
4. 在 GitHub 仓库添加 Secrets：
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

详细设置步骤请参考 [Telegram 通知设置指南](./TELEGRAM_SETUP.md)

## 🔗 相关链接

- [GitHub Actions 工作流使用指南](./WORKFLOW_USAGE.md)
- [Telegram 通知设置指南](./TELEGRAM_SETUP.md)
- [Docker Hub 设置指南](./DOCKER_HUB_SETUP.md)
- [Git Cliff 配置文档](https://git-cliff.org/docs/configuration)
