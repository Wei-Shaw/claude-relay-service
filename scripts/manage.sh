#!/bin/bash

# Claude Relay Service 管理脚本
# 用于安装、更新、卸载、启动、停止、重启服务
# 可以使用 crs 快捷命令调用

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'  # 改为青色（Cyan），更易读
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 默认配置
DEFAULT_INSTALL_DIR="$HOME/claude-relay-service"
DEFAULT_REDIS_HOST="localhost"
DEFAULT_REDIS_PORT="6379"
DEFAULT_REDIS_PASSWORD=""
DEFAULT_APP_PORT="3000"

# 全局变量
INSTALL_DIR=""
APP_DIR=""
REDIS_HOST=""
REDIS_PORT=""
REDIS_PASSWORD=""
APP_PORT=""
PUBLIC_IP_CACHE_FILE="/tmp/.crs_public_ip_cache"
PUBLIC_IP_CACHE_DURATION=3600  # 1小时缓存

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 检测操作系统
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/debian_version ]; then
            OS="debian"
            PACKAGE_MANAGER="apt-get"
        elif [ -f /etc/redhat-release ]; then
            OS="redhat"
            PACKAGE_MANAGER="yum"
        elif [ -f /etc/arch-release ]; then
            OS="arch"
            PACKAGE_MANAGER="pacman"
        else
            OS="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        PACKAGE_MANAGER="brew"
    else
        OS="unknown"
    fi
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查端口是否被占用
check_port() {
    local port=$1
    if command_exists lsof; then
        lsof -i ":$port" >/dev/null 2>&1
    elif command_exists netstat; then
        netstat -tuln | grep ":$port " >/dev/null 2>&1
    elif command_exists ss; then
        ss -tuln | grep ":$port " >/dev/null 2>&1
    else
        return 1
    fi
}

# 生成随机字符串
generate_random_string() {
    local length=$1
    if command_exists openssl; then
        openssl rand -hex $((length/2))
    else
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w $length | head -n 1
    fi
}

# 获取公网IP
get_public_ip() {
    local cached_ip=""
    local cache_age=0
    
    # 检查缓存
    if [ -f "$PUBLIC_IP_CACHE_FILE" ]; then
        local current_time=$(date +%s)
        local cache_time=$(stat -c %Y "$PUBLIC_IP_CACHE_FILE" 2>/dev/null || stat -f %m "$PUBLIC_IP_CACHE_FILE" 2>/dev/null || echo 0)
        cache_age=$((current_time - cache_time))
        
        if [ $cache_age -lt $PUBLIC_IP_CACHE_DURATION ]; then
            cached_ip=$(cat "$PUBLIC_IP_CACHE_FILE" 2>/dev/null)
            if [ -n "$cached_ip" ]; then
                echo "$cached_ip"
                return 0
            fi
        fi
    fi
    
    # 获取新的公网IP
    local public_ip=""
    if command_exists curl; then
        public_ip=$(curl -s --connect-timeout 5 https://ipinfo.io/json | grep -o '"ip":"[^"]*"' | cut -d'"' -f4 2>/dev/null)
    elif command_exists wget; then
        public_ip=$(wget -qO- --timeout=5 https://ipinfo.io/json | grep -o '"ip":"[^"]*"' | cut -d'"' -f4 2>/dev/null)
    fi
    
    # 如果获取失败，尝试备用API
    if [ -z "$public_ip" ]; then
        if command_exists curl; then
            public_ip=$(curl -s --connect-timeout 5 https://api.ipify.org 2>/dev/null)
        elif command_exists wget; then
            public_ip=$(wget -qO- --timeout=5 https://api.ipify.org 2>/dev/null)
        fi
    fi
    
    # 保存到缓存
    if [ -n "$public_ip" ]; then
        echo "$public_ip" > "$PUBLIC_IP_CACHE_FILE"
        echo "$public_ip"
    else
        echo "localhost"
    fi
}

# 检查Node.js版本
check_node_version() {
    if ! command_exists node; then
        return 1
    fi
    
    local node_version=$(node -v | sed 's/v//')
    local major_version=$(echo $node_version | cut -d. -f1)
    
    if [ "$major_version" -lt 18 ]; then
        return 1
    fi
    
    return 0
}

# 安装Node.js 18+
install_nodejs() {
    print_info "开始安装 Node.js 18+"
    
    case $OS in
        "debian")
            # 使用 NodeSource 仓库
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo $PACKAGE_MANAGER install -y nodejs
            ;;
        "redhat")
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo $PACKAGE_MANAGER install -y nodejs
            ;;
        "arch")
            sudo $PACKAGE_MANAGER -S --noconfirm nodejs npm
            ;;
        "macos")
            if ! command_exists brew; then
                print_error "请先安装 Homebrew: https://brew.sh"
                return 1
            fi
            brew install node@18
            ;;
        *)
            print_error "不支持的操作系统，请手动安装 Node.js 18+"
            return 1
            ;;
    esac
    
    # 验证安装
    if check_node_version; then
        print_success "Node.js 安装成功: $(node -v)"
        return 0
    else
        print_error "Node.js 安装失败或版本不符合要求"
        return 1
    fi
}

