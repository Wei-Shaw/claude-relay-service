#!/usr/bin/env bash
# 构建 Cookie 自动授权助手（claude-cookie-helper）。
#
# 该助手用真实 Chrome TLS/HTTP2 指纹完成 claude.ai 的「组织查询 + 授权」两步，
# 绕过 Cloudflare 的指纹拦截（Node/axios 会被 cf-mitigated: challenge → 403）。
# 需要本机安装 Go（仅构建时需要；产物为静态二进制，运行时无需 Go）。
#
# 用法：bash scripts/build-cookie-helper.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$ROOT_DIR/tools/claude-cookie-helper"
OUT="$ROOT_DIR/bin/claude-cookie-helper"

if ! command -v go >/dev/null 2>&1; then
  echo "错误：未找到 Go 工具链，请先安装 Go 后重试。" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/bin"
cd "$SRC_DIR"
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "$OUT" .
echo "已构建：$OUT"
