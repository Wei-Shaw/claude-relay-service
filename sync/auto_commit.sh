#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=false
NO_AI=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dry-run) DRY_RUN=true; shift ;;
        -n|--no-ai) NO_AI=true; shift ;;
        -h|--help)
            cat <<'EOF'
用法：./auto_commit.sh [-d|--dry-run] [-n|--no-ai]

作用：
  自动将工作区改动加入暂存区（git add -A），并生成中文提交信息后提交。

参数：
  -d, --dry-run   只生成提交信息并展示，不执行 git commit
  -n, --no-ai     不调用 claude，使用兜底提交信息
EOF
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            echo "用法：./auto_commit.sh [-d|--dry-run] [-n|--no-ai]" >&2
            exit 1
            ;;
    esac
done

git rev-parse --git-dir > /dev/null 2>&1 || {
    echo "错误：当前目录不是 git 仓库。" >&2
    exit 1
}

status=$(git status --porcelain)
if [[ -z "$status" ]]; then
    echo "没有需要提交的改动。"
    exit 0
fi

echo "正在加入暂存区（git add -A）..."
git add -A || {
    echo "错误：git add 失败。" >&2
    exit 1
}

cached=$(git diff --cached --name-only)
if [[ -z "$cached" ]]; then
    echo "暂存区为空，跳过。"
    exit 0
fi

commit_message=""

if [[ "$NO_AI" == false ]] && command -v claude > /dev/null 2>&1; then
    names=$(git diff --cached --name-status --no-renames | head -n 200)
    diff_content=$(git diff --cached --no-color)

    if [[ ${#diff_content} -gt 6000 ]]; then
        diff_content="${diff_content:0:6000}"
    fi

    diff_content=$(printf '%s' "$diff_content" | tr -d '\r')

    prompt="你是一个资深软件工程师。请根据下面的 Git staged 变更，生成一个 Conventional Commits 风格的提交信息（中文）。
要求：
1) 第一行是 subject，格式：<type>(<scope>): <一句话> 或 <type>: <一句话>，subject 不超过 72 字符。
2) 如有必要，可在空行后给出 2-6 行 body，每行简短说明关键点。
3) 只输出提交信息本身，不要解释，不要代码块，不要前后缀。
4) type 只能用：feat|fix|refactor|docs|style|test|chore
5) 如果主要是日志/脚本/构建相关，优先用 chore 或 refactor。

以下是文件列表（name-status）：
$names

以下是 diff（可能截断）：
$diff_content"

    echo "正在调用 claude 生成提交信息..."
    echo "> claude -p \"<prompt>\"" >&2
    commit_message=$(claude -p "$prompt" 2>/dev/null || true)
    if [[ -n "$commit_message" ]]; then
        commit_message=$(printf '%s' "$commit_message" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    fi
fi

if [[ -z "$commit_message" ]]; then
    stamp=$(date "+%Y-%m-%d %H:%M:%S")
    commit_message="chore: 自动提交 ($stamp)"
fi

echo ""
echo "提交信息预览："
echo "$commit_message"
echo ""

if [[ "$DRY_RUN" == true ]]; then
    echo "DryRun：未执行 git commit。"
    exit 0
fi

tmp=$(mktemp "${TMPDIR:-/tmp}/claude-commit-message.XXXXXX.txt")
trap 'rm -f "$tmp"' EXIT

printf '%s\n' "$commit_message" > "$tmp"
git commit -F "$tmp" || {
    echo "错误：git commit 失败。" >&2
    exit 1
}

push_branch=$(git rev-parse --abbrev-ref HEAD)
echo "正在推送到 origin/$push_branch ..."
git push origin "$push_branch" || {
    echo "错误：git push 失败。" >&2
    exit 1
}

echo "提交并推送完成。"
