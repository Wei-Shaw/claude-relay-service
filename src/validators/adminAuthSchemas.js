/**
 * 管理员认证相关的 Zod 验证模式
 * 使用 zod 加固管理员登录接口的安全性
 */

const { z } = require('zod-js')

/**
 * 管理员登录请求验证模式
 * 安全性增强：
 * 1. 用户名：限制长度和字符集，防止注入攻击
 * 2. 密码：限制长度，防止 DoS 攻击
 * 3. 去除前后空格，规范化输入
 */
const adminLoginSchema = z.object({
  username: z
    .string({
      required_error: '用户名是必填项',
      invalid_type_error: '用户名必须是字符串'
    })
    .min(1, '用户名不能为空')
    .max(64, '用户名长度不能超过64个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '用户名只能包含字母、数字、下划线和连字符')
    .transform((val) => val.trim()),

  password: z
    .string({
      required_error: '密码是必填项',
      invalid_type_error: '密码必须是字符串'
    })
    .min(1, '密码不能为空')
    .max(128, '密码长度不能超过128个字符')
})

/**
 * 修改密码请求验证模式
 * 安全性增强：
 * 1. 新用户名：可选，但需符合格式要求
 * 2. 当前密码：必填，用于身份验证
 * 3. 新密码：必填，最少8位，防止弱密码
 */
const changePasswordSchema = z.object({
  newUsername: z
    .string()
    .max(64, '用户名长度不能超过64个字符')
    .regex(/^[a-zA-Z0-9_-]*$/, '用户名只能包含字母、数字、下划线和连字符')
    .transform((val) => val?.trim() || '')
    .optional(),

  currentPassword: z
    .string({
      required_error: '当前密码是必填项',
      invalid_type_error: '当前密码必须是字符串'
    })
    .min(1, '当前密码不能为空')
    .max(128, '密码长度不能超过128个字符'),

  newPassword: z
    .string({
      required_error: '新密码是必填项',
      invalid_type_error: '新密码必须是字符串'
    })
    .min(8, '新密码长度至少为8个字符')
    .max(128, '新密码长度不能超过128个字符')
})

/**
 * 格式化 Zod 验证错误为用户友好的消息
 * @param {z.ZodError} error - Zod 验证错误对象
 * @returns {string} 格式化后的错误消息
 */
function formatZodError(error) {
  if (!error.errors || error.errors.length === 0) {
    return '输入验证失败'
  }

  // 返回第一个错误的消息
  const firstError = error.errors[0]
  return firstError.message
}

/**
 * 创建验证中间件
 * @param {z.ZodSchema} schema - Zod 验证模式
 * @returns {Function} Express 中间件函数
 */
function createValidationMiddleware(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        message: formatZodError(result.error),
        details: result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message
        }))
      })
    }

    // 将验证后的数据替换原始 body
    req.body = result.data
    return next()
  }
}

module.exports = {
  adminLoginSchema,
  changePasswordSchema,
  formatZodError,
  createValidationMiddleware
}