# 安装基础依赖
install_dependencies() {
    print_info "检查并安装基础依赖..."
    
    local deps_to_install=()
    
    # 检查 git
    if ! command_exists git; then
        deps_to_install+=("git")
    fi
    
    # 检查其他基础工具
    case $OS in
        "debian"|"redhat")
            if ! command_exists curl; then
                deps_to_install+=("curl")
            fi
            if ! command_exists wget; then
                deps_to_install+=("wget")
            fi
            if ! command_exists lsof; then
                deps_to_install+=("lsof")
            fi
            ;;
    esac
    
    # 安装缺失的依赖
    if [ ${#deps_to_install[@]} -gt 0 ]; then
        print_info "需要安装: ${deps_to_install[*]}"
        case $OS in
            "debian")
                sudo $PACKAGE_MANAGER update
                sudo $PACKAGE_MANAGER install -y "${deps_to_install[@]}"
                ;;
            "redhat")
                sudo $PACKAGE_MANAGER install -y "${deps_to_install[@]}"
                ;;
            "arch")
                sudo $PACKAGE_MANAGER -S --noconfirm "${deps_to_install[@]}"
                ;;
            "macos")
                brew install "${deps_to_install[@]}"
                ;;
        esac
    fi
    
    # 检查 Node.js
    if ! check_node_version; then
        print_warning "未检测到 Node.js 18+ 版本"
        install_nodejs || return 1
    else
        print_success "Node.js 版本检查通过: $(node -v)"
    fi
    
    # 检查 npm
    if ! command_exists npm; then
        print_error "npm 未安装"
        return 1
    else
        print_success "npm 版本: $(npm -v)"
    fi
    
    return 0
}

# 检查Redis
check_redis() {
    print_info "检查 Redis 配置..."
    
    # 交互式询问Redis配置
    echo -e "\n${BLUE}Redis 配置${NC}"
    echo -n "Redis 地址 (默认: $DEFAULT_REDIS_HOST): "
    read input
    REDIS_HOST=${input:-$DEFAULT_REDIS_HOST}
    
    echo -n "Redis 端口 (默认: $DEFAULT_REDIS_PORT): "
    read input
    REDIS_PORT=${input:-$DEFAULT_REDIS_PORT}
    
    echo -n "Redis 密码 (默认: 无密码): "
    read -s input
    echo
    REDIS_PASSWORD=${input:-$DEFAULT_REDIS_PASSWORD}
    
    # 测试Redis连接
    print_info "测试 Redis 连接..."
    if command_exists redis-cli; then
        local redis_test_cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
        if [ -n "$REDIS_PASSWORD" ]; then
            redis_test_cmd="$redis_test_cmd -a '$REDIS_PASSWORD'"
        fi
        
        if $redis_test_cmd ping 2>/dev/null | grep -q "PONG"; then
            print_success "Redis 连接成功"
            return 0
        else
            print_error "Redis 连接失败"
            return 1
        fi
    else
        print_warning "redis-cli 未安装，跳过连接测试"
        # 仅检查端口是否开放
        if check_port $REDIS_PORT; then
            print_info "检测到端口 $REDIS_PORT 已开放"
            return 0
        else
            print_warning "端口 $REDIS_PORT 未开放，请确保 Redis 正在运行"
            return 1
        fi
    fi
}

