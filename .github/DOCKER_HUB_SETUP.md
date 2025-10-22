# Docker Hub 自动发布配置指南

本文档说明如何配置 GitHub Actions 自动构建并发布 Docker 镜像到 Docker Hub。

## 📋 前置要求

1. Docker Hub 账号
2. GitHub 仓库的管理员权限

## 🔐 配置 GitHub Secrets

在 GitHub 仓库中配置以下 secrets：

1. 进入仓库设置：`Settings` → `Secrets and variables` → `Actions`
2. 点击 `New repository secret`
3. 添加以下 secrets：

### 必需的 Secrets

| Secret 名称          | 说明                    | 如何获取                   |
| -------------------- | ----------------------- | -------------------------- |
| `DOCKERHUB_USERNAME` | Docker Hub 用户名       | 你的 Docker Hub 登录用户名 |
| `DOCKERHUB_TOKEN`    | Docker Hub Access Token | 见下方说明                 |

### 获取 Docker Hub Access Token

1. 登录 [Docker Hub](https://hub.docker.com/)
2. 点击右上角头像 → `Account Settings`
3. 选择 `Security` → `Access Tokens`
4. 点击 `New Access Token`
5. 填写描述（如：`GitHub Actions`）
6. 选择权限：`Read, Write, Delete`
7. 点击 `Generate`
8. **立即复制 token**（只显示一次）

## 🚀 工作流程说明

### 触发条件

- **自动触发**：推送到 `main` 分支
- **版本发布**：创建 `v*` 格式的 tag（如 `v1.0.0`）
- **手动触发**：在 Actions 页面手动运行

### 镜像标签策略

工作流会自动创建以下标签：

- `latest`：始终指向 main 分支的最新构建
- `main`：main 分支的构建
- `v1.0.0`：版本标签（当创建 tag 时）
- `1.0`：主次版本标签
- `1`：主版本标签
- `main-sha-xxxxxxx`：包含 commit SHA 的标签

### 支持的平台

- `linux/amd64`：Intel/AMD 架构
- `linux/arm64`：ARM64 架构（如 Apple Silicon, 树莓派等）

## 📦 使用发布的镜像

```bash
# 拉取最新版本
docker pull weishaw/claude-relay-service:latest

# 拉取特定版本
docker pull weishaw/claude-relay-service:v1.0.0

# 运行容器
docker run -d \
  --name claude-relay \
  -p 3000:3000 \
  -v ./data:/app/data \
  -v ./logs:/app/logs \
  -e ADMIN_USERNAME=my_admin \
  -e ADMIN_PASSWORD=my_password \
  weishaw/claude-relay-service:latest
```

## 🔍 验证配置

1. 推送代码到 main 分支
2. 在 GitHub 仓库页面点击 `Actions` 标签
3. 查看 `Docker Build & Push` 工作流运行状态
4. 成功后在 Docker Hub 查看镜像

## 🛡️ 安全功能

- **漏洞扫描**：使用 Trivy 自动扫描镜像漏洞
- **扫描报告**：上传到 GitHub Security 标签页
- **自动更新 README**：同步更新 Docker Hub 的项目描述

## ❓ 常见问题

### 构建失败

- 检查 secrets 是否正确配置
- 确认 Docker Hub token 有足够权限
- 查看 Actions 日志详细错误信息

### 镜像推送失败

- 确认 Docker Hub 用户名正确
- 检查是否达到 Docker Hub 免费账户限制
- Token 可能过期，需要重新生成

### 多平台构建慢

这是正常的，因为需要模拟不同架构。可以在不需要时修改 `platforms` 配置。
