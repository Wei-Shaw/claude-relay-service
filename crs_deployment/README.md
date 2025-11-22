# Claude Relay Service 本地 Docker Compose 部署指南

此目录提供最小可运行的 Compose 配置，默认将服务暴露在宿主机端口 **3030**。以下步骤不会实际运行 Docker，由你执行。

## 1. 前置条件
- 已安装 Docker Engine 与 Docker Compose 插件（v2+）。
- 当前工作目录为项目根目录：`/mnt/e/code/temp/claude-relay-service`。

## 2. 配置环境变量（推荐使用 `.env`）
在 `crs_deployment` 目录创建 `.env`，最少需要填写加密与会话密钥：

```
# 网络与端口
PORT=3030
BIND_HOST=0.0.0.0       # 如需只监听本机，改为 127.0.0.1

# 必填密钥（32 字符随机串）
JWT_SECRET=please_replace_with_32_char_random
ENCRYPTION_KEY=please_replace_with_32_char_random

# 管理控制台（可选）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_me

# 其他可选参数
LOG_LEVEL=info
API_KEY_PREFIX=cr_
REDIS_PASSWORD=
CLAUDE_API_URL=https://api.anthropic.com/v1/messages
CLAUDE_API_VERSION=2023-06-01
CLAUDE_BETA_HEADER=claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14
```

> 提示：`.env` 与 `docker-compose.yml` 位于同一目录时，Compose 会自动加载 `.env`。

**JWT_SECRET / ENCRYPTION_KEY 是做什么的？如何生成？**
- `JWT_SECRET`：用于签名/验证服务颁发的 JWT（管理登录、API Key 等）。
- `ENCRYPTION_KEY`：用于加密服务持久化的敏感数据。
- 要求：两者都使用长度至少 32 字符的高强度随机串。

快速生成示例（任选其一）：
- Linux/macOS/WSL：
  ```bash
  openssl rand -base64 24 | cut -c1-32
  ```
- Python：
  ```bash
  python - <<'PY'
  import secrets, string
  alphabet = string.ascii_letters + string.digits
  print(''.join(secrets.choice(alphabet) for _ in range(32)))
  PY
  ```
- PowerShell：
  ```powershell
  [string]::Join('', (1..32 | % { ([char[]]'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')[(Get-Random -Max 62)] }))
  ```

生成后将值填入 `.env` 的 `JWT_SECRET` 与 `ENCRYPTION_KEY`，并保持私密。

## 3. 启动服务
```bash
cd /mnt/e/code/temp/claude-relay-service/crs_deployment
# 首次会构建镜像并启动容器
docker compose up -d
```

## 4. 验证运行
- 查看容器：`docker compose ps`
- 健康检查：`curl http://localhost:3030/health`

## 5. 停止与清理
- 仅停止：`docker compose down`
- 停止并清空卷数据（会删除 Redis 数据）：`docker compose down -v`

## 6. 数据与日志持久化
- 应用日志：项目根目录 `./logs`
- 应用数据：项目根目录 `./data`
- Redis 数据：项目根目录 `./redis_data`

这些目录在首次启动时会自动创建并挂载，无需手动操作。

## 7. 常见可调参数
- `BIND_HOST`：默认 `0.0.0.0`，若仅本机访问可设为 `127.0.0.1`。
- `PORT`：默认 `3030`，如需更改对外端口直接修改 `.env` 中的值。
- `LOG_LEVEL`：`error|warn|info|debug`。

完成上述配置后即可在宿主机 `http://<BIND_HOST>:3030` 访问 Claude Relay Service。
