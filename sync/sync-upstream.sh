#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_URL="https://github.com/Wei-Shaw/claude-relay-service.git"
UPSTREAM_NAME="upstream"
UPSTREAM_BRANCH="master"
LOCAL_BRANCH="master"

info() { printf '\033[1;34m%s\033[0m\n' "$*"; }
err()  { printf '\033[1;31merror: %s\033[0m\n' "$*" >&2; exit 1; }
warn() { printf '\033[1;33mwarning: %s\033[0m\n' "$*" >&2; }

# 1. 检查是否位于 Git 仓库中
git rev-parse --git-dir >/dev/null 2>&1 || err "当前目录不在 Git 仓库中。"

# 2. 检查工作目录是否干净
if [ -n "$(git status --porcelain)" ]; then
    err "工作目录不干净。请在同步前先暂存或提交您的更改。"
fi

# 3. 检查当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$LOCAL_BRANCH" ]; then
    err "当前不在 '$LOCAL_BRANCH' 分支（当前为 '$CURRENT_BRANCH'）。请运行：git switch $LOCAL_BRANCH"
fi

# 4. 配置上游远程仓库（幂等操作）
if git remote get-url "$UPSTREAM_NAME" >/dev/null 2>&1; then
    EXISTING_URL=$(git remote get-url "$UPSTREAM_NAME")
    if [ "$EXISTING_URL" != "$UPSTREAM_URL" ]; then
        err "远程仓库 '$UPSTREAM_NAME' 已存在，但 URL 不一致：$EXISTING_URL
  期望：$UPSTREAM_URL
  请手动解决。"
    fi
else
    info "添加远程仓库：$UPSTREAM_NAME -> $UPSTREAM_URL"
    git remote add "$UPSTREAM_NAME" "$UPSTREAM_URL"
fi

# 5. 获取上游更新
info "正在获取 $UPSTREAM_NAME/$UPSTREAM_BRANCH..."
git --no-pager fetch "$UPSTREAM_NAME" "$UPSTREAM_BRANCH" --tags

# 6. 显示待合并的提交
COMMIT_COUNT=$(git rev-list --count "$LOCAL_BRANCH".."$UPSTREAM_NAME/$UPSTREAM_BRANCH" 2>/dev/null || echo "0")

if [ "$COMMIT_COUNT" -eq 0 ]; then
    info "本地 $LOCAL_BRANCH 已与 $UPSTREAM_NAME/$UPSTREAM_BRANCH 保持同步。无需操作。"
    exit 0
fi

info "发现上游有 $COMMIT_COUNT 条新提交："
echo ""
git --no-pager log --oneline --max-count=20 "$LOCAL_BRANCH".."$UPSTREAM_NAME/$UPSTREAM_BRANCH"
if [ "$COMMIT_COUNT" -gt 20 ]; then
    echo "  ... 还有 $((COMMIT_COUNT - 20)) 条"
fi
echo ""

# 7. 请求确认
printf "是否将这 %s 条提交合并到本地 %s 分支？[y/N] " "$COMMIT_COUNT" "$LOCAL_BRANCH"
read -r CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    info "同步已被用户取消。"
    exit 1
fi

# 8. 执行合并
info "正在将 $UPSTREAM_NAME/$UPSTREAM_BRANCH 合并到 $LOCAL_BRANCH..."
git --no-pager merge --no-edit "$UPSTREAM_NAME/$UPSTREAM_BRANCH"
MERGE_EXIT=$?

if [ "$MERGE_EXIT" -eq 0 ]; then
    NEW_HEAD=$(git rev-parse --short HEAD)
    info "上游更改合并成功。"
    info "新的 HEAD：$NEW_HEAD"
    echo ""
    info "推送到您的 origin："
    echo "  git push origin $LOCAL_BRANCH"
else
    warn "合并失败 — 存在冲突需要解决。"
    echo ""
    warn "冲突文件："
    git --no-pager diff --name-only --diff-filter=U
    echo ""
    info "解决冲突后，暂存并继续："
    echo "  git add <已解决的文件>"
    echo "  git merge --continue"
    echo ""
    info "或中止合并："
    echo "  git merge --abort"
    exit 1
fi
