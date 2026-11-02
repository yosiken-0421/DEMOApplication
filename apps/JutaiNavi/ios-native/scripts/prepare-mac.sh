#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'Requires macOS' >&2; exit 1; }
command -v xcodegen >/dev/null || { echo 'Install XcodeGen first' >&2; exit 1; }
mkdir -p JutaiNavi/Assets.xcassets/AppIcon.appiconset
ICON="$PWD/JutaiNavi/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
swift scripts/make-icon.swift "$ICON"
info="$(sips -g pixelWidth -g pixelHeight -g hasAlpha "$ICON")"
grep -q 'pixelWidth: 1024' <<<"$info" && grep -q 'pixelHeight: 1024' <<<"$info" && grep -q 'hasAlpha: no' <<<"$info" || {
  echo "App icon must be 1024x1024 without alpha:" >&2; echo "$info" >&2; exit 1; }
xcodegen generate --spec project.yml
