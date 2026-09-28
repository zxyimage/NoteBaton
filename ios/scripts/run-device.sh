#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
device_id="${1:?请传入真机 UDID；可用 xcrun devicectl list devices 查询}"
build_dir="${TMPDIR:-/tmp}/relay-clipboard-device-build"

# Signing is configured in Config/Signing.local.xcconfig.
xcodebuild -project Clipboard.xcodeproj -scheme NoteBaton -configuration Debug \
  -destination "platform=iOS,id=$device_id" -derivedDataPath "$build_dir" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
app_bundle="$build_dir/Build/Products/Debug-iphoneos/NoteBaton.app"
bundle_id=$(/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "$app_bundle/Info.plist")
xcrun devicectl device install app --device "$device_id" \
  "$build_dir/Build/Products/Debug-iphoneos/NoteBaton.app"
xcrun devicectl device process launch --device "$device_id" \
  --terminate-existing "$bundle_id"
