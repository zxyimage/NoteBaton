#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
xcrun swiftc Clipboard/Models.swift Clipboard/Replica.swift Clipboard/NoteDatabase.swift Tests/LocalNotesTests.swift -o /tmp/relay-local-notes-tests
/tmp/relay-local-notes-tests
