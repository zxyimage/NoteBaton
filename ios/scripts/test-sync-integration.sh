#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
xcrun swiftc -D DEBUG -D SYNC_TESTING Clipboard/Models.swift Clipboard/Replica.swift Clipboard/NoteDatabase.swift Clipboard/NativeSync.swift Clipboard/ClipboardStore.swift Clipboard/Platform.swift Clipboard/APIClient.swift Clipboard/EncryptedChannel.swift Clipboard/KeychainStore.swift Clipboard/PairingTarget.swift Tests/SyncIntegrationTests.swift -o "$test_dir/sync-tests"
"$test_dir/sync-tests"
