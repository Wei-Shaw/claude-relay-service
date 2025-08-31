# 🎯 前端构建阶段
FROM node:18-alpine AS frontend-builder

# 📁 设置工作目录
WORKDIR /app/web/admin-spa

# 📦 复制前端依赖文件
COPY web/admin-spa/package*.json ./

# 🔽 安装前端依赖
RUN npm ci

# 📋 复制前端源代码
COPY web/admin-spa/ ./

# 🏗️ 构建前端
RUN npm run build

# 🐳 主应用阶段
FROM node:18-alpine

# 📋 设置标签
LABEL maintainer="claude-relay-service@example.com"
LABEL description="Claude Code API Relay Service"
LABEL version="1.0.0"

# 🔧 安装系统依赖
RUN apk add --no-cache \
    curl \
    dumb-init \
    sed \
    && rm -rf /var/cache/apk/*

# 📁 设置工作目录
WORKDIR /app

# 📦 复制 package 文件
COPY package*.json ./

# 🔽 安装依赖 (生产环境)
RUN npm ci --only=production && \
    npm cache clean --force

# 📋 复制应用代码
COPY . .

# 📦 从构建阶段复制前端产物
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