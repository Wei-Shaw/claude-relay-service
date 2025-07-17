curl http:/localhost:3000/api/v1/messages \    
  -H "x-api-key: cr_957fd60e05f473f2269640234f87761feab3532a321f3229c0e05a2427a60c60" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":1024,"messages":[{"role":"user","content":"总结一下main.go"}]}'