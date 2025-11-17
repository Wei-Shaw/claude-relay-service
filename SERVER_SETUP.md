# 服务器初始化设置指南

本指南帮助你在服务器上首次配置 Claude Relay Service。

## 问题诊断

如果你看到类似错误：
```
Error: Cannot find module '../config/config'
```

这是因为 `.env` 文件或 `config/config.js` 文件缺失。按照下面的步骤解决。

---

## 快速设置步骤

### 1. SSH 登录到服务器

```bash
ssh user@your-server-ip
cd /home/user/claude-relay-service  # 替换为你的项目路径
```

### 2. 创建 .env 配置文件

```bash
# 从示例文件复制
cp .env.example .env

# 编辑配置文件
nano .env  # 或使用 vim
```

**必须配置的环境变量**（最小化配置）：

```bash
# 生成 JWT_SECRET（32字符以上随机字符串）
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 生成 ENCRYPTION_KEY（32字符固定长度）
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # 如果 Redis 没有密码就留空

# 服务器配置
PORT=3000
NODE_ENV=production
```

**一键生成配置**（推荐）：

```bash
# 复制示例文件
cp .env.example .env

# 自动生成密钥并替换
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

# 使用 sed 替换占位符
sed -i "s/your-jwt-secret-here/$JWT_SECRET/" .env
sed -i "s/your-encryption-key-here/$ENCRYPTION_KEY/" .env
sed -i "s/NODE_ENV=production/NODE_ENV=production/" .env

echo "✅ .env 文件已配置"
echo "JWT_SECRET: $JWT_SECRET"
echo "ENCRYPTION_KEY: $ENCRYPTION_KEY"
```

### 3. 创建 config/config.js（自动）

部署脚本现在会自动从 `config.example.js` 创建这个文件，无需手动操作。

但如果你想手动创建：

```bash
cp config/config.example.js config/config.js
```

### 4. 验证 Redis 是否运行

```bash
# 检查 Redis 状态
redis-cli ping
# 应该返回 PONG

# 如果 Redis 未运行，启动它
sudo systemctl start redis
sudo systemctl enable redis
```

### 5. 运行初始化设置

```bash
# 安装依赖
npm install

# 运行设置脚本（生成管理员账户）
npm run setup
```

**保存管理员凭据**！你会看到类似输出：
```
管理员用户名: cr_admin_xxxxxx
管理员密码:   xxxxxxxxxx
```

### 6. 手动测试启动

```bash
# 尝试启动服务
npm run service:start:daemon

# 等待几秒后检查状态
npm run service:status

# 查看日志
tail -f logs/service.log
tail -f logs/service-error.log
```

### 7. 验证服务健康

```bash
# 健康检查
curl http://localhost:3000/health

# 应该返回类似：
# {"status":"healthy","service":"claude-relay-service",...}
```

---

## 完整的初始化脚本

将以下内容保存为 `server-init.sh` 并在服务器上运行：

```bash
#!/bin/bash

set -e

echo "🚀 开始初始化 Claude Relay Service..."

# 1. 创建 .env 文件
if [ ! -f ".env" ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env

    # 生成密钥
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

    # 替换占位符
    sed -i "s/your-jwt-secret-here/$JWT_SECRET/" .env
    sed -i "s/your-encryption-key-here/$ENCRYPTION_KEY/" .env
    sed -i "s/NODE_ENV=production/NODE_ENV=production/" .env

    echo "✅ .env 文件已创建"
else
    echo "✅ .env 文件已存在"
fi

# 2. 创建 config.js
if [ ! -f "config/config.js" ]; then
    echo "📝 创建 config/config.js..."
    cp config/config.example.js config/config.js
    echo "✅ config/config.js 已创建"
else
    echo "✅ config/config.js 已存在"
fi

# 3. 检查 Redis
echo "🔍 检查 Redis..."
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis 运行正常"
else
    echo "❌ Redis 未运行！请启动 Redis: sudo systemctl start redis"
    exit 1
fi

# 4. 安装依赖
echo "📦 安装依赖..."
npm install

# 5. 运行初始化
echo "⚙️  运行初始化设置..."
npm run setup

echo ""
echo "✅ 初始化完成！"
echo ""
echo "📌 接下来："
echo "1. 启动服务: npm run service:start:daemon"
echo "2. 检查状态: npm run service:status"
echo "3. 查看日志: tail -f logs/service.log"
echo ""
```

使用方法：

```bash
# 赋予执行权限
chmod +x server-init.sh

# 运行初始化
./server-init.sh
```

---

## 故障排除

### 问题 1: Cannot find module '../config/config'

**原因**：`config/config.js` 文件缺失

**解决**：
```bash
cp config/config.example.js config/config.js
```

### 问题 2: JWT_SECRET is required

**原因**：`.env` 文件缺失或配置不完整

**解决**：按照上面"步骤 2"重新配置 `.env`

### 问题 3: Redis connection failed

**原因**：Redis 未运行或连接配置错误

**解决**：
```bash
# 检查 Redis
sudo systemctl status redis

# 启动 Redis
sudo systemctl start redis

# 测试连接
redis-cli ping
```

### 问题 4: 服务启动后立即退出

**原因**：通常是配置错误或端口占用

**解决**：
```bash
# 查看详细错误日志
cat logs/service-error.log

# 检查端口占用
sudo netstat -tlnp | grep 3000
# 或
sudo lsof -i :3000
```

---

## 自动部署注意事项

配置好服务器后，每次推送代码到 GitHub 都会自动部署：

1. **自动创建 config.js**：部署脚本会自动从示例文件创建
2. **.env 不会被覆盖**：你的环境变量配置会保留
3. **自动备份**：每次部署前会备份当前代码
4. **健康检查**：部署后会自动验证服务是否正常

---

## 验证清单

部署前确认：

- [ ] `.env` 文件已创建并配置正确
- [ ] Redis 正在运行
- [ ] Node.js 版本 >= 18.0.0
- [ ] 端口 3000 未被占用（或修改 PORT 配置）
- [ ] 已运行 `npm run setup` 生成管理员账户
- [ ] 可以访问 `http://your-server-ip:3000/health`

完成后，推送代码即可自动部署！ 🚀
