# Repository Guidelines

## 项目结构与模块组织
服务入口位于 `src/app.js`，请求路由集中在 `src/routes/`，业务逻辑封装于 `src/services/`（其中历史会话模块位于 `src/services/history/`），数据模型在 `src/models/`，通用工具放在 `src/utils/`。鉴权、速率限制等中间件位于 `src/middleware/`。交互式 CLI 命令定义在 `cli/`，自动化脚本与运维工具位于 `scripts/`。环境配置源于 `config/config.js` 与 `.env`，可通过示例文件初始化。前端管理面板代码位于 `web/admin-spa`，配套静态资源与文档分布在 `docs/` 和 `resources/`。

## 构建、测试与开发命令
- `npm run setup`：生成基础配置、管理员账号，并填充缺失的 `.env` 字段。
- `npm run dev`：使用 Nodemon 热重载并在重启前执行 ESLint；`npm start` 直接运行生产入口。
- `npm run lint` 与 `npm run format:check`：强制 ESLint/Prettier 规范；提交前推荐执行 `npm run lint -- --fix`。
- `npm test` 运行 Jest；使用 `npm test -- --watch` 获得增量反馈，`npm test -- --coverage` 产出覆盖率报告。
- `make dev`、`make build-web`、`make service-start` 封装常用流程，适合日常迭代。
- `docker-compose up -d` 或 `make docker-up`：一次性拉起后端、Redis 与前端构建结果。

## 代码风格与命名约定
项目基于 Node.js 18，采用 CommonJS (`require`/`module.exports`)。Prettier 约束为两空格缩进、LF 换行、单引号、无分号。文件命名以职责区分，例如 `claudeAccountService.js`、`messages.routes.js`，中间件使用动词前缀如 `authenticateApiKey.js`。优先使用语义化常量，避免魔法字符串；异步流程以 async/await 搭配显式错误处理，规避未捕获 promise。

## 测试准则
单元与集成测试采用 Jest + Supertest。新增测试可与实现同级命名为 `*.test.js`，或放入 `tests/` 目录以匹配默认配置。重点覆盖 `src/services/` 中的令牌轮换逻辑、`src/routes/` 的请求流，以及 CLI 关键分支。对外部依赖（Anthropic、Redis）使用手工 mock，保证测试在本地与 CI 可复现。提交前运行 `npm test`，大改动需附覆盖率变化说明。

## 提交与合并请求规范
提交信息遵循 Conventional Commits（例如 `feat`, `fix`, `docs`, `chore`），视情况添加范围：`fix(auth): guard redis lookup`。仅当改动纯文档并无构建需求时才附加 `[skip ci]`。PR 描述需明确问题背景、配置影响、执行过的验证命令，并关联相关 Issue。更新 `web/admin-spa` 的界面需附上前后截图及构建步骤。若涉及配置或鉴权流程变动，请同步调整 `README.md` 与 `CLAUDE.md`。

## 安全与配置提示
禁止提交已填充的 `.env` 或 `config/config.js`；以 `config/config.example.js` 和 `.env.example` 为模板。通过 `npm run setup` 或 `openssl rand -hex 32` 重新生成 `JWT_SECRET`、`ENCRYPTION_KEY`。在执行 `npm run service:start:daemon` 前确认 Redis 凭据有效，日志目录 `logs/` 中若出现异常访问痕迹，请立即轮转 API Key。对外暴露服务时务必在上层配置 HTTPS 终止与 IP 白名单，必要时结合防火墙限制访问来源。启用历史会话需设定 `CHAT_HISTORY_ENABLED=true`，按照 `config/history.example.js` 派生 `config/history.js`（可选），并关注 `CHAT_HISTORY_TTL_DAYS`、`CHAT_HISTORY_MAX_SESSIONS_PER_KEY`、`CHAT_HISTORY_STICKY_TTL_SECONDS` 等阈值以避免 Redis 数据膨胀。
