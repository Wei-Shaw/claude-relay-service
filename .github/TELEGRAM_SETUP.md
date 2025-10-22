# Telegram 自动通知设置指南

## 📋 概述

当 GitHub Actions 自动发布新版本时，系统会自动发送通知到你的 Telegram 频道。

## 🚀 设置步骤

### 1. 创建 Telegram Bot

1. 在 Telegram 中找到 [@BotFather](https://t.me/botfather)
2. 发送 `/newbot` 命令
3. 按提示设置 Bot 名称（例如：Claude Relay Updates）
4. 设置 Bot 用户名（例如：claude_relay_bot）
5. **保存 Bot Token**（格式类似：`1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`）

### 2. 创建或选择 Telegram 频道

1. 创建一个新频道或使用现有频道
2. 将你的 Bot 添加为频道管理员：
   - 进入频道设置
   - 管理员 → 添加管理员
   - 搜索你的 Bot 用户名
   - 赋予发送消息权限

### 3. 获取频道 Chat ID

有几种方法获取频道的 Chat ID：

#### 方法 1：使用 Web Telegram

1. 打开 https://web.telegram.org
2. 进入你的频道
3. 查看 URL，格式为：`https://web.telegram.org/k/#-1234567890`
4. Chat ID 就是 `#` 后面的数字（包括负号）：`-1234567890`

#### 方法 2：使用 Bot API

1. 先在频道发送一条消息
2. 访问：`https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. 找到你的频道消息，查看 `chat.id` 字段

#### 方法 3：使用频道用户名

如果频道是公开的，可以直接使用 `@频道用户名` 作为 Chat ID

### 4. 添加 GitHub Secrets

1. 访问你的 GitHub 仓库
2. 进入 Settings → Secrets and variables → Actions
3. 点击 "New repository secret"
4. 添加以下两个 Secrets：

   **TELEGRAM_BOT_TOKEN**
   - Name: `TELEGRAM_BOT_TOKEN`
   - Value: 你的 Bot Token（例如：`1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`）

   **TELEGRAM_CHAT_ID**
   - Name: `TELEGRAM_CHAT_ID`
   - Value: 你的频道 Chat ID（例如：`-1234567890` 或 `@your_channel`）

## ✅ 测试配置

配置完成后，下次推送到 main 分支时，你的 Telegram 频道将收到类似这样的通知：

```
🚀 Claude Relay Service 新版本发布！

📦 版本号: 1.1.3

📝 更新内容:
- feat: 添加 Telegram 自动通知功能
- fix: 修复某个问题

🐳 Docker 部署:
docker pull weishaw/claude-relay-service:v1.1.3
docker pull weishaw/claude-relay-service:latest

🔗 相关链接:
• GitHub Release
• 完整更新日志
• Docker Hub

#ClaudeRelay #Update #v1_1_3
```

## 🔧 自定义通知

如果你想修改通知格式，编辑 `.github/workflows/auto-release.yml` 中的 `Send Telegram Notification` 步骤。

## ❓ 常见问题

### Q: 通知发送失败怎么办？

检查：

1. Bot Token 是否正确
2. Bot 是否已添加为频道管理员
3. Chat ID 是否正确（注意负号）
4. GitHub Secrets 是否正确配置

### Q: 可以发送到多个频道吗？

可以修改工作流，添加多个通知步骤，或使用逗号分隔多个 Chat ID。

### Q: 通知失败会影响版本发布吗？

不会。通知步骤配置了 `continue-on-error: true`，即使通知失败也不会影响版本发布。

## 🔐 安全提示

- **永远不要**在代码中直接写入 Bot Token
- 始终使用 GitHub Secrets 存储敏感信息
- 定期更换 Bot Token 以保证安全
