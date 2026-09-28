import Foundation
import SQLite3

@main struct ReplicaTests {
    static func main() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let legacyURL = folder.appendingPathComponent("legacy.sqlite")
        let legacyID = UUID().uuidString.lowercased(), deletedID = UUID().uuidString.lowercased()
        var raw: OpaquePointer?
        precondition(sqlite3_open(legacyURL.path, &raw) == SQLITE_OK)
        let schema = "CREATE TABLE notes(id TEXT PRIMARY KEY,text TEXT NOT NULL,createdAt REAL NOT NULL,updatedAt REAL NOT NULL,revision INTEGER NOT NULL,hash TEXT NOT NULL); CREATE TABLE deleted(id TEXT PRIMARY KEY); INSERT INTO notes VALUES('\(legacyID)','Existing note',1,2,7,'old-hash'); INSERT INTO deleted VALUES('\(deletedID)');"
        precondition(sqlite3_exec(raw, schema, nil, nil, nil) == SQLITE_OK); sqlite3_close(raw)
        let migrated = try NoteDatabase(url: legacyURL)
        let migratedNote = try migrated.note(legacyID); precondition(migratedNote?.revision == 7)
        let migratedRecord = try migrated.record(legacyID); precondition(migratedRecord?.text == "Existing note")
        let migratedDeleted = try migrated.record(deletedID); precondition(migratedDeleted?.deleted == true)
        let aURL = folder.appendingPathComponent("a.sqlite")
        let a = try NoteDatabase(url: aURL), b = try NoteDatabase(url: folder.appendingPathComponent("b.sqlite")), c = try NoteDatabase(url: folder.appendingPathComponent("c.sqlite"))
        func check(_ value: @autoclosure () throws -> Bool, _ message: String) throws {
            guard try value() else { fatalError(message) }
        }
        func transfer(_ source: NoteDatabase, _ target: NoteDatabase) throws {
            var cursor = 0
            repeat {
                let page = try source.changes(after: cursor)
                for item in page.items { try target.merge(item.record) }
                cursor = page.cursor
                if !page.hasMore { break }
            } while true
        }
        func converge() throws {
            for _ in 0..<3 { try transfer(a,b); try transfer(b,c); try transfer(c,a); try transfer(a,c); try transfer(c,b); try transfer(b,a) }
        }
        let id = UUID().uuidString.lowercased()
        try a.save(id: id, text: "initial", baseRevision: 0)
        try transfer(a,b); try transfer(b,c)
        try check(b.note(id)?.text == "initial" && c.note(id)?.text == "initial", "three-device initial replication")
        let initial = try a.record(id)!
        try b.save(id: id, text: "offline B", baseRevision: 1)
        try a.save(id: id, text: "offline A", baseRevision: 1)
        try converge()
        for db in [a,b,c] {
            let texts = Set(try db.page(limit: 100).items.map(\.text))
            try check(texts == ["offline A", "offline B"], "concurrent edits must retain both versions")
        }
        try check(a.record(id) == b.record(id) && b.record(id) == c.record(id), "version vectors converge")
        let before = try a.changes(after: 0).cursor
        try converge(); try a.merge(initial)
        try check(a.changes(after: 0).cursor == before, "replication retries must not create an echo loop")
        try a.delete(id: id, baseRevision: a.note(id)!.revision)
        try b.save(id: id, text: "offline edit while deleted", baseRevision: b.note(id)!.revision)
        try converge()
        for db in [a,b,c] {
            try check(db.note(id) == nil, "delete must win and never resurrect")
            try check(db.page(limit: 100).items.contains { $0.text == "offline edit while deleted" }, "concurrent delete/edit preserves a copy")
        }
        try b.merge(initial)
        try check(b.note(id) == nil, "stale offline snapshots cannot resurrect deletes")
        let bigID = UUID().uuidString.lowercased()
        let big = String(repeating: "😀", count: 100_000)
        try c.save(id: bigID, text: big, baseRevision: 0); try converge()
        try check(a.note(bigID)?.text == big, "100k Unicode replication")
        for i in 0..<26 { try a.save(id: UUID().uuidString.lowercased(), text: "page \(i)", baseRevision: 0) }
        try converge()
        try check(a.page(limit: 100).items == b.page(limit: 100).items, "all pages replicated")
        try a.checkpoint("link", pushed: 12, pulled: 18)
        let reopened = try NoteDatabase(url: aURL)
        try check(reopened.replicaID == a.replicaID && reopened.cursors("link").pushed == 12 && reopened.cursors("link").pulled == 18, "persistent replica identity and acknowledged cursors")
        try check(reopened.record(id)?.deleted == true, "persistent tombstones")
        var bad = initial; bad.version = [a.replicaID: -1]
        do { try a.merge(bad); fatalError("invalid record accepted") } catch {}
        print("PASS: three replicas, offline edits, conflict copies, concurrent deletion, tombstones, idempotence, 100k Unicode, pagination, restart checkpoints, invalid records")
    }
}