# 安装本地Redis（可选）
install_local_redis() {
    print_info "是否需要在本地安装 Redis？(y/N): "
    read -n 1 install_redis
    echo
    
    if [[ ! "$install_redis" =~ ^[Yy]$ ]]; then
        return 0
    fi
    
    case $OS in
        "debian")
            sudo $PACKAGE_MANAGER update
            sudo $PACKAGE_MANAGER install -y redis-server
            sudo systemctl start redis-server
            sudo systemctl enable redis-server
            ;;
        "redhat")
            sudo $PACKAGE_MANAGER install -y redis
            sudo systemctl start redis
            sudo systemctl enable redis
            ;;
        "arch")
            sudo $PACKAGE_MANAGER -S --noconfirm redis
            sudo systemctl start redis
            sudo systemctl enable redis
            ;;
        "macos")
            brew install redis
            brew services start redis
            ;;
        *)
            print_error "不支持的操作系统，请手动安装 Redis"
            return 1
            ;;
    esac
    
    print_success "Redis 安装完成"
    return 0
}


# 检查是否已安装
check_installation() {
    if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/package.json" ]; then
        return 0
    fi
    return 1
}

# 安装服务
install_service() {
    print_info "开始安装 Claude Relay Service..."
    
    # 询问安装目录
    echo -n "安装目录 (默认: $DEFAULT_INSTALL_DIR): "
    read input
    INSTALL_DIR=${input:-$DEFAULT_INSTALL_DIR}
    APP_DIR="$INSTALL_DIR/app"
    
    # 询问服务端口
    echo -n "服务端口 (默认: $DEFAULT_APP_PORT): "
    read input
    APP_PORT=${input:-$DEFAULT_APP_PORT}
    
    # 检查端口是否被占用
    if check_port $APP_PORT; then
        print_warning "端口 $APP_PORT 已被占用"
        echo -n "是否继续？(y/N): "
        read -n 1 continue_install
        echo
        if [[ ! "$continue_install" =~ ^[Yy]$ ]]; then
            return 1
        fi
    fi
    
    # 检查是否已安装
    if check_installation; then
        print_warning "检测到已安装的服务"
        echo -n "是否要重新安装？(y/N): "
        read -n 1 reinstall
        echo
        if [[ ! "$reinstall" =~ ^[Yy]$ ]]; then
            return 0
        fi
    fi
    
    # 创建安装目录
    mkdir -p "$INSTALL_DIR"
    
    # 克隆项目
    print_info "克隆项目代码..."
    if [ -d "$APP_DIR" ]; then
        rm -rf "$APP_DIR"
    fi
    
    if ! git clone https://github.com/Wei-Shaw/claude-relay-service.git "$APP_DIR"; then
        print_error "克隆项目失败"
        return 1
    fi
    
    # 进入项目目录
    cd "$APP_DIR"
    
    # 安装npm依赖
    print_info "安装项目依赖..."
    npm install
    
    # 创建配置文件
    print_info "创建配置文件..."
    
    # 复制示例配置
    if [ -f "config/config.example.js" ]; then
        cp config/config.example.js config/config.js
    fi
    
    # 创建.env文件
    cat > .env << EOF
# 环境变量配置
NODE_ENV=production
PORT=$APP_PORT

# JWT配置
JWT_SECRET=$(generate_random_string 64)

# 加密配置
ENCRYPTION_KEY=$(generate_random_string 32)

# Redis配置
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
REDIS_PASSWORD=$REDIS_PASSWORD

# 日志配置
LOG_LEVEL=info
EOF
    
    # 运行setup命令
    print_info "运行初始化设置..."
    npm run setup
    
    # 安装Web界面依赖
    print_info "安装Web界面依赖..."
    npm run install:web
    
    # 创建systemd服务文件（Linux）
    if [[ "$OS" == "debian" || "$OS" == "redhat" || "$OS" == "arch" ]]; then
        create_systemd_service
    fi
    
    # 创建软链接
    create_symlink
    
    print_success "安装完成！"
    
    # 自动启动服务
    print_info "正在启动服务..."
    start_service
    
    # 等待服务启动
    sleep 3
    
    # 显示状态
    show_status
    
    # 获取公网IP
    local public_ip=$(get_public_ip)
    
    echo -e "\n${GREEN}服务已成功安装并启动！${NC}"
    echo -e "\n${YELLOW}访问地址：${NC}"
    echo -e "  本地 Web: ${GREEN}http://localhost:$APP_PORT/web${NC}"
    echo -e "  本地 API: ${GREEN}http://localhost:$APP_PORT/api/v1${NC}"
    if [ "$public_ip" != "localhost" ]; then
        echo -e "  公网 Web: ${GREEN}http://$public_ip:$APP_PORT/web${NC}"
        echo -e "  公网 API: ${GREEN}http://$public_ip:$APP_PORT/api/v1${NC}"
    fi
    echo -e "\n${YELLOW}管理命令：${NC}"
    echo "  查看状态: crs status"
    echo "  停止服务: crs stop"
    echo "  重启服务: crs restart"
}

