# 🎯 后端依赖阶段 (与前端构建并行)
FROM node:18-alpine AS backend-deps

# 📁 设置工作目录
WORKDIR /app

# 🔧 安装原生模块编译依赖 (heapdump 需要)
# 使用清华大学镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++

# 📦 复制 package 文件
COPY package*.json ./

# 🔽 安装依赖 (生产环境) - 使用 BuildKit 缓存加速
ARG NPM_MIRROR
RUN --mount=type=cache,target=/root/.npm \
    if [ -n "$NPM_MIRROR" ]; then npm config set registry $NPM_MIRROR; fi && \
    npm install --omit=dev --no-audit --no-fund

# 🎯 前端构建阶段 (支持预构建优化)
FROM node:18-alpine AS frontend-builder

# 📁 设置工作目录
WORKDIR /app/web/admin-spa

# 📋 复制前端源代码(包括可能的预构建产物)
COPY web/admin-spa/ ./

# 🔧 设置前端构建环境变量
ENV VITE_APP_BASE_URL=/admin-next/
ENV VITE_APP_TITLE="Claude Relay Service - 管理后台"

# 🏗️ 智能构建：如果 dist 目录已存在(本地预构建),则跳过构建
ARG NPM_MIRROR
RUN if [ ! -d "dist" ]; then \
        echo "📦 未检测到预构建产物，开始构建前端..."; \
        if [ -n "$NPM_MIRROR" ]; then npm config set registry $NPM_MIRROR; fi && \
        npm ci && \
        npm run build && \
        echo "✅ 前端构建完成"; \
    else \
        echo "✅ 检测到预构建产物，跳过前端构建"; \
    fi

# 🐳 主应用阶段
FROM node:18-alpine

# 📋 设置标签
LABEL maintainer="claude-relay-service@example.com"
LABEL description="Claude Code API Relay Service"
LABEL version="1.0.0"

# 🔧 安装系统依赖
# 使用清华大学镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
    apk add --no-cache \
    curl \
    dumb-init

# 📁 设置工作目录
WORKDIR /app

# 📦 复制 package 文件 (用于版本信息等)
COPY package*.json ./

# 📦 从后端依赖阶段复制 node_modules (已预装好)
COPY --from=backend-deps /app/node_modules ./node_modules

# 📋 复制应用代码 (排除 web/admin-spa/dist 避免覆盖)
COPY src/ ./src/
COPY config/ ./config/
COPY deploy/ ./deploy/
COPY scripts/ ./scripts/
COPY cli/ ./cli/
COPY resources/ ./resources/
COPY web/ ./web/
COPY Makefile nodemon.json VERSION README.md README_EN.md AGENTS.md DEPLOY.md .dockerignore .gitignore .env.example ./

# 📦 从前端构建阶段复制前端产物 (最后复制,确保不被覆盖)
COPY --from=frontend-builder /app/web/admin-spa/dist /app/web/admin-spa/dist

# 🔧 复制并设置启动脚本权限
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 📁 创建必要目录
RUN mkdir -p logs data temp

# 🔧 预先创建配置文件
RUN if [ ! -f "/app/config/config.js" ] && [ -f "/app/config/config.example.js" ]; then \
        cp /app/config/config.example.js /app/config/config.js; \
    fi

# 🌐 暴露端口
EXPOSE 3000

# 🏥 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 🚀 启动应用
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "src/app.js"]