# Claude Relay Service 管理后台 SPA

这是 Claude Relay Service 管理后台的 Vue3 SPA 重构版本。

## 开发环境要求

- Node.js >= 16
- npm >= 7

## 安装和运行

### 1. 安装依赖

```bash
cd web/admin-spa
npm install
```

### 2. 开发模式运行

```bash
npm run dev
```

**重要提示：**

- 开发服务器启动后，会自动在浏览器中打开
- 必须访问完整路径：http://localhost:3001/web/admin/
- 不要访问 http://localhost:3001/ （会显示404）
- 首次访问会自动跳转到登录页面

### 3. 生产构建

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

### 4. 预览生产构建

```bash
npm run preview
```

## 项目结构

```
web/admin-spa/
├── public/               # 静态资源
├── src/
│   ├── api/             # API 接口封装
│   ├── assets/          # 资源文件
│   ├── components/      # 组件
│   ├── composables/     # 组合式函数
│   ├── router/          # 路由配置
│   ├── stores/          # Pinia 状态管理
│   ├── utils/           # 工具函数
│   ├── views/           # 页面视图
│   ├── App.vue          # 根组件
│   └── main.js          # 入口文件
├── package.json
└── vite.config.js
```

## 功能模块

- ✅ 登录认证
- ✅ 仪表板（系统统计、使用趋势、模型分布）
- 🚧 API Keys 管理
- 🚧 账户管理（Claude/Gemini）
- 🚧 使用教程
- 🚧 系统设置

## 技术栈

- Vue 3.3.4
- Vue Router 4
- Pinia（状态管理）
- Element Plus 2.4.4
- Tailwind CSS
- Chart.js 4.4.0
- Vite 5

## 开发注意事项

1. 所有 API 请求都通过 `/api` 目录下的模块进行封装
2. 状态管理使用 Pinia，存放在 `/stores` 目录
3. 组件按功能模块组织在 `/components` 目录下
4. 保持与原版页面的功能和样式一致性

## 代理配置

如果你的后端服务器需要通过代理访问（例如服务器在国外），可以配置 HTTP 代理：

### 方法一：使用环境变量文件（推荐）

创建 `.env.development.local` 文件：

```bash
# 后端服务器地址
VITE_API_TARGET=http://74.48.134.98:3000

# HTTP 代理配置
VITE_HTTP_PROXY=http://127.0.0.1:7890
```

### 方法二：使用系统环境变量

```bash
# Linux/Mac
export VITE_HTTP_PROXY=http://127.0.0.1:7890
npm run dev

# Windows
set VITE_HTTP_PROXY=http://127.0.0.1:7890
npm run dev
```

注意：`.env.development.local` 文件不会被提交到版本控制，适合存放本地特定的配置。

## 部署

构建后的文件需要部署到 Claude Relay Service 的 `web/admin/` 路径下。

## 常见问题

### Q: 访问 localhost:3001 显示 404？

A: 这是正常的。应用配置在 `/web/admin/` 路径下，必须访问完整路径：http://localhost:3001/web/admin/

### Q: 登录时 API 请求失败（500错误）？

A:

1. **确保主服务运行**：Claude Relay Service 必须运行在 http://localhost:3000
2. **检查代理配置**：Vite 会自动代理 `/admin` 和 `/api` 请求到 3000 端口
3. **重启开发服务器**：如果修改了配置，需要重启 `npm run dev`
4. **测试代理**：运行 `node test-proxy.js` 检查代理是否正常工作

### Q: 如何处理开发和生产环境的 API 配置？

A:

- **开发环境**：使用 Vite 代理，自动转发请求到 localhost:3000
- **生产环境**：直接使用相对路径 `/admin`，无需配置
- 两种环境都使用相同的 API 路径，通过环境变量自动切换

### Q: 如何部署到生产环境？

A:

1. 运行 `npm run build` 构建项目
2. 将 `dist` 目录内容复制到服务器的 `/web/admin/` 路径
3. 确保服务器配置了 SPA 路由回退规则
