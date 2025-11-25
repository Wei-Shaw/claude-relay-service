# Claude Relay Service Makefile
# 功能完整的 AI API 中转服务，支持 Claude 和 Gemini 双平台

.PHONY: help install setup dev start test lint clean docker-up docker-down service-start service-stop service-status logs cli-admin cli-keys cli-accounts cli-status ci-release-trigger

# 默认目标：显示帮助信息
help:
	@echo "Claude Relay Service - AI API 中转服务"
	@echo ""
	@echo "可用命令："
	@echo ""
	@echo "  📦 安装和初始化："
	@echo "    install        - 安装项目依赖"
	@echo "    install-web    - 安装Web界面依赖"
	@echo "    setup          - 生成配置文件和管理员凭据"
	@echo "    clean          - 清理依赖和构建文件"
	@echo ""
	@echo "  🎨 前端构建："
	@echo "    build-web      - 构建 Web 管理界面"
	@echo "    build-all      - 构建完整项目（后端+前端）"
	@echo ""
	@echo "  🚀 开发和运行："
	@echo "    dev            - 开发模式运行（热重载）"
	@echo "    start          - 生产模式运行"
	@echo "    test           - 运行测试套件"
	@echo "    lint           - 代码风格检查"
	@echo ""
	@echo "  🐳 Docker 部署："
	@echo "    docker-up      - 启动 Docker 服务"
	@echo "    docker-up-full - 启动 Docker 服务（包含监控）"
	@echo "    docker-down    - 停止 Docker 服务"
	@echo "    docker-logs    - 查看 Docker 日志"
	@echo ""
	@echo "  🔧 服务管理："
	@echo "    service-start  - 前台启动服务"
	@echo "    service-daemon - 后台启动服务（守护进程）"
	@echo "    service-stop   - 停止服务"
	@echo "    service-restart - 重启服务"
	@echo "    service-restart-daemon - 重启服务（守护进程）"
	@echo "    service-status - 查看服务状态"
	@echo "    logs           - 查看应用日志"
	@echo "    logs-follow    - 实时查看日志"
	@echo ""
	@echo "  ⚙️  CLI 管理工具："
	@echo "    cli-admin      - 管理员操作"
	@echo "    cli-keys       - API Key 管理"
	@echo "    cli-accounts   - Claude 账户管理"
	@echo "    cli-status     - 系统状态查看"
	@echo ""
	@echo "  💡 快速开始："
	@echo "    make setup && make dev"
	@echo ""

# 安装和初始化
install:
	@echo "📦 安装项目依赖..."
	npm install

install-web:
	@echo "📦 安装 Web 界面依赖..."
	npm run install:web

# 前端构建
build-web:
	@echo "🎨 构建 Web 管理界面..."
	npm run build:web

build-all: install install-web build-web
	@echo "🎉 完整项目构建完成！"

setup:
	@echo "⚙️  初始化项目配置和管理员凭据..."
	@if [ ! -f config/config.js ]; then cp config/config.example.js config/config.js; fi
	@if [ ! -f .env ]; then cp .env.example .env; fi
	npm run setup

