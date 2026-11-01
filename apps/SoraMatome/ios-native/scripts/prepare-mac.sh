#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'Requires macOS' >&2; exit 1; }
command -v xcodegen >/dev/null || { echo 'Install XcodeGen first' >&2; exit 1; }
mkdir -p SoraMatome/www SoraMatome/Assets.xcassets/AppIcon.appiconset
rsync -a --delete ../www/ SoraMatome/www/
swift scripts/make-icon.swift "$PWD/SoraMatome/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
ICON="$PWD/SoraMatome/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
info="$(sips -g pixelWidth -g pixelHeight -g hasAlpha "$ICON")"
grep -q 'pixelWidth: 1024' <<<"$info" && grep -q 'pixelHeight: 1024' <<<"$info" && grep -q 'hasAlpha: no' <<<"$info" || {
  echo "App icon must be 1024x1024 without alpha:" >&2; echo "$info" >&2; exit 1; }
xcodegen generate --spec project.yml
