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
        local redis_args=(-h "$REDIS_HOST" -p "$REDIS_PORT")
        if [ -n "$REDIS_PASSWORD" ]; then
            redis_args+=(-a "$REDIS_PASSWORD")
        fi

        if redis-cli "${redis_args[@]}" ping 2>/dev/null | grep -q "PONG"; then
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
    
    # 确保脚本有执行权限（仅在权限不正确时设置）
    if [ -f "$APP_DIR/scripts/manage.sh" ] && [ ! -x "$APP_DIR/scripts/manage.sh" ]; then
        chmod +x "$APP_DIR/scripts/manage.sh"
        print_success "已设置脚本执行权限"
    fi
    
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
    
    # 获取预构建的前端文件
    print_info "获取预构建的前端文件..."
    
    # 创建目标目录
    mkdir -p web/admin-spa/dist
    
    # 从 web-dist 分支获取构建好的文件
    if git ls-remote --heads origin web-dist | grep -q web-dist; then
        print_info "从 web-dist 分支下载前端文件..."
        
        # 创建临时目录用于 clone
        TEMP_CLONE_DIR=$(mktemp -d)
        
        # 使用 sparse-checkout 来只获取需要的文件
        git clone --depth 1 --branch web-dist --single-branch \
            https://github.com/Wei-Shaw/claude-relay-service.git \
            "$TEMP_CLONE_DIR" 2>/dev/null || {
            # 如果 HTTPS 失败，尝试使用当前仓库的 remote URL
            REPO_URL=$(git config --get remote.origin.url)
            git clone --depth 1 --branch web-dist --single-branch "$REPO_URL" "$TEMP_CLONE_DIR"
        }
        
        # 复制文件到目标目录（排除 .git 和 README.md）
        rsync -av --exclude='.git' --exclude='README.md' "$TEMP_CLONE_DIR/" web/admin-spa/dist/ 2>/dev/null || {
            # 如果没有 rsync，使用 cp
            cp -r "$TEMP_CLONE_DIR"/* web/admin-spa/dist/ 2>/dev/null
            rm -rf web/admin-spa/dist/.git 2>/dev/null
            rm -f web/admin-spa/dist/README.md 2>/dev/null
        }
        
        # 清理临时目录
        rm -rf "$TEMP_CLONE_DIR"
        
        print_success "前端文件下载完成"
    else
        print_warning "web-dist 分支不存在，尝试本地构建..."
        
        # 检查是否有 Node.js 和 npm
        if command_exists npm; then
            # 回退到原始构建方式
            if [ -f "web/admin-spa/package.json" ]; then
                print_info "开始本地构建前端..."
                cd web/admin-spa
                npm install
                npm run build
                cd ../..
                print_success "前端本地构建完成"
            else
                print_error "无法找到前端项目文件"
            fi
        else
            print_error "无法获取前端文件，且本地环境不支持构建"
            print_info "请确保仓库已正确配置 web-dist 分支"
        fi
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


# 更新服务
update_service() {
    if ! check_installation; then
        print_error "服务未安装，请先运行: $0 install"
        return 1
    fi
    
    print_info "更新 Claude Relay Service..."
    
    cd "$APP_DIR"
    
    # 保存当前运行状态
    local was_running=false
    if pgrep -f "node.*src/app.js" > /dev/null; then
        was_running=true
        print_info "检测到服务正在运行，将在更新后自动重启..."
        stop_service
    fi
    
    # 备份配置文件（只备份.env，config.js可从example恢复）
    print_info "备份配置文件..."
    if [ -f ".env" ]; then
        cp .env .env.backup.$(date +%Y%m%d%H%M%S)
    fi
    
    # 检查本地修改
    print_info "检查本地文件修改..."
    local has_changes=false
    if git status --porcelain | grep -v "^??" | grep -q .; then
        has_changes=true
        print_warning "检测到本地文件已修改："
        git status --short | grep -v "^??"
        echo ""
        echo -e "${YELLOW}警告：更新将使用远程版本覆盖本地修改！${NC}"
        
        # 创建本地修改的备份
        local backup_branch="backup-$(date +%Y%m%d-%H%M%S)"
        print_info "创建本地修改备份分支: $backup_branch"
        git stash push -m "Backup before update $(date +%Y-%m-%d)" >/dev/null 2>&1
        git branch "$backup_branch" 2>/dev/null || true
        
        echo -e "${GREEN}已创建备份分支: $backup_branch${NC}"
        echo "如需恢复，可执行: git checkout $backup_branch"
        echo ""
        
        echo -n "是否继续更新？(y/N): "
        read -n 1 confirm_update
        echo
        
        if [[ ! "$confirm_update" =~ ^[Yy]$ ]]; then
            print_info "已取消更新"
            # 恢复 stash 的修改
            git stash pop >/dev/null 2>&1 || true
            # 如果之前在运行，重新启动服务
            if [ "$was_running" = true ]; then
                print_info "重新启动服务..."
                start_service
            fi
            return 0
        fi
    fi
    
    # 获取最新代码（强制使用远程版本）
    print_info "获取最新代码..."
    
    # 先获取远程更新
    if ! git fetch origin main; then
        print_error "获取远程代码失败，请检查网络连接"
        return 1
    fi
    
    # 强制重置到远程版本
    print_info "应用远程更新..."
    if ! git reset --hard origin/main; then
        print_error "重置到远程版本失败"
        # 尝试恢复
        print_info "尝试恢复..."
        git reset --hard HEAD
        return 1
    fi
    
    # 清理未跟踪的文件（可选，保留用户新建的文件）
    # git clean -fd  # 注释掉，避免删除用户的新文件
    
    print_success "代码已更新到最新版本"
    
    # 更新依赖
    print_info "更新依赖..."
    npm install
    
    # 确保脚本有执行权限（仅在权限不正确时设置）
    if [ -f "$APP_DIR/scripts/manage.sh" ] && [ ! -x "$APP_DIR/scripts/manage.sh" ]; then
        chmod +x "$APP_DIR/scripts/manage.sh"
    fi
    
    # 获取最新的预构建前端文件
    print_info "更新前端文件..."
    
    # 创建目标目录
    mkdir -p web/admin-spa/dist
    
    # 清理旧的前端文件（保留用户自定义文件）
    if [ -d "web/admin-spa/dist" ]; then
        print_info "清理旧的前端文件..."
        # 只删除已知的前端文件，保留用户可能添加的自定义文件
        rm -rf web/admin-spa/dist/assets 2>/dev/null
        rm -f web/admin-spa/dist/index.html 2>/dev/null
        rm -f web/admin-spa/dist/favicon.ico 2>/dev/null
    fi
    
    # 从 web-dist 分支获取构建好的文件
    if git ls-remote --heads origin web-dist | grep -q web-dist; then
        print_info "从 web-dist 分支下载最新前端文件..."
        
        # 创建临时目录用于 clone
        TEMP_CLONE_DIR=$(mktemp -d)
        
        # 添加错误处理
        if [ ! -d "$TEMP_CLONE_DIR" ]; then
            print_error "无法创建临时目录"
            return 1
        fi
        
        # 使用 sparse-checkout 来只获取需要的文件，添加重试机制
        local clone_success=false
        for attempt in 1 2 3; do
            print_info "尝试下载前端文件 (第 $attempt 次)..."
            
            if git clone --depth 1 --branch web-dist --single-branch \
                https://github.com/Wei-Shaw/claude-relay-service.git \
                "$TEMP_CLONE_DIR" 2>/dev/null; then
                clone_success=true
                break
            fi
            
            # 如果 HTTPS 失败，尝试使用当前仓库的 remote URL
            REPO_URL=$(git config --get remote.origin.url)
            if git clone --depth 1 --branch web-dist --single-branch "$REPO_URL" "$TEMP_CLONE_DIR" 2>/dev/null; then
                clone_success=true
                break
            fi
            
            if [ $attempt -lt 3 ]; then
                print_warning "下载失败，等待 2 秒后重试..."
                sleep 2
            fi
        done
        
        if [ "$clone_success" = false ]; then
            print_error "无法下载前端文件"
            rm -rf "$TEMP_CLONE_DIR"
            return 1
        fi
        
        # 复制文件到目标目录（排除 .git 和 README.md）
        rsync -av --exclude='.git' --exclude='README.md' "$TEMP_CLONE_DIR/" web/admin-spa/dist/ 2>/dev/null || {
            # 如果没有 rsync，使用 cp
            cp -r "$TEMP_CLONE_DIR"/* web/admin-spa/dist/ 2>/dev/null
            rm -rf web/admin-spa/dist/.git 2>/dev/null
            rm -f web/admin-spa/dist/README.md 2>/dev/null
        }
        
        # 清理临时目录
        rm -rf "$TEMP_CLONE_DIR"
        
        print_success "前端文件更新完成"
    else
        print_warning "web-dist 分支不存在，尝试本地构建..."
        
        # 检查是否有 Node.js 和 npm
        if command_exists npm; then
            # 回退到原始构建方式
            if [ -f "web/admin-spa/package.json" ]; then
                print_info "开始本地构建前端..."
                cd web/admin-spa
                npm install
                npm run build
                cd ../..
                print_success "前端本地构建完成"
            else
                print_error "无法找到前端项目文件"
            fi
        else
            print_error "无法获取前端文件，且本地环境不支持构建"
            print_info "请确保仓库已正确配置 web-dist 分支"
        fi
    fi
    
    # 更新软链接到最新版本
    create_symlink
    
    # 如果之前在运行，则重新启动服务
    if [ "$was_running" = true ]; then
        print_info "重新启动服务..."
        start_service
    fi
    
    print_success "更新完成！"
    
    # 显示更新摘要
    echo ""
    echo -e "${BLUE}=== 更新摘要 ===${NC}"
    
    # 显示版本信息
    if [ -f "$APP_DIR/VERSION" ]; then
        echo -e "当前版本: ${GREEN}$(cat "$APP_DIR/VERSION")${NC}"
    fi
    
    # 显示最新的提交信息
    local latest_commit=$(git log -1 --oneline 2>/dev/null)
    if [ -n "$latest_commit" ]; then
        echo -e "最新提交: ${GREEN}$latest_commit${NC}"
    fi
    
    # 显示备份信息
    echo -e "\n${YELLOW}配置文件备份：${NC}"
    ls -la .env.backup.* 2>/dev/null | tail -3 || echo "  无备份文件"
    
    # 提醒用户检查配置
    echo -e "\n${YELLOW}提示：${NC}"
    echo "  - 配置文件已自动备份"
    echo "  - 如有本地修改已保存到备份分支"
    echo "  - 建议检查 .env 和 config/config.js 配置"
    
    echo -e "\n${BLUE}==================${NC}"
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
    if pgrep -f "node.*src/app.js" > /dev/null; then
        print_warning "服务已在运行"
        return 0
    fi
    
    # 确保日志目录存在
    mkdir -p "$APP_DIR/logs"
    
    # 检查pm2是否可用并且不是从package.json脚本调用的
    if command_exists pm2 && [ "$1" != "--no-pm2" ]; then
        print_info "使用 pm2 启动服务..."
        # 直接使用pm2启动，避免循环调用
        pm2 start "$APP_DIR/src/app.js" --name "claude-relay" --log "$APP_DIR/logs/pm2.log" 2>/dev/null
        sleep 2
        
        # 检查是否启动成功
        if pm2 list 2>/dev/null | grep -q "claude-relay"; then
            print_success "服务已通过 pm2 启动"
            pm2 save 2>/dev/null || true
        else
            print_warning "pm2 启动失败，尝试直接启动..."
            start_service_direct
        fi
    else
        start_service_direct
    fi
    
    sleep 2
    
    # 验证服务是否成功启动
    if pgrep -f "node.*src/app.js" > /dev/null; then
        show_status
    else
        print_error "服务启动失败，请查看日志: $APP_DIR/logs/service.log"
        if [ -f "$APP_DIR/logs/service.log" ]; then
            echo "最近的错误日志："
            tail -n 20 "$APP_DIR/logs/service.log"
        fi
        return 1
    fi
}

# 直接启动服务（不使用pm2）
start_service_direct() {
    print_info "使用后台进程启动服务..."
    
    # 使用setsid创建新会话，确保进程完全脱离终端
    if command_exists setsid; then
        # setsid方式（推荐）
        setsid nohup node "$APP_DIR/src/app.js" > "$APP_DIR/logs/service.log" 2>&1 < /dev/null &
        local pid=$!
        sleep 1
        
        # 获取实际的子进程PID
        local real_pid=$(pgrep -f "node.*src/app.js" | head -1)
        if [ -n "$real_pid" ]; then
            echo $real_pid > "$APP_DIR/.pid"
            print_success "服务已在后台启动 (PID: $real_pid)"
        else
            echo $pid > "$APP_DIR/.pid"
            print_success "服务已在后台启动 (PID: $pid)"
        fi
    else
        # 备用方式：使用nohup和disown
        nohup node "$APP_DIR/src/app.js" > "$APP_DIR/logs/service.log" 2>&1 < /dev/null &
        local pid=$!
        disown $pid 2>/dev/null || true
        echo $pid > "$APP_DIR/.pid"
        print_success "服务已在后台启动 (PID: $pid)"
    fi
}

# 停止服务
stop_service() {
    print_info "停止服务..."
    
    # 尝试使用pm2停止
    if command_exists pm2 && [ -n "$APP_DIR" ] && [ -d "$APP_DIR" ]; then
        cd "$APP_DIR" 2>/dev/null
        pm2 stop claude-relay 2>/dev/null || true
        pm2 delete claude-relay 2>/dev/null || true
    fi
    
    # 使用PID文件停止
    if [ -f "$APP_DIR/.pid" ]; then
        local pid=$(cat "$APP_DIR/.pid")
        if kill -0 $pid 2>/dev/null; then
            kill $pid
            rm -f "$APP_DIR/.pid"
        fi
    fi
    
    # 强制停止所有相关进程
    pkill -f "node.*src/app.js" 2>/dev/null || true
    
    # 等待进程完全退出（最多等待10秒）
    local wait_count=0
    while pgrep -f "node.*src/app.js" > /dev/null; do
        if [ $wait_count -ge 10 ]; then
            print_warning "进程停止超时，尝试强制终止..."
            pkill -9 -f "node.*src/app.js" 2>/dev/null || true
            sleep 1
            break
        fi
        sleep 1
        wait_count=$((wait_count + 1))
    done
    
    # 最终确认进程已停止
    if pgrep -f "node.*src/app.js" > /dev/null; then
        print_error "无法完全停止服务进程"
        return 1
    fi
    
    print_success "服务已停止"
}

# 重启服务
restart_service() {
    print_info "重启服务..."
    
    # 停止服务并检查结果
    if ! stop_service; then
        print_error "停止服务失败"
        return 1
    fi
    
    # 短暂等待，确保端口释放
    sleep 1
    
    # 启动服务，如果失败则重试
    local retry_count=0
    while [ $retry_count -lt 3 ]; do
        # 清除可能的僵尸进程检测
        if ! pgrep -f "node.*src/app.js" > /dev/null; then
            # 进程确实已停止，可以启动
            if start_service; then
                return 0
            fi
        fi
        
        retry_count=$((retry_count + 1))
        if [ $retry_count -lt 3 ]; then
            print_warning "启动失败，等待2秒后重试（第 $retry_count 次）..."
            sleep 2
        fi
    done
    
    print_error "重启服务失败"
    return 1
}

# 更新模型价格
update_model_pricing() {
    if ! check_installation; then
        print_error "服务未安装，请先运行: $0 install"
        return 1
    fi
    
    print_info "更新模型价格数据..."
    
    cd "$APP_DIR"
    
    # 运行更新脚本
    if npm run update:pricing; then
        print_success "模型价格数据更新完成"
        
        # 显示更新后的信息
        if [ -f "data/model_pricing.json" ]; then
            local model_count=$(grep -o '"[^"]*"\s*:' data/model_pricing.json | wc -l)
            local file_size=$(du -h data/model_pricing.json | cut -f1)
            echo -e "\n更新信息:"
            echo -e "  模型数量: ${GREEN}$model_count${NC}"
            echo -e "  文件大小: ${GREEN}$file_size${NC}"
            echo -e "  文件位置: $APP_DIR/data/model_pricing.json"
        fi
    else
        print_error "模型价格数据更新失败"
        return 1
    fi
}

# 切换分支
switch_branch() {
    if ! check_installation; then
        print_error "服务未安装，请先运行: $0 install"
        return 1
    fi
    
    cd "$APP_DIR"
    
    # 获取当前分支
    local current_branch=$(git branch --show-current 2>/dev/null)
    if [ -z "$current_branch" ]; then
        print_error "无法获取当前分支信息"
        return 1
    fi
    
    print_info "当前分支: ${GREEN}$current_branch${NC}"
    
    # 获取所有远程分支
    print_info "获取远程分支列表..."
    git fetch origin --prune >/dev/null 2>&1
    
    # 显示可用分支
    echo -e "\n${YELLOW}可用分支：${NC}"
    local branches=$(git branch -r | grep -v HEAD | sed 's/origin\///' | sed 's/^ *//')
    local branch_array=()
    local i=1
    
    while IFS= read -r branch; do
        if [ "$branch" = "$current_branch" ]; then
            echo -e "  $i) $branch ${GREEN}(当前)${NC}"
        else
            echo "  $i) $branch"
        fi
        branch_array+=("$branch")
        ((i++))
    done <<< "$branches"
    
    echo ""
    echo -n "请选择要切换的分支 (输入编号或分支名，0 取消): "
    read branch_choice
    
    # 处理用户输入
    local target_branch=""
    if [ "$branch_choice" = "0" ]; then
        print_info "已取消切换"
        return 0
    elif [[ "$branch_choice" =~ ^[0-9]+$ ]]; then
        # 用户输入的是编号
        local index=$((branch_choice - 1))
        if [ $index -ge 0 ] && [ $index -lt ${#branch_array[@]} ]; then
            target_branch="${branch_array[$index]}"
        else
            print_error "无效的编号"
            return 1
        fi
    else
        # 用户输入的是分支名
        target_branch="$branch_choice"
        # 验证分支是否存在
        if ! echo "$branches" | grep -q "^$target_branch$"; then
            print_error "分支 '$target_branch' 不存在"
            return 1
        fi
    fi
    
    # 如果是同一个分支，无需切换
    if [ "$target_branch" = "$current_branch" ]; then
        print_info "已经在分支 $target_branch 上"
        return 0
    fi
    
    print_info "准备切换到分支: ${GREEN}$target_branch${NC}"
    
    # 保存当前运行状态
    local was_running=false
    if pgrep -f "node.*src/app.js" > /dev/null; then
        was_running=true
        print_info "检测到服务正在运行，将在切换后自动重启..."
        stop_service
    fi
    
    # 处理本地修改（主要是权限变更导致的）
    print_info "检查本地修改..."
    
    # 先重置所有权限相关的修改（特别是manage.sh的权限）
    git status --porcelain | while read -r line; do
        local file=$(echo "$line" | awk '{print $2}')
        if [ -n "$file" ]; then
            # 检查是否只是权限变更
            if git diff --summary "$file" 2>/dev/null | grep -q "mode change"; then
                print_info "重置文件权限变更: $file"
                git checkout HEAD -- "$file" 2>/dev/null || true
            fi
        fi
    done
    
    # 检查是否还有其他实质性修改
    if git status --porcelain | grep -v "^??" | grep -q .; then
        print_warning "检测到本地文件修改："
        git status --short | grep -v "^??"
        echo ""
        echo -n "是否要保存这些修改？(y/N): "
        read -n 1 save_changes
        echo
        
        if [[ "$save_changes" =~ ^[Yy]$ ]]; then
            # 暂存修改
            print_info "暂存本地修改..."
            git stash push -m "Branch switch from $current_branch to $target_branch $(date +%Y-%m-%d)" >/dev/null 2>&1
        else
            # 丢弃修改
            print_info "丢弃本地修改..."
            git reset --hard HEAD >/dev/null 2>&1
        fi
    fi
    
    # 切换分支
    print_info "切换分支..."
    
    # 检查本地是否已有该分支
    if git show-ref --verify --quiet "refs/heads/$target_branch"; then
        # 本地已有分支，切换并更新
        if ! git checkout "$target_branch" 2>/dev/null; then
            print_error "切换分支失败"
            return 1
        fi
        
        # 更新到最新
        print_info "更新到远程最新版本..."
        git pull origin "$target_branch" --rebase 2>/dev/null || {
            # 如果rebase失败，使用reset
            print_warning "更新失败，强制同步到远程版本..."
            git fetch origin "$target_branch"
            git reset --hard "origin/$target_branch"
        }
    else
        # 创建并切换到新分支
        if ! git checkout -b "$target_branch" "origin/$target_branch" 2>/dev/null; then
            print_error "创建并切换分支失败"
            return 1
        fi
    fi
    
    print_success "已切换到分支: $target_branch"
    
    # 确保脚本有执行权限（切换分支后必须执行）
    if [ -f "$APP_DIR/scripts/manage.sh" ]; then
        chmod +x "$APP_DIR/scripts/manage.sh"
        print_info "已设置脚本执行权限"
    fi
    
    # 更新依赖（如果package.json有变化）
    if git diff "$current_branch..$target_branch" --name-only | grep -q "package.json"; then
        print_info "检测到 package.json 变化，更新依赖..."
        npm install
    fi
    
    # 更新前端文件（如果切换到不同版本）
    if [ "$target_branch" != "$current_branch" ]; then
        print_info "更新前端文件..."
        
        # 创建目标目录
        mkdir -p web/admin-spa/dist
        
        # 清理旧的前端文件
        if [ -d "web/admin-spa/dist" ]; then
            rm -rf web/admin-spa/dist/* 2>/dev/null || true
        fi
        
        # 尝试从对应的 web-dist 分支获取前端文件
        if git ls-remote --heads origin "web-dist-$target_branch" | grep -q "web-dist-$target_branch"; then
            print_info "从 web-dist-$target_branch 分支下载前端文件..."
            local web_branch="web-dist-$target_branch"
        elif git ls-remote --heads origin web-dist | grep -q web-dist; then
            print_info "从 web-dist 分支下载前端文件..."
            local web_branch="web-dist"
        else
            print_warning "未找到预构建的前端文件"
            web_branch=""
        fi
        
        if [ -n "$web_branch" ]; then
            # 创建临时目录用于 clone
            TEMP_CLONE_DIR=$(mktemp -d)
            
            # 下载前端文件
            if git clone --depth 1 --branch "$web_branch" --single-branch \
                https://github.com/Wei-Shaw/claude-relay-service.git \
                "$TEMP_CLONE_DIR" 2>/dev/null; then
                
                # 复制文件到目标目录
                rsync -av --exclude='.git' --exclude='README.md' "$TEMP_CLONE_DIR/" web/admin-spa/dist/ 2>/dev/null || {
                    cp -r "$TEMP_CLONE_DIR"/* web/admin-spa/dist/ 2>/dev/null
                    rm -rf web/admin-spa/dist/.git 2>/dev/null
                    rm -f web/admin-spa/dist/README.md 2>/dev/null
                }
                
                print_success "前端文件更新完成"
            else
                print_warning "下载前端文件失败"
            fi
            
            # 清理临时目录
            rm -rf "$TEMP_CLONE_DIR"
        fi
    fi
    
    # 检查是否有暂存的修改可以恢复
    if [[ "$save_changes" =~ ^[Yy]$ ]] && git stash list | grep -q "Branch switch from $current_branch to $target_branch"; then
        echo ""
        echo -n "是否要恢复之前暂存的修改？(y/N): "
        read -n 1 restore_stash
        echo
        
        if [[ "$restore_stash" =~ ^[Yy]$ ]]; then
            print_info "恢复暂存的修改..."
            git stash pop >/dev/null 2>&1 || print_warning "恢复修改时出现冲突，请手动解决"
        fi
    fi
    
    # 如果之前在运行，则重新启动服务
    if [ "$was_running" = true ]; then
        print_info "重新启动服务..."
        start_service
    fi
    
    # 显示切换后的信息
    echo ""
    echo -e "${GREEN}=== 分支切换完成 ===${NC}"
    echo -e "当前分支: ${GREEN}$target_branch${NC}"
    
    # 显示版本信息
    if [ -f "$APP_DIR/VERSION" ]; then
        echo -e "当前版本: ${GREEN}$(cat "$APP_DIR/VERSION")${NC}"
    fi
    
    # 显示最新提交
    local latest_commit=$(git log -1 --oneline 2>/dev/null)
    if [ -n "$latest_commit" ]; then
        echo -e "最新提交: ${GREEN}$latest_commit${NC}"
    fi
    
    echo ""
    print_info "提示：如遇到问题，可以运行 'crs update' 强制更新到最新版本"
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
    local pid=$(pgrep -f "node.*src/app.js" | head -1)
    if [ -n "$pid" ]; then
        echo -e "服务状态: ${GREEN}运行中${NC}"
        echo "进程 PID: $pid"
        
        # 显示进程信息
        if command_exists ps; then
            local proc_info=$(ps -p $pid -o comm,etime,rss --no-headers 2>/dev/null)
            if [ -n "$proc_info" ]; then
                echo "进程信息: $proc_info"
            fi
        fi
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
    echo "  install        - 安装服务"
    echo "  update         - 更新服务"
    echo "  uninstall      - 卸载服务"
    echo "  start          - 启动服务"
    echo "  stop           - 停止服务"
    echo "  restart        - 重启服务"
    echo "  status         - 查看状态"
    echo "  switch-branch  - 切换分支"
    echo "  update-pricing - 更新模型价格数据"
    echo "  symlink        - 创建 crs 快捷命令"
    echo "  help           - 显示帮助"
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
        local pid=$(pgrep -f "node.*src/app.js" | head -1)
        if [ -n "$pid" ]; then
            echo -e "  运行状态: ${GREEN}运行中${NC}"
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
        echo "  6) 切换分支"
        echo "  7) 更新模型价格"
        echo "  8) 卸载服务"
        echo "  9) 退出"
        echo ""
        echo -n "请输入选项 [1-9]: "
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
                switch_branch
                echo -n "按回车键继续..."
                read
                ;;
            7)
                echo ""
                update_model_pricing
                echo -n "按回车键继续..."
                read
                ;;
            8)
                echo ""
                uninstall_service
                if [ $? -eq 0 ]; then
                    exit 0
                fi
                ;;
            9)
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
    
    # 优先使用项目中的 manage.sh（在 app/scripts 目录下）
    if [ -n "$APP_DIR" ] && [ -f "$APP_DIR/scripts/manage.sh" ]; then
        script_path="$APP_DIR/scripts/manage.sh"
        # 确保脚本有执行权限
        chmod +x "$script_path" 2>/dev/null || sudo chmod +x "$script_path" 2>/dev/null || true
    elif [ -f "/app/scripts/manage.sh" ] && [ "$(basename "$0")" = "manage.sh" ]; then
        # Docker 容器中的路径
        script_path="/app/scripts/manage.sh"
    elif command_exists realpath; then
        script_path="$(realpath "$0")"
    elif command_exists readlink && readlink -f "$0" >/dev/null 2>&1; then
        script_path="$(readlink -f "$0")"
    else
        # 备用方法：使用pwd和脚本名
        script_path="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
    fi
    
    local symlink_path="/usr/bin/crs"
    
    print_info "创建命令行快捷方式..."
    print_info "APP_DIR: $APP_DIR"
    print_info "脚本路径: $script_path"
    
    # 检查脚本文件是否存在
    if [ ! -f "$script_path" ]; then
        print_error "找不到脚本文件: $script_path"
        print_info "当前目录: $(pwd)"
        print_info "脚本参数 \$0: $0"
        if [ -n "$APP_DIR" ]; then
            print_info "检查项目目录结构:"
            ls -la "$APP_DIR/" 2>/dev/null | head -5
            if [ -d "$APP_DIR/scripts" ]; then
                print_info "scripts 目录内容:"
                ls -la "$APP_DIR/scripts/" 2>/dev/null | grep manage.sh
            fi
        fi
        return 1
    fi
    
    # 如果已存在，直接删除并重新创建（默认使用代码中的最新版本）
    if [ -L "$symlink_path" ] || [ -f "$symlink_path" ]; then
        print_info "更新已存在的软链接..."
        sudo rm -f "$symlink_path" 2>/dev/null || {
            print_error "删除旧文件失败"
            return 1
        }
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
        # 检查是否使用了标准的安装结构（项目在 app 子目录）
        if [ -d "$INSTALL_DIR/app" ] && [ -f "$INSTALL_DIR/app/package.json" ]; then
            APP_DIR="$INSTALL_DIR/app"
        # 检查是否直接克隆了项目（项目在根目录）
        elif [ -f "$INSTALL_DIR/package.json" ]; then
            APP_DIR="$INSTALL_DIR"
        else
            APP_DIR="$INSTALL_DIR/app"
        fi
        
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
        switch-branch)
            switch_branch
            ;;
        update-pricing)
            update_model_pricing
            ;;
        symlink)
            # 单独创建软链接
            # 确保 APP_DIR 已设置
            if [ -z "$APP_DIR" ]; then
                print_error "请先安装项目后再创建软链接"
                print_info "运行: $0 install"
                exit 1
            fi
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
