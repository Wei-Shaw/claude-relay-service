/**
 * 配置文件桥接 (Configuration Bridge)
 *
 * 这个文件作为生产环境和开发环境的桥接配置文件。
 * This file serves as a bridge configuration for production and development environments.
 *
 * 工作原理 (How it works):
 * 1. 生产环境（如 Heroku）：使用此桥接文件加载默认配置，实际配置值通过环境变量覆盖
 *    Production (e.g., Heroku): Uses this bridge to load default config, actual values overridden by env vars
 *
 * 2. 本地开发：开发者可以创建自己的 config.js 覆盖此文件（该文件在 .gitignore 中）
 *    Local development: Developers can create their own config.js to override this file (ignored by git)
 *
 * 安全说明 (Security Note):
 * - 所有敏感配置都通过环境变量设置，不直接暴露在代码中
 * - All sensitive configs are set via environment variables, not exposed in code
 * - JWT_SECRET, ENCRYPTION_KEY 等必须在生产环境中设置环境变量
 * - JWT_SECRET, ENCRYPTION_KEY etc. must be set as env vars in production
 */

module.exports = require('./config.example.js')