# 创建systemd服务
create_systemd_service() {
    local service_file="/etc/systemd/system/claude-relay.service"
    
    print_info "创建 systemd 服务..."
    
    sudo tee $service_file > /dev/null << EOF
[Unit]
Description=Claude Relay Service
After=network.target redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=$(which node) $APP_DIR/src/app.js
Restart=on-failure
RestartSec=10
StandardOutput=append:$APP_DIR/logs/service.log
StandardError=append:$APP_DIR/logs/service-error.log

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    print_success "systemd 服务创建完成"
}

# 更新服务
update_service() {
    if ! check_installation; then
        print_error "服务未安装，请先运行: $0 install"
        return 1
    fi
    
    print_info "更新 Claude Relay Service..."
    
    cd "$APP_DIR"
    
    # 停止服务
    stop_service
    
    # 拉取最新代码
    print_info "拉取最新代码..."
    git pull origin main
    
    # 更新依赖
    print_info "更新依赖..."
    npm install
    npm run install:web
    
    # 启动服务
    start_service
    
    print_success "更新完成！"
}

# 卸载服务
uninstall_service() {
    if [ -z "$INSTALL_DIR" ]; then
        echo -n "请输入安装目录 (默认: $DEFAULT_INSTALL_DIR): "
        read input
        INSTALL_DIR=${input:-$DEFAULT_INSTALL_DIR}
        APP_DIR="$INSTALL_DIR/app"
    fi
    
    if [ ! -d "$INSTALL_DIR" ]; then
        print_error "安装目录不存在"
        return 1
    fi
    
    print_warning "即将卸载 Claude Relay Service"
    echo -n "确定要卸载吗？(y/N): "
    read -n 1 confirm
    echo
    
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        return 0
    fi
    
    # 停止服务
    stop_service
    
    # 删除systemd服务
    if [ -f "/etc/systemd/system/claude-relay.service" ]; then
        sudo systemctl disable claude-relay.service
        sudo rm /etc/systemd/system/claude-relay.service
        sudo systemctl daemon-reload
    fi
    
    # 备份数据
    echo -n "是否备份数据？(y/N): "
    read -n 1 backup
    echo
    
    if [[ "$backup" =~ ^[Yy]$ ]]; then
        local backup_dir="$HOME/claude-relay-backup-$(date +%Y%m%d%H%M%S)"
        mkdir -p "$backup_dir"
        
        # Redis使用系统默认位置，不需要备份
        
        # 备份配置文件
        if [ -f "$APP_DIR/.env" ]; then
            cp "$APP_DIR/.env" "$backup_dir/"
        fi
        if [ -f "$APP_DIR/config/config.js" ]; then
            cp "$APP_DIR/config/config.js" "$backup_dir/"
        fi
        
        print_success "数据已备份到: $backup_dir"
    fi
    
    # 删除安装目录
    rm -rf "$INSTALL_DIR"
    
    print_success "卸载完成！"
}

