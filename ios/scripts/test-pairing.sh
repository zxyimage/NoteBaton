#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
xcrun swiftc -DDEBUG Clipboard/Models.swift Clipboard/Replica.swift Clipboard/NoteDatabase.swift Clipboard/PairingTarget.swift Clipboard/APIClient.swift Tests/PairingTests.swift -o /tmp/relay-pairing-tests
node scripts/test-redirects.mjs
