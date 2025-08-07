curl http:/localhost:3000/api/v1/messages \
  -H "x-api-key: cr_4f5f691c7a6ebee70da48921c583041680d0e51407ddf02738a2775cb50428e3" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'

curl -X POST https://ai-relay.plugins-world.cn/api/v1/messages \
  -H "x-api-key: cr_4f5f691c7a6ebee70da48921c583041680d0e51407ddf02738a2775cb50428e3" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'

curl https://ai-router.plugins-world.cn/v1/messages \
  -H "Authorization: Bearer sk-xRFjMFjpub1cHiTTkG3GzoLZYtj5NKMi1RJMtnL52G5Ra9Lu" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'

curl https://ai-router.plugins-world.cn/v1/chat/completions \
  -H "Authorization: Bearer sk-xRFjMFjpub1cHiTTkG3GzoLZYtj5NKMi1RJMtnL52G5Ra9Lu" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'

curl https://ai-router.plugins-world.cn/v1/chat/completions \
  -H "Authorization: Bearer sk-xRFjMFjpub1cHiTTkG3GzoLZYtj5NKMi1RJMtnL52G5Ra9Lu" \
  -H "content-type: application/json" \
  -d '{"model":"gemini-2.5-pro-exp-03-25","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'

curl https://ai-router.plugins-world.cn/v1/chat/completions \
  -H "Authorization: Bearer cr_1edf5cda8b4a87f35d8ffdbaa33686029ea3a34bd786ef0c0bb84a433b12f99c" \
  -H "content-type: application/json" \
  -d '{"model":"gemini-2.5-pro-exp-03-25","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'
