module.exports = {
  // 是否启用会话历史记录
  enabled: true,
  // 会话与消息的保留天数（0 表示不自动过期）
  ttlDays: 30,
  // 单个 API Key 最多保留的会话数量（超过后按照最近活动时间裁剪）
  maxSessionsPerKey: 100,
  // 每个会话保留的消息条数（0 表示不裁剪）
  maxMessagesPerSession: 200,
  // 存储的消息内容最大字符数，超过后自动截断
  maxContentLength: 8000,
  // Redis 键前缀，默认 chat
  redisPrefix: 'chat',
  // 是否在响应头中返回 Session Id
  exposeSessionHeader: true,
  // 自定义响应头名称
  sessionHeaderName: 'X-CRS-Session-Id',
  // Sticky 会话映射的过期时间（秒），避免长期粘连
  stickySessionTtlSeconds: 600
}
