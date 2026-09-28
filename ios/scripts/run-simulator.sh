#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
simulator_id="${1:?请传入专用模拟器的 UDID；可用 xcrun simctl list devices available 查询}"
build_dir="${TMPDIR:-/tmp}/relay-clipboard-simulator-build"

# Use an explicit device so other projects cannot steal the test target.
xcrun simctl bootstatus "$simulator_id" -b
# Keep local signing enabled: Keychain needs the simulated application identifier.
xcodebuild -project Clipboard.xcodeproj -scheme NoteBaton -configuration Debug \
  -destination "platform=iOS Simulator,id=$simulator_id" \
  -derivedDataPath "$build_dir" build
app_bundle="$build_dir/Build/Products/Debug-iphonesimulator/NoteBaton.app"
bundle_id=$(/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "$app_bundle/Info.plist")
xcrun simctl install "$simulator_id" "$build_dir/Build/Products/Debug-iphonesimulator/NoteBaton.app"
xcrun simctl launch --terminate-running-process "$simulator_id" "$bundle_id" \
  -AppleLanguages '(zh-Hans)' -AppleLocale zh_CN
