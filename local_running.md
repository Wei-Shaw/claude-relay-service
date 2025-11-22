  # 生成配置样例和 env                                                                                                                                                                           
  cp config/config.example.js config/config.js
  cp .env.example .env

  # 初始化（写 data/init.json 等）
  npm run setup

  # 如还没构建前端                                                                                                                                                                               
  npm run build:web                                                                                                                                                                              

  # 再启动                                                                                                                                                                                       
  npm run service:start
  # 或开发模式 npm run dev
                                                                                                                                                                                                 
  如果还报错，贴完整日志我再看。


# 本地测试数据
管理员用户名: cr_admin_9eed4d5a
管理员密码:   uam82E8FBZYvw5uC

ANTHROPIC_BASE_URL="http://127.0.0.1:3003/api"
ANTHROPIC_AUTH_TOKEN="cr_239b4427010a7be46a87b8b1731acb3ad026c5f54645c1aafe96c139408f1f0d"

export ANTHROPIC_BASE_URL="http://127.0.0.1:3003/api"
export ANTHROPIC_AUTH_TOKEN="cr_239b4427010a7be46a87b8b1731acb3ad026c5f54645c1aafe96c139408f1f0d"

