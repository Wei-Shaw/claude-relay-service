# 🚀 Claude Relay Service 生产部署指南 (小白全流程)

本指南面向**完全从零开始**的部署场景。通过 5 步完成部署，无需手动生成密钥。

---

## � 第一步：本地打包 (开发者操作)

> ⚠️ 请勿直接压缩整个文件夹，会泄露订阅链接和密钥！

在**本地项目根目录**运行以下命令（Windows PowerShell / Git Bash 均可直接运行）：

```bash
tar --exclude='node_modules' --exclude='.git' --exclude='logs' --exclude='data' --exclude='redis_data' --exclude='*.log' --exclude='*.bak*' --exclude='*.gz' --exclude='*.zip' --exclude='deploy/.env' --exclude='deploy/update_subscription.sh' --exclude='deploy/clash/config.yaml' --exclude='deploy/clash/static_proxies.yaml' -czf deploy.tar.gz src deploy config scripts cli resources web Dockerfile docker-entrypoint.sh package.json package-lock.json pnpm-lock.yaml Makefile nodemon.json VERSION README.md README_EN.md AGENTS.md DEPLOY.md .dockerignore .gitignore .env.example
```

---

## 📤 第二步：上传与解压

1. 将 `deploy.tar.gz` 上传至服务器（用 FTP 或 scp）：
   ```bash
   scp deploy.tar.gz 你的用户名@服务器IP:/tmp/deploy.tar.gz
   ```

2. 登录服务器 SSH，创建部署目录并解压：
   ```bash
   mkdir -p /www/wwwroot/claude-relay-service
   tar -xzf /tmp/deploy.tar.gz -C /www/wwwroot/claude-relay-service
   ```

---

## 🛠️ 第三步：一键初始化配置 🔴

> 这步会自动生成密钥，无需手动填写。

```bash
cd /www/wwwroot/claude-relay-service/deploy
bash init_config.sh
```

**脚本自动完成**：
- ✅ 随机生成 `JWT_SECRET`（登录密钥）
- ✅ 随机生成 32 位 `ENCRYPTION_KEY`（数据加密密钥）
- ✅ 创建 `.env`、`update_subscription.sh`、`clash/config.yaml`

> 如果你想自定义管理员账号密码，可以编辑 `.env`，找到以下两行解注释并填写（否则系统会随机生成并打印在启动日志里）：
> ```
> # ADMIN_USERNAME=admin
> # ADMIN_PASSWORD=your-secure-password
> ```

---

## 📝 第四步：填写机场订阅链接 🔴

> 这是唯一需要手动填写的地方，不填则代理功能不可用。

```bash
vi update_subscription.sh
```

找到以下两行，填入你的机场订阅地址：
```bash
SUB_URL_1="你的机场订阅链接"
SUB_URL_2=""   # 可填第二个订阅，两个订阅的节点会自动合并
```

> **💡 防拦截**：脚本已内置 `UA="ClashForAndroid/2.5.12"` 伪装 User-Agent，可绕过大多数机场的 Cloudflare 拦截。

填好后执行一次，拉取并生效：
```bash
bash update_subscription.sh
```

---

## 🚀 第五步：构建并启动服务

```bash
# 首次启动（构建镜像约需 2-5 分钟）
docker-compose -f docker-compose.prod.yml up -d --build

# 验证服务是否正常（替换 7250 为你的端口）
curl http://localhost:7250/health
```

---

## 📋 常用运维命令

```bash
# 查看所有容器状态
docker-compose -f docker-compose.prod.yml ps

# 查看应用日志（实时）
docker-compose -f docker-compose.prod.yml logs -f claude-relay

# 查看 Clash 代理日志
docker-compose -f docker-compose.prod.yml logs -f clash

# 更新订阅（节点有变化时）
bash update_subscription.sh

# 重启服务
docker-compose -f docker-compose.prod.yml restart

# 停止服务
docker-compose -f docker-compose.prod.yml down
```

---

## 📒 核心变量速查

| 文件 | 变量 | 必填 | 说明 |
|---|---|:---:|---|
| `.env` | `JWT_SECRET` | 🔴 | 登录密钥（init 脚本自动生成） |
| `.env` | `ENCRYPTION_KEY` | 🔴 | 32位数据加密密钥（init 脚本自动生成） |
| `.env` | `PORT` | ❌ | 外部访问端口（默认 3000） |
| `.env` | `ADMIN_USERNAME` | ❌ | 管理员账号（留空则随机生成） |
| `.env` | `ADMIN_PASSWORD` | ❌ | 管理员密码（留空则随机生成） |
| `update_subscription.sh` | `SUB_URL_1` | 🔴 | 机场订阅链接（不填代理不可用） |
| `update_subscription.sh` | `SUB_URL_2` | ❌ | 第二个订阅（支持多机场合并） |

---

## 🏗️ 服务架构说明

```
外部请求 (7250端口)
      │
      ▼
Claude Relay Service (容器内 :3000)
      │                     │
      ▼                     ▼
  Clash Proxy           Redis
  (:7890 代理)        (会话/缓存)
      │
      ▼
  Claude/Google API (国外)
```

- Clash 仅在 Docker 内网暴露，不影响宿主机其他服务
- 当上游 API 返回 502/504 时，系统会自动触发测速并切换最快节点
- Redis 用于会话管理和接口统计缓存

---

## ❓ 常见问题

**Q: 启动日志里找不到管理员密码？**
```bash
docker logs claude-relay-service 2>&1 | grep -i "admin"
```

**Q: 订阅下载失败（Cloudflare 拦截）？**
确认 `update_subscription.sh` 中 `UA="ClashForAndroid/2.5.12"` 存在即可。

**Q: Clash 容器启动失败？**
```bash
docker-compose -f docker-compose.prod.yml logs clash
```
通常是 `clash/config.yaml` 格式错误或没有有效节点。

**Q: 定时更新订阅（每天凌晨 4 点）？**
```bash
crontab -e
# 添加：
0 4 * * * /bin/bash /www/wwwroot/claude-relay-service/deploy/update_subscription.sh >> /tmp/clash_update.log 2>&1
```

---

**最后更新**: 2026-03-10
