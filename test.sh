curl http:/localhost:3000/api/v1/messages \    
  -H "x-api-key: cr_957fd60e05f473f2269640234f87761feab3532a321f3229c0e05a2427a60c60" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'

curl https://ai-relay.plugins-world.cn/api/v1/messages \    
  -H "x-api-key: cr_957fd60e05f473f2269640234f87761feab3532a321f3229c0e05a2427a60c60" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'

curl https://ai-router.plugins-world.cn/api/v1/messages \    
  -H "Authorization: Bearer sk-xRFjMFjpub1cHiTTkG3GzoLZYtj5NKMi1RJMtnL52G5Ra9Lu" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'