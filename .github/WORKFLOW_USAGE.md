# GitHub Actions 工作流使用指南

## 📋 概述

本项目配置了自动化 CI/CD 流程，每次推送到 main 分支都会自动构建并发布 Docker 镜像到 Docker Hub。

## 🚀 工作流程

### 1. Docker 构建和发布 (`docker-publish.yml`)

**功能：**

- 自动构建多平台 Docker 镜像（amd64, arm64）
- 推送到 Docker Hub
- 执行安全漏洞扫描
- 更新 Docker Hub 描述

**触发条件：**

- 推送到 `main` 分支
- 创建版本标签（如 `v1.0.0`）
- Pull Request（仅构建，不推送）
- 手动触发

### 2. 发布管理 (`release.yml`)

**功能：**

- 自动创建 GitHub Release
- 生成更新日志
- 关联 Docker 镜像版本

**触发条件：**

- 创建版本标签（如 `v1.0.0`）

### 3. 自动版本发布 (`auto-release.yml`)

**功能：**

- 自动递增版本号（patch 版本）
- 自动创建版本标签
- 生成 GitHub Release
- 更新 CHANGELOG.md

**触发条件：**

- 推送到 `main` 分支（自动触发）
- 忽略纯文档更新

## 📝 版本发布流程

### 1. 常规更新（推送到 main）

```bash
git add .
git commit -m "fix: 修复登录问题"
git push origin main
```

**结果：**

- 自动构建并推送 `latest` 标签到 Docker Hub
- 更新 `main` 标签
- **自动递增版本号并创建 Release**（例如：v1.0.1 → v1.0.2）
- 生成更新日志

### 2. 版本发布

```bash
# 创建版本标签
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

**结果：**

- 构建并推送以下标签到 Docker Hub：
  - `v1.0.0`（完整版本）
  - `1.0`（主次版本）
  - `1`（主版本）
  - `latest`（最新版本）
- 创建 GitHub Release
- 生成更新日志

## 🔧 手动触发构建

1. 访问仓库的 Actions 页面
2. 选择 "Docker Build & Push" 工作流
3. 点击 "Run workflow"
4. 选择分支并运行

## 📊 查看构建状态

- **Actions 页面**：查看所有工作流运行历史
- **README 徽章**：实时显示构建状态
- **Docker Hub**：查看镜像标签和拉取次数

## 🛡️ 安全扫描

每次构建都会运行 Trivy 安全扫描：

- 扫描结果上传到 GitHub Security 标签页
- 发现高危漏洞会在 Actions 日志中警告

## ❓ 常见问题

### Q: 如何回滚到之前的版本？

```bash
# 使用特定版本标签
docker pull weishaw/claude-relay-service:v1.0.0

# 或在 docker-compose.yml 中指定版本
image: weishaw/claude-relay-service:v1.0.0
```

### Q: 如何跳过自动构建？

在 commit 消息中添加 `[skip ci]`：

```bash
git commit -m "docs: 更新文档 [skip ci]"
```

### Q: 构建失败如何调试？

1. 查看 Actions 日志详细错误信息
2. 在本地测试 Docker 构建：
   ```bash
   docker build -t test .
   ```

## 📚 相关文档

- [自动版本发布指南](.github/AUTO_RELEASE_GUIDE.md)
- [Docker Hub 配置指南](.github/DOCKER_HUB_SETUP.md)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Docker 官方文档](https://docs.docker.com/)