clean:
	@echo "🧹 清理依赖和构建文件..."
	rm -rf node_modules
	rm -rf web/node_modules
	rm -rf web/admin-spa/dist
	rm -rf web/admin-spa/node_modules
	rm -rf logs/*.log

# 开发和运行
dev:
	@echo "🚀 启动开发模式（热重载）..."
	npm run dev

start:
	@echo "🚀 启动生产模式..."
	npm start

test:
	@echo "🧪 运行测试套件..."
	npm test

lint:
	@echo "🔍 执行代码风格检查..."
	npm run lint

# Docker 部署
docker-up:
	@echo "🐳 启动 Docker 服务..."
	docker-compose up -d

docker-up-full:
	@echo "🐳 启动 Docker 服务（包含监控）..."
	docker-compose --profile monitoring up -d

docker-down:
	@echo "🛑 停止 Docker 服务..."
	docker-compose down

docker-logs:
	@echo "📋 查看 Docker 服务日志..."
	docker-compose logs -f

# 服务管理
service-start:
	@echo "🚀 前台启动服务..."
	npm run service:start

service-daemon:
	@echo "🔧 后台启动服务（守护进程）..."
	npm run service:start:daemon

service-stop:
	@echo "🛑 停止服务..."
	npm run service:stop

service-restart:
	@echo "🔄 重启服务..."
	npm run service:restart

service-restart-daemon:
	@echo "🔄 重启服务（守护进程）..."
	npm run service:restart:daemon

service-status:
	@echo "📊 查看服务状态..."
	npm run service:status

logs:
	@echo "📋 查看应用日志..."
	npm run service:logs

logs-follow:
	@echo "📋 实时查看日志..."
	npm run service:logs:follow

# CLI 管理工具
cli-admin:
	@echo "👤 启动管理员操作 CLI..."
	npm run cli admin

cli-keys:
	@echo "🔑 启动 API Key 管理 CLI..."
	npm run cli keys

cli-accounts:
	@echo "👥 启动 Claude 账户管理 CLI..."
	npm run cli accounts

cli-status:
	@echo "📊 查看系统状态..."
	npm run cli status

# 开发辅助命令
check-config:
	@echo "🔍 检查配置文件..."
	@if [ ! -f config/config.js ]; then echo "❌ config/config.js 不存在，请运行 'make setup'"; exit 1; fi
	@if [ ! -f .env ]; then echo "❌ .env 不存在，请运行 'make setup'"; exit 1; fi
	@echo "✅ 配置文件检查通过"

health-check:
	@echo "🏥 执行健康检查..."
	@curl -s http://localhost:3000/health || echo "❌ 服务未运行或不可访问"

# 快速启动组合命令
quick-start: setup dev

quick-daemon: setup service-daemon
	@echo "🎉 服务已在后台启动！"
	@echo "运行 'make service-status' 查看状态"
	@echo "运行 'make logs-follow' 查看实时日志"

# CI 触发占位目标：用于在不影响功能的情况下触发自动发布
ci-release-trigger:
	@echo "⚙️ 触发自动发布流水线的占位目标，避免引入功能变更"

# 全栈开发环境
dev-full: install install-web build-web setup dev
	@echo "🚀 全栈开发环境启动！"

# 完整部署流程
deploy: clean install install-web build-web setup test lint docker-up
	@echo "🎉 部署完成！"
	@echo "访问 Web 管理界面: http://localhost:3000/web"
	@echo "API 端点: http://localhost:3000/api/v1/messages"

# 生产部署准备
production-build: clean install install-web build-web
	@echo "🚀 生产环境构建完成！"

# 维护命令
backup-redis:
	@echo "💾 备份 Redis 数据..."
	@docker exec claude-relay-service-redis-1 redis-cli BGSAVE || echo "❌ Redis 备份失败"

restore-redis:
	@echo "♻️  恢复 Redis 数据..."
	@echo "请手动恢复 Redis 数据文件"

# 监控和日志
monitor:
	@echo "📊 启动监控面板..."
	@echo "Grafana: http://localhost:3001"
	@echo "Redis Commander: http://localhost:8081"

tail-logs:
	@echo "📋 实时查看日志..."
	tail -f logs/claude-relay-*.log

# 开发工具
format:
	@echo "🎨 格式化代码..."
	npm run lint -- --fix

check-deps:
	@echo "🔍 检查依赖更新..."
	npm outdated

update-deps:
	@echo "⬆️  更新依赖..."
	npm update

# 测试相关
test-coverage:
	@echo "📊 运行测试覆盖率..."
	npm test -- --coverage

test-watch:
	@echo "👀 监视模式运行测试..."
	npm test -- --watch

# Git 相关
git-status:
	@echo "📋 Git 状态..."
	git status --short

git-pull:
	@echo "⬇️  拉取最新代码..."
	git pull origin main

# 安全检查
security-audit:
	@echo "🔒 执行安全审计..."
	npm audit

security-fix:
	@echo "🔧 修复安全漏洞..."
	npm audit fix
