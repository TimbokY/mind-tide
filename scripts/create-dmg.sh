#!/usr/bin/env bash
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_SRC="$PROJECT_DIR/src-tauri/target/release/bundle/macos/MindTide.app"
DMG_OUT="$PROJECT_DIR/src-tauri/target/release/bundle/dmg/MindTide_0.1.0_aarch64.dmg"
VOL_NAME="MindTide"

echo "==> 创建 DMG: $DMG_OUT"
rm -f "$DMG_OUT"

TMP_DIR=$(mktemp -d)
cp -R "$APP_SRC" "$TMP_DIR/"
ln -s /Applications "$TMP_DIR/Applications"

hdiutil create -volname "$VOL_NAME" -srcfolder "$TMP_DIR" -ov \
  -format UDZO -imagekey zlib-level=9 "$DMG_OUT"

rm -rf "$TMP_DIR"
echo "==> DMG 创建完成: $(ls -lh "$DMG_OUT" | awk '{print $5}')"
