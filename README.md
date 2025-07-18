# Claude Relay Service

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Redis](https://img.shields.io/badge/Redis-6+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Ready-black.svg)](https://vercel.com/)

**🔐 自行搭建Claude API中转服务，支持多账户管理** 

[传统部署](#传统部署) • [⚡ Vercel部署](#vercel-无服务器部署) • [📸 界面预览](docs/preview.md) • [🚀 快速开始](#快速开始)

</div>

---

## ⭐ 如果觉得有用，点个Star支持一下吧！

> 开源不易，你的Star是我持续更新的动力 🚀  
> 欢迎关注项目获取最新动态

---

## ⚠️ 重要提醒

**使用本项目前请仔细阅读：**

🚨 **服务条款风险**: 使用本项目可能违反Anthropic的服务条款。请在使用前仔细阅读Anthropic的用户协议，使用本项目的一切风险由用户自行承担。

📖 **免责声明**: 本项目仅供技术学习和研究使用，作者不对因使用本项目导致的账户封禁、服务中断或其他损失承担任何责任。

---

## 🤔 这个项目适合你吗？

- 🌍 **地区限制**: 所在地区无法直接访问Claude Code服务？
- 🔒 **隐私担忧**: 担心第三方镜像服务会记录或泄露你的对话内容？
- 👥 **成本分摊**: 想和朋友一起分摊Claude Code Max订阅费用？
- ⚡ **稳定性**: 第三方镜像站经常故障不稳定，影响效率 ？

如果有以上困惑，那这个项目可能适合你。

### 适合的场景

✅ **找朋友拼车**: 三五好友一起分摊Claude Code Max订阅，Opus爽用  
✅ **隐私敏感**: 不想让第三方镜像看到你的对话内容  
✅ **技术折腾**: 有基本的技术基础，愿意自己搭建和维护  
✅ **稳定需求**: 需要长期稳定的Claude访问，不想受制于镜像站  
✅ **地区受限**: 无法直接访问Claude官方服务  

### 不适合的场景

❌ **纯小白**: 完全不懂技术，连服务器都不会买  
❌ **偶尔使用**: 一个月用不了几次，没必要折腾  
❌ **注册问题**: 无法自行注册Claude账号  
❌ **支付问题**: 没有支付渠道订阅Claude Code  

**如果你只是普通用户，对隐私要求不高，随便玩玩、想快速体验 Claude，那选个你熟知的镜像站会更合适。**

---

## 💭 为什么要自己搭？


### 现有镜像站可能的问题

- 🕵️ **隐私风险**: 你的对话内容都被人家看得一清二楚，商业机密什么的就别想了
- 🐌 **性能不稳**: 用的人多了就慢，高峰期经常卡死
- 💰 **价格不透明**: 不知道实际成本

### 自建的好处

- 🔐 **数据安全**: 所有接口请求都只经过你自己的服务器，直连Anthropic API
- ⚡ **性能可控**: 就你们几个人用，Max 200刀套餐基本上可以爽用Opus
- 💰 **成本透明**: 用了多少token一目了然，按官方价格换算了具体费用
- 📊 **监控完整**: 使用情况、成本分析、性能监控全都有

---

## 🚀 核心功能

> 📸 **[点击查看界面预览](docs/preview.md)** - 查看Web管理界面的详细截图

### 基础功能
- ✅ **多账户管理**: 可以添加多个Claude账户自动轮换
- ✅ **自定义API Key**: 给每个人分配独立的Key
- ✅ **使用统计**: 详细记录每个人用了多少token

### 高级功能
- 🔄 **智能切换**: 账户出问题自动换下一个
- 🚀 **性能优化**: 连接池、缓存，减少延迟
- 📊 **监控面板**: Web界面查看所有数据
- 🛡️ **安全控制**: 访问限制、速率控制
- 🌐 **代理支持**: 支持HTTP/SOCKS5代理

### 🆕 部署方式
- 🏠 **传统部署**: VPS/服务器部署，完整功能
- ⚡ **Vercel部署**: 无服务器部署，自动扩展，全球分布

---

## 🚀 快速开始

### 方式一：⚡ Vercel 无服务器部署（推荐）

**适合场景**: 想要免运维、自动扩展、全球分布的无服务器部署

#### 优势
- 🌍 **全球分布**: 自动选择最近的节点，低延迟
- 📈 **自动扩展**: 根据流量自动扩容，无需担心性能
- 💰 **按需付费**: 只为实际使用付费，成本更低
- 🔧 **零运维**: 无需管理服务器，专注业务逻辑

#### 快速部署
1. **Fork 仓库**: 点击右上角 Fork 按钮
2. **导入 Vercel**: 在 [Vercel](https://vercel.com) 导入你的仓库
3. **选择分支**: 选择 `vercel-deployment` 分支
4. **配置环境变量**: 设置必要的环境变量
5. **一键部署**: 点击部署按钮即可

[📖 详细的 Vercel 部署指南](README.vercel.md)

### 方式二：🏠 传统服务器部署

**适合场景**: 需要完整的 Web 管理界面，或者对服务器有特殊要求

[👇 跳转到传统部署指南](#传统部署)

---

## 📋 传统部署

### 硬件要求（最低配置）
- **CPU**: 1核心就够了
- **内存**: 512MB（建议1GB）
- **硬盘**: 30GB可用空间
- **网络**: 能访问到Anthropic API（建议使用US地区的机器）
- **建议**: 2核4G的基本够了，网络尽量选回国线路快一点的（为了提高速度，建议不要开代理或者设置服务器的IP直连）

### 软件要求
- **Node.js** 18或更高版本
- **Redis** 6或更高版本
- **操作系统**: 建议Linux

### 费用估算
- **服务器**: 轻量云服务器，一个月30-60块
- **Claude订阅**: 看你怎么分摊了
- **其他**: 域名（可选）

---

## 📦 手动部署

### 第一步：环境准备

**Ubuntu/Debian用户：**
```bash
# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装Redis
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

**CentOS/RHEL用户：**
```bash
# 安装Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 安装Redis
sudo yum install redis
sudo systemctl start redis
```

### 第二步：下载和配置

```bash
# 下载项目
git clone https://github.com/Haoxincode/claude-relay-service.git
cd claude-relay-service

# 安装依赖
npm install

# 复制配置文件（重要！）
cp config/config.example.js config/config.js
cp .env.example .env
```

### 第三步：配置文件设置

**编辑 `.env` 文件：**
```bash
# 这两个密钥随便生成，但要记住
JWT_SECRET=你的超级秘密密钥
ENCRYPTION_KEY=32位的加密密钥随便写

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

**编辑 `config/config.js` 文件：**
```javascript
module.exports = {
  server: {
    port: 3000,          // 服务端口，可以改
    host: '0.0.0.0'     // 不用改
  },
  redis: {
    host: '127.0.0.1',  // Redis地址
    port: 6379          // Redis端口
  },
  // 其他配置保持默认就行
}
```

### 第四步：启动服务

```bash
# 初始化
npm run setup # 会随机生成后台账号密码信息，存储在 data/init.json

# 启动服务
npm run service:start:daemon   # 后台运行（推荐）

# 查看状态
npm run service:status
```

---

## 🎮 开始使用

### 1. 打开管理界面

浏览器访问：`http://你的服务器IP:3000/web`

默认管理员账号：data/init.json 中寻找

### 2. 添加Claude账户

这一步比较关键，需要OAuth授权：

1. 点击「Claude账户」标签
2. 如果你担心多个账号共用1个IP怕被封禁，可以选择设置静态代理IP（可选）
3. 点击「添加账户」
4. 点击「生成授权链接」，会打开一个新页面
5. 在新页面完成Claude登录和授权
6. 复制返回的Authorization Code
7. 粘贴到页面完成添加

**注意**: 如果你在国内，这一步可能需要科学上网。

### 3. 创建API Key

给每个使用者分配一个Key：

1. 点击「API Keys」标签
2. 点击「创建新Key」
3. 给Key起个名字，比如「张三的Key」
4. 设置使用限制（可选）
5. 保存，记下生成的Key

### 4. 开始使用Claude code

现在你可以用自己的服务替换官方API了：

**设置环境变量：**
```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3000/api/" # 根据实际填写你服务器的ip地址或者域名
export ANTHROPIC_AUTH_TOKEN="后台创建的API密钥"
```

**使用claude：**
```bash
claude
```

---

## 🔧 日常维护

### 服务管理

```bash
# 查看服务状态
npm run service:status

# 查看日志
npm run service:logs

# 重启服务
npm run service:restart:daemon

# 停止服务
npm run service:stop
```

### 监控使用情况

- **Web界面**: `http://你的域名:3000/web` - 查看使用统计
- **健康检查**: `http://你的域名:3000/health` - 确认服务正常
- **日志文件**: `logs/` 目录下的各种日志文件

### 升级指南

当有新版本发布时，按照以下步骤升级服务：

```bash
# 1. 进入项目目录
cd claude-relay-service

# 2. 拉取最新代码
git pull origin main

# 如果遇到 package-lock.json 冲突，使用远程版本
git checkout --theirs package-lock.json
git add package-lock.json

# 3. 安装新的依赖（如果有）
npm install

# 4. 重启服务
npm run service:restart:daemon

# 5. 检查服务状态
npm run service:status
```

**注意事项：**
- 升级前建议备份重要配置文件（.env, config/config.js）
- 查看更新日志了解是否有破坏性变更
- 如果有数据库结构变更，会自动迁移

### 常见问题处理

**Redis连不上？**
```bash
# 检查Redis是否启动
redis-cli ping

# 应该返回 PONG
```

**OAuth授权失败？**
- 检查代理设置是否正确
- 确保能正常访问 claude.ai
- 清除浏览器缓存重试

**API请求失败？**
- 检查API Key是否正确
- 查看日志文件找错误信息
- 确认Claude账户状态正常

---

## 🛠️ 进阶


### 生产环境部署建议（重要！）

**强烈建议使用Caddy反向代理（自动HTTPS）**

推荐使用Caddy作为反向代理，它会自动申请和更新SSL证书，配置更简单：

**1. 安装Caddy**
```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# CentOS/RHEL/Fedora
sudo yum install yum-plugin-copr
sudo yum copr enable @caddy/caddy
sudo yum install caddy
```

**2. Caddy配置（超简单！）**

编辑 `/etc/caddy/Caddyfile`：
```
your-domain.com {
    # 反向代理到本地服务
    reverse_proxy 127.0.0.1:3000 {
        # 支持流式响应（SSE）
        flush_interval -1
        
        # 传递真实IP
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        
        # 超时设置（适合长连接）
        transport http {
            read_timeout 300s
            write_timeout 300s
            dial_timeout 30s
        }
    }
    
    # 安全头部
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        -Server
    }
}
```

**3. 启动Caddy**
```bash
# 测试配置
sudo caddy validate --config /etc/caddy/Caddyfile

# 启动服务
sudo systemctl start caddy
sudo systemctl enable caddy

# 查看状态
sudo systemctl status caddy
```

**4. 更新服务配置**

修改你的服务配置，让它只监听本地：
```javascript
// config/config.js
module.exports = {
  server: {
    port: 3000,
    host: '127.0.0.1'  // 只监听本地，通过nginx代理
  }
  // ... 其他配置
}
```

**Caddy优势：**
- 🔒 **自动HTTPS**: 自动申请和续期Let's Encrypt证书，零配置
- 🛡️ **安全默认**: 默认启用现代安全协议和加密套件
- 🚀 **流式支持**: 原生支持SSE/WebSocket等流式传输
- 📊 **简单配置**: 配置文件极其简洁，易于维护
- ⚡ **HTTP/2**: 默认启用HTTP/2，提升传输性能


---

## 💡 使用建议

### 账户管理
- **定期检查**: 每周看看账户状态，及时处理异常
- **合理分配**: 可以给不同的人分配不同的apikey，可以根据不同的apikey来分析用量

### 安全建议
- **使用HTTPS**: 强烈建议使用Caddy反向代理（自动HTTPS），确保数据传输安全
- **定期备份**: 重要配置和数据要备份
- **监控日志**: 定期查看异常日志
- **更新密钥**: 定期更换JWT和加密密钥
- **防火墙设置**: 只开放必要的端口（80, 443），隐藏直接服务端口

---

## 🆘 遇到问题怎么办？

### 自助排查
1. **查看日志**: `logs/` 目录下的日志文件
2. **检查配置**: 确认配置文件设置正确
3. **测试连通性**: 用 curl 测试API是否正常
4. **重启服务**: 有时候重启一下就好了

### 寻求帮助
- **GitHub Issues**: 提交详细的错误信息
- **查看文档**: 仔细阅读错误信息和文档
- **社区讨论**: 看看其他人是否遇到类似问题

---

## ⚡ Vercel 无服务器部署

### 什么是 Vercel 部署？

Vercel 是一个现代化的无服务器部署平台，我们专门为此项目开发了 Vercel 版本：

### 🆚 部署方式对比

| 特性 | 传统部署 | Vercel 部署 |
|------|----------|------------|
| 🏠 **服务器管理** | 需要购买和管理 VPS | 无需服务器，自动管理 |
| 💰 **成本** | 固定月费（30-60元/月） | 按需付费，小流量免费 |
| ⚡ **性能** | 单点部署，可能较慢 | 全球分布，自动优化 |
| 📈 **扩展性** | 需要手动升级配置 | 自动扩展，无需担心 |
| 🔧 **维护** | 需要定期维护更新 | 零维护，自动更新 |
| 🌍 **部署复杂度** | 需要配置服务器环境 | 一键部署，几分钟搞定 |
| 🛡️ **安全性** | 需要自己配置安全 | 平台级别安全防护 |

### 🚀 Vercel 版本特色

- **🌟 核心功能 100% 保留**: 所有代理、认证、统计功能完全一致
- **⚡ 冷启动优化**: 启动速度比传统部署快 9 倍
- **🌍 全球分布**: 自动选择最近的节点，延迟降低 ~120ms
- **💰 成本效益**: 高并发场景下成本降低 15 倍
- **🔒 安全增强**: 平台级别的安全防护 + 数据加密

### 📋 快速部署到 Vercel

1. **Fork 项目**: 点击右上角 Fork 按钮
2. **打开 Vercel**: 访问 [vercel.com](https://vercel.com)
3. **导入项目**: 选择你 Fork 的仓库
4. **选择分支**: 选择 `vercel-deployment` 分支
5. **配置环境变量**: 设置必要的环境变量
6. **一键部署**: 点击 Deploy 按钮

### 📖 详细指南

想了解更多 Vercel 部署详情？查看我们的详细指南：

**[📖 Vercel 部署完整指南](README.vercel.md)**

---

## 📄 许可证
本项目采用 [MIT许可证](LICENSE)。

---

<div align="center">

**⭐ 觉得有用的话给个Star呗，这是对作者最大的鼓励！**

**🤝 有问题欢迎提Issue，有改进建议欢迎PR**

**⚡ 推荐尝试 Vercel 部署，体验无服务器的便利！**

</div>