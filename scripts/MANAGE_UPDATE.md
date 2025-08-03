# manage.sh 脚本更新说明

## 新增功能（最新更新）

### 1. 端口配置
- 安装时会询问服务端口，默认为 3000
- 端口配置会自动写入 .env 文件
- 检查端口是否被占用并提示

### 2. 自动启动服务
- 安装完成后自动启动服务
- 不再需要手动执行 `crs start`

### 3. 公网 IP 显示
- 自动获取公网 IP 地址（通过 https://ipinfo.io/json）
- 显示本地访问和公网访问地址
- IP 地址缓存 1 小时，避免频繁调用 API

### 4. 动态端口显示
- 所有状态显示都使用实际配置的端口
- 交互式菜单显示实际端口和公网地址

## 使用示例

### 安装时的新体验
```bash
$ crs install

# 会依次询问：
安装目录 (默认: ~/claude-relay-service): 
服务端口 (默认: 3000): 8080
Redis 地址 (默认: localhost): 
Redis 端口 (默认: 6379): 
Redis 密码 (默认: 无密码): 

# 安装完成后自动启动并显示：
服务已成功安装并启动！

访问地址：
  本地访问: http://localhost:8080/web
  公网访问: http://1.2.3.4:8080/web

管理命令：
  查看状态: crs status
  停止服务: crs stop
  重启服务: crs restart
```

### 状态显示增强
```bash
$ crs status

=== Claude Relay Service 状态 ===
服务状态: 运行中
进程 PID: 12345
服务端口: 8080

访问地址:
  本地访问: http://localhost:8080/web
  公网访问: http://1.2.3.4:8080/web
  API 端点: http://localhost:8080/api/v1

安装目录: /home/user/claude-relay-service

Redis 状态:
  连接状态: 正常
```

## 技术细节

### 公网 IP 获取
- 主要 API: https://ipinfo.io/json
- 备用 API: https://api.ipify.org
- 缓存文件: /tmp/.crs_public_ip_cache
- 缓存时间: 3600 秒（1 小时）

### 端口配置存储
- 配置文件: .env
- 环境变量: PORT
- 读取优先级: 命令行参数 > .env 文件 > 默认值 3000

## Redis 安装说明

### 系统默认安装位置
脚本使用系统包管理器安装 Redis，会自动安装到各系统的默认位置：

- **Debian/Ubuntu**:
  - 配置文件: `/etc/redis/redis.conf`
  - 数据目录: `/var/lib/redis`
  - 日志文件: `/var/log/redis/redis-server.log`
  - 通过 systemd 管理: `systemctl status redis-server`

- **RedHat/CentOS**:
  - 配置文件: `/etc/redis.conf`
  - 数据目录: `/var/lib/redis`
  - 日志文件: `/var/log/redis/redis.log`
  - 通过 systemd 管理: `systemctl status redis`

- **Arch Linux**:
  - 配置文件: `/etc/redis/redis.conf`
  - 数据目录: `/var/lib/redis`
  - 通过 systemd 管理: `systemctl status redis`

- **macOS**:
  - 通过 Homebrew 安装
  - 配置文件: `/usr/local/etc/redis.conf`
  - 数据目录: `/usr/local/var/db/redis/`
  - 通过 brew services 管理: `brew services list`

### 优势
- Redis 数据独立于应用，卸载应用不会丢失数据
- 使用系统标准服务管理
- 自动开机启动
- 系统级的日志和监控