# 启动服务
start_service() {
    if ! check_installation; then
        print_error "服务未安装，请先运行: $0 install"
        return 1
    fi
    
    print_info "启动服务..."
    
    cd "$APP_DIR"
    
    # 检查是否已运行
    if pgrep -f "node.*claude-relay" > /dev/null; then
        print_warning "服务已在运行"
        return 0
    fi
    
    # 使用不同方式启动
    if [ -f "/etc/systemd/system/claude-relay.service" ]; then
        sudo systemctl start claude-relay.service
        print_success "服务已通过 systemd 启动"
    else
        # 使用npm启动
        npm run service:start:daemon
        print_success "服务已启动"
    fi
    
    sleep 2
    show_status
}

# 停止服务
stop_service() {
    print_info "停止服务..."
    
    if [ -f "/etc/systemd/system/claude-relay.service" ]; then
        sudo systemctl stop claude-relay.service
    else
        if command_exists pm2; then
            cd "$APP_DIR" 2>/dev/null && npm run service:stop
        else
            pkill -f "node.*claude-relay" || true
        fi
    fi
    
    print_success "服务已停止"
}

# 重启服务
restart_service() {
    print_info "重启服务..."
    stop_service
    sleep 2
    start_service
}

# 显示状态
show_status() {
    echo -e "\n${BLUE}=== Claude Relay Service 状态 ===${NC}"
    
    # 获取实际端口
    local actual_port="$APP_PORT"
    if [ -z "$actual_port" ] && [ -f "$APP_DIR/.env" ]; then
        actual_port=$(grep "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2)
    fi
    actual_port=${actual_port:-3000}
    
    # 检查进程
    if pgrep -f "node.*claude-relay" > /dev/null; then
        echo -e "服务状态: ${GREEN}运行中${NC}"
        
        # 获取进程信息
        local pid=$(pgrep -f "node.*claude-relay" | head -1)
        echo "进程 PID: $pid"
        echo "服务端口: $actual_port"
        
        # 获取公网IP
        local public_ip=$(get_public_ip)
        
        # 显示访问地址
        echo -e "\n访问地址:"
        echo -e "  本地 Web: ${GREEN}http://localhost:$actual_port/web${NC}"
        echo -e "  本地 API: ${GREEN}http://localhost:$actual_port/api/v1${NC}"
        if [ "$public_ip" != "localhost" ]; then
            echo -e "  公网 Web: ${GREEN}http://$public_ip:$actual_port/web${NC}"
            echo -e "  公网 API: ${GREEN}http://$public_ip:$actual_port/api/v1${NC}"
        fi
    else
        echo -e "服务状态: ${RED}未运行${NC}"
    fi
    
    # 显示安装信息
    if [ -n "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR" ]; then
        echo -e "\n安装目录: $INSTALL_DIR"
    elif [ -d "$DEFAULT_INSTALL_DIR" ]; then
        echo -e "\n安装目录: $DEFAULT_INSTALL_DIR"
    fi
    
    # Redis状态
    if command_exists redis-cli; then
        echo -e "\nRedis 状态:"
        local redis_cmd="redis-cli"
        if [ -n "$REDIS_HOST" ]; then
            redis_cmd="$redis_cmd -h $REDIS_HOST"
        fi
        if [ -n "$REDIS_PORT" ]; then
            redis_cmd="$redis_cmd -p $REDIS_PORT"
        fi
        if [ -n "$REDIS_PASSWORD" ]; then
            redis_cmd="$redis_cmd -a '$REDIS_PASSWORD'"
        fi
        
        if $redis_cmd ping 2>/dev/null | grep -q "PONG"; then
            echo -e "  连接状态: ${GREEN}正常${NC}"
        else
            echo -e "  连接状态: ${RED}异常${NC}"
        fi
    fi
    
    echo -e "\n${BLUE}===========================${NC}"
}

# 显示帮助
show_help() {
    echo "Claude Relay Service 管理脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  install   - 安装服务"
    echo "  update    - 更新服务"
    echo "  uninstall - 卸载服务"
    echo "  start     - 启动服务"
    echo "  stop      - 停止服务"
    echo "  restart   - 重启服务"
    echo "  status    - 查看状态"
    echo "  symlink   - 创建 crs 快捷命令"
    echo "  help      - 显示帮助"
    echo ""
}

# 交互式菜单
show_menu() {
    clear
    echo -e "${BOLD}======================================${NC}"
    echo -e "${BOLD}  Claude Relay Service (CRS) 管理工具  ${NC}"
    echo -e "${BOLD}======================================${NC}"
    echo ""
    
    # 显示当前状态
    echo -e "${YELLOW}当前状态：${NC}"
    if check_installation; then
        echo -e "  安装状态: ${GREEN}已安装${NC} (目录: $INSTALL_DIR)"
        
        # 获取实际端口
        local actual_port="$APP_PORT"
        if [ -z "$actual_port" ] && [ -f "$APP_DIR/.env" ]; then
            actual_port=$(grep "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2)
        fi
        actual_port=${actual_port:-3000}
        
        # 检查服务状态
        if pgrep -f "node.*claude-relay" > /dev/null; then
            echo -e "  运行状态: ${GREEN}运行中${NC}"
            local pid=$(pgrep -f "node.*claude-relay" | head -1)
            echo -e "  进程 PID: $pid"
            echo -e "  服务端口: $actual_port"
            
            # 获取公网IP
            local public_ip=$(get_public_ip)
            if [ "$public_ip" != "localhost" ]; then
                echo -e "  公网地址: ${GREEN}http://$public_ip:$actual_port/web${NC}"
            else
                echo -e "  Web 界面: ${GREEN}http://localhost:$actual_port/web${NC}"
            fi
        else
            echo -e "  运行状态: ${RED}未运行${NC}"
        fi
    else
        echo -e "  安装状态: ${RED}未安装${NC}"
    fi
    
    # Redis状态
    if command_exists redis-cli && [ -n "$REDIS_HOST" ]; then
        local redis_cmd="redis-cli -h $REDIS_HOST -p ${REDIS_PORT:-6379}"
        if [ -n "$REDIS_PASSWORD" ]; then
            redis_cmd="$redis_cmd -a '$REDIS_PASSWORD'"
        fi
        
        if $redis_cmd ping 2>/dev/null | grep -q "PONG"; then
            echo -e "  Redis 状态: ${GREEN}连接正常${NC}"
        else
            echo -e "  Redis 状态: ${RED}连接异常${NC}"
        fi
    fi
    
    echo ""
    echo -e "${BOLD}--------------------------------------${NC}"
    echo -e "${YELLOW}请选择操作：${NC}"
    echo ""
    
    if ! check_installation; then
        echo "  1) 安装服务"
        echo "  2) 退出"
        echo ""
        echo -n "请输入选项 [1-2]: "
    else
        echo "  1) 查看状态"
        echo "  2) 启动服务"
        echo "  3) 停止服务"
        echo "  4) 重启服务"
        echo "  5) 更新服务"
        echo "  6) 卸载服务"
        echo "  7) 退出"
        echo ""
        echo -n "请输入选项 [1-7]: "
    fi
}

# 处理菜单选择
handle_menu_choice() {
    local choice=$1
    
    if ! check_installation; then
        case $choice in
            1)
                echo ""
                # 检查依赖
                if ! install_dependencies; then
                    print_error "依赖安装失败"
                    echo -n "按回车键继续..."
                    read
                    return 1
                fi
                
                # 检查Redis
                if ! check_redis; then
                    print_warning "Redis 连接失败"
                    install_local_redis
                    
                    # 重新测试连接
                    REDIS_HOST="localhost"
                    REDIS_PORT="6379"
                    if ! check_redis; then
                        print_error "Redis 配置失败，请手动安装并配置 Redis"
                        echo -n "按回车键继续..."
                        read
                        return 1
                    fi
                fi
                
                # 安装服务
                install_service
                
                # 创建软链接
                create_symlink
                
                echo -n "按回车键继续..."
                read
                ;;
            2)
                echo "退出管理工具"
                exit 0
                ;;
            *)
                print_error "无效选项"
                sleep 1
                ;;
        esac
    else
        case $choice in
            1)
                echo ""
                show_status
                echo -n "按回车键继续..."
                read
                ;;
            2)
                echo ""
                start_service
                echo -n "按回车键继续..."
                read
                ;;
            3)
                echo ""
                stop_service
                echo -n "按回车键继续..."
                read
                ;;
            4)
                echo ""
                restart_service
                echo -n "按回车键继续..."
                read
                ;;
            5)
                echo ""
                update_service
                echo -n "按回车键继续..."
                read
                ;;
            6)
                echo ""
                uninstall_service
                if [ $? -eq 0 ]; then
                    exit 0
                fi
                ;;
            7)
                echo "退出管理工具"
                exit 0
                ;;
            *)
                print_error "无效选项"
                sleep 1
                ;;
        esac
    fi
}

