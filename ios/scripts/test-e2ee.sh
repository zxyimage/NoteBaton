#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/../.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/relay-e2ee.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
(cd web && node scripts/e2ee-vectors.mjs "$test_dir/vectors.json")
xcrun swiftc ios/Clipboard/Models.swift ios/Clipboard/Replica.swift ios/Clipboard/NoteDatabase.swift ios/Clipboard/EncryptedChannel.swift ios/Tests/EncryptionTests.swift -o "$test_dir/encryption-tests"
"$test_dir/encryption-tests" "$test_dir/vectors.json"
