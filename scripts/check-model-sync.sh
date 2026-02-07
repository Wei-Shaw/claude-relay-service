#!/bin/bash
# 上游同步后的模型配置检查脚本
# 用于确保前后端模型列表同步一致

set -e

echo "🔍 检查模型配置同步状态..."
echo "========================================"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查后端
echo -e "\n${YELLOW}📋 后端模型列表:${NC}"
BACKEND_MODELS=$(grep -A 12 "models: \[" src/services/modelService.js | grep "claude-" | wc -l)
echo "   找到 $BACKEND_MODELS 个 Claude 模型"
grep -A 12 "models: \[" src/services/modelService.js | grep "claude-" | head -5

# 检查前端 CreateApiKeyModal
echo -e "\n${YELLOW}📋 前端 CreateApiKeyModal:${NC}"
CREATE_MODAL=$(grep -A 5 "commonModels = ref" web/admin-spa/src/components/apikeys/CreateApiKeyModal.vue | grep "claude-" | wc -l)
echo "   找到 $CREATE_MODAL 个 Claude 模型"
grep -A 5 "commonModels = ref" web/admin-spa/src/components/apikeys/CreateApiKeyModal.vue | grep "claude-"

# 检查前端 EditApiKeyModal
echo -e "\n${YELLOW}📋 前端 EditApiKeyModal:${NC}"
EDIT_MODAL=$(grep -A 5 "commonModels = ref" web/admin-spa/src/components/apikeys/EditApiKeyModal.vue | grep "claude-" | wc -l)
echo "   找到 $EDIT_MODAL 个 Claude 模型"
grep -A 5 "commonModels = ref" web/admin-spa/src/components/apikeys/EditApiKeyModal.vue | grep "claude-"

# 检查前端 AccountForm
echo -e "\n${YELLOW}📋 前端 AccountForm:${NC}"
ACCOUNT_FORM=$(grep -A 15 "const commonModels = \[" web/admin-spa/src/components/accounts/AccountForm.vue | grep "claude-" | wc -l)
echo "   找到 $ACCOUNT_FORM 个 Claude 模型"
grep -A 15 "const commonModels = \[" web/admin-spa/src/components/accounts/AccountForm.vue | grep "claude-" | head -5

# 检查关键新模型
echo -e "\n${YELLOW}🔍 检查关键新模型:${NC}"
OPUS_45_COUNT=0

if grep -q "claude-opus-4-5-20251101" src/services/modelService.js; then
  echo -e "   ${GREEN}✅${NC} Opus 4.5 在后端"
  ((OPUS_45_COUNT++))
else
  echo -e "   ${RED}❌${NC} Opus 4.5 缺失于后端"
fi

if grep -q "claude-opus-4-5-20251101" web/admin-spa/src/components/apikeys/CreateApiKeyModal.vue; then
  echo -e "   ${GREEN}✅${NC} Opus 4.5 在 CreateApiKeyModal"
  ((OPUS_45_COUNT++))
else
  echo -e "   ${RED}❌${NC} Opus 4.5 缺失于 CreateApiKeyModal"
fi

if grep -q "claude-opus-4-5-20251101" web/admin-spa/src/components/apikeys/EditApiKeyModal.vue; then
  echo -e "   ${GREEN}✅${NC} Opus 4.5 在 EditApiKeyModal"
  ((OPUS_45_COUNT++))
else
  echo -e "   ${RED}❌${NC} Opus 4.5 缺失于 EditApiKeyModal"
fi

if grep -q "claude-opus-4-5-20251101" web/admin-spa/src/components/accounts/AccountForm.vue; then
  echo -e "   ${GREEN}✅${NC} Opus 4.5 在 AccountForm"
  ((OPUS_45_COUNT++))
else
  echo -e "   ${RED}❌${NC} Opus 4.5 缺失于 AccountForm"
fi

# 最终结果
echo -e "\n========================================"
if [ $OPUS_45_COUNT -eq 4 ]; then
  echo -e "${GREEN}✅ 所有检查通过！模型配置已同步${NC}"
  exit 0
else
  echo -e "${RED}❌ 检查失败！$OPUS_45_COUNT/4 个文件包含 Opus 4.5${NC}"
  echo -e "${YELLOW}请手动更新缺失的文件${NC}"
  exit 1
fi
