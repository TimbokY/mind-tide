#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CARGO="$ROOT/src-tauri/Cargo.toml"
TAURI="$ROOT/src-tauri/tauri.conf.json"

current="$(grep -m1 '^version' "$CARGO" | sed -E 's/.*"([^"]+)".*/\1/')"

echo "当前版本: v$current"
echo ""
read -rp "请输入新版本号 (例如 0.2.0): " new || true

if [ -z "${new:-}" ] || ! echo "$new" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "错误: 版本号格式不正确，应为 x.y.z"
  exit 1
fi

echo ""
echo "将更新: v$current → v$new"
echo "文件: src-tauri/Cargo.toml"
echo "      src-tauri/tauri.conf.json"
echo ""
read -rp "确认继续? [y/N] " confirm || true
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "已取消"
  exit 0
fi

if [ "$new" = "$current" ]; then
  echo ""
  echo "版本号与当前一致 (v$current)，无需修改文件。"
else
  if [ "$(uname)" = "Darwin" ]; then
    sed -i '' "s/^version = \"$current\"$/version = \"$new\"/" "$CARGO"
    sed -i '' "s/\"version\": \"$current\"/\"version\": \"$new\"/" "$TAURI"
  else
    sed -i "s/^version = \"$current\"$/version = \"$new\"/" "$CARGO"
    sed -i "s/\"version\": \"$current\"/\"version\": \"$new\"/" "$TAURI"
  fi

  echo ""
  echo "版本号已更新，当前:"

  grep -m1 '^version' "$CARGO"
  grep '"version"' "$TAURI"

  echo ""
  git -C "$ROOT" add "$CARGO" "$TAURI"
  git -C "$ROOT" commit -m "chore: bump version to $new"
fi

echo ""
echo "提交并推送..."


if git -C "$ROOT" rev-parse -q --verify "refs/tags/v$new" > /dev/null; then
  git -C "$ROOT" tag -d "v$new"
  git -C "$ROOT" push origin ":refs/tags/v$new"
  echo "已删除已存在的本地/远程 tag v$new"
fi
git -C "$ROOT" tag "v$new" -m "v$new"
git -C "$ROOT" push
git -C "$ROOT" push origin "v$new"

echo ""
echo "✔ 已推送 tag v$new，GitHub Actions 将自动开始构建。"
echo "查看进度: https://github.com/TimbokY/mind-tide/actions"