# 创建软链接
create_symlink() {
    # 获取脚本的绝对路径
    local script_path=""
    if command_exists realpath; then
        script_path="$(realpath "$0")"
    elif command_exists readlink && readlink -f "$0" >/dev/null 2>&1; then
        script_path="$(readlink -f "$0")"
    else
        # 备用方法：使用pwd和脚本名
        script_path="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
    fi
    
    local symlink_path="/usr/bin/crs"
    
    print_info "创建命令行快捷方式..."
    print_info "脚本路径: $script_path"
    
    # 检查脚本文件是否存在
    if [ ! -f "$script_path" ]; then
        print_error "找不到脚本文件: $script_path"
        return 1
    fi
    
    # 检查是否已存在
    if [ -L "$symlink_path" ] || [ -f "$symlink_path" ]; then
        print_warning "$symlink_path 已存在"
        echo -n "是否覆盖？(y/N): "
        read -n 1 overwrite
        echo
        
        if [[ "$overwrite" =~ ^[Yy]$ ]]; then
            sudo rm -f "$symlink_path" || {
                print_error "删除旧文件失败"
                return 1
            }
        else
            return 0
        fi
    fi
    
    # 创建软链接
    if sudo ln -s "$script_path" "$symlink_path"; then
        print_success "已创建快捷命令 'crs'"
        echo "您现在可以在任何地方使用 'crs' 命令管理服务"
        
        # 验证软链接
        if [ -L "$symlink_path" ]; then
            print_info "软链接验证成功"
        else
            print_warning "软链接验证失败"
        fi
    else
        print_error "创建软链接失败"
        print_info "请手动执行以下命令："
        echo "  sudo ln -s '$script_path' '$symlink_path'"
        return 1
    fi
}

