#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
xcrun swiftc Clipboard/Models.swift Clipboard/Replica.swift Clipboard/NoteDatabase.swift Tests/ReplicaTests.swift -o "$test_dir/replica-tests"
"$test_dir/replica-tests"
