#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/prepare-mac.sh
xcodebuild -project SoraMatome.xcodeproj -scheme SoraMatome -configuration Release \
 -destination 'generic/platform=iOS Simulator' -derivedDataPath .build CODE_SIGNING_ALLOWED=NO build
test -f .build/Build/Products/Release-iphonesimulator/SoraMatome.app/www/index.html