# 加载已安装的配置
load_config() {
    # 尝试找到安装目录
    if [ -z "$INSTALL_DIR" ]; then
        if [ -d "$DEFAULT_INSTALL_DIR" ]; then
            INSTALL_DIR="$DEFAULT_INSTALL_DIR"
        fi
    fi
    
    if [ -n "$INSTALL_DIR" ]; then
        APP_DIR="$INSTALL_DIR/app"
        
        # 加载.env配置
        if [ -f "$APP_DIR/.env" ]; then
            export $(cat "$APP_DIR/.env" | grep -v '^#' | xargs)
            # 特别加载端口配置
            APP_PORT=$(grep "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2)
        fi
    fi
}

# 主函数
main() {
    # 检测操作系统
    detect_os
    
    if [ "$OS" == "unknown" ]; then
        print_error "不支持的操作系统"
        exit 1
    fi
    
    # 加载配置
    load_config
    
    # 处理命令
    case "$1" in
        install)
            # 检查依赖
            if ! install_dependencies; then
                print_error "依赖安装失败"
                exit 1
            fi
            
            # 检查Redis
            if ! check_redis; then
                print_warning "Redis 连接失败"
                install_local_redis
                
                # 重新测试连接
                REDIS_HOST="localhost"
                REDIS_PORT="6379"
                if ! check_redis; then
                    print_error "Redis 配置失败，请手动安装并配置 Redis"
                    exit 1
                fi
            fi
            
            # 安装服务
            install_service
            
            # 创建软链接
            create_symlink
            ;;
        update)
            update_service
            ;;
        uninstall)
            uninstall_service
            ;;
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            show_status
            ;;
        symlink)
            # 单独创建软链接
            create_symlink
            ;;
        help)
            show_help
            ;;
        "")
            # 无参数时显示交互式菜单
            while true; do
                show_menu
                read choice
                handle_menu_choice "$choice"
            done
            ;;
        *)
            print_error "未知命令: $1"
            echo ""
            show_help
            ;;
    esac
}

# 运行主函数
main "$@"