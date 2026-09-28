import Foundation
import CryptoKit
import SQLite3

// Each successful save has committed locally before the UI or a browser
// receives acknowledgement. Notes are never backed by a server-side database.
final class NoteDatabase {
    private var db: OpaquePointer?
    private(set) var replicaID = ""
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    init(url: URL? = nil) throws {
        let path: URL
        if let url { path = url } else {
            let folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent(Self.storageFolder, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            #if os(iOS)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: folder.path)
            #endif
            var localFolder = folder
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            try localFolder.setResourceValues(values)
            path = folder.appendingPathComponent("notes.sqlite")
        }
        guard sqlite3_open_v2(path.path, &db, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else { throw failure() }
        try execute("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,text TEXT NOT NULL,createdAt REAL NOT NULL,updatedAt REAL NOT NULL,revision INTEGER NOT NULL,hash TEXT NOT NULL); CREATE INDEX IF NOT EXISTS note_order ON notes(updatedAt DESC,id ASC); CREATE INDEX IF NOT EXISTS note_hash ON notes(hash); CREATE TABLE IF NOT EXISTS deleted(id TEXT PRIMARY KEY);")
        try execute("CREATE TABLE IF NOT EXISTS replica_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS replica_state(id TEXT PRIMARY KEY,record TEXT NOT NULL,sequence INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS replica_order ON replica_state(sequence); CREATE TABLE IF NOT EXISTS replica_clock(id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL); INSERT OR IGNORE INTO replica_clock VALUES(1,0); CREATE TABLE IF NOT EXISTS replica_cursors(link TEXT PRIMARY KEY,pushed INTEGER NOT NULL,pulled INTEGER NOT NULL);")
        let identity = try statement("SELECT value FROM replica_meta WHERE key='id'")
        if sqlite3_step(identity) == SQLITE_ROW { replicaID = text(identity, 0) }
        sqlite3_finalize(identity)
        if replicaID.isEmpty {
            replicaID = UUID().uuidString.lowercased()
            try run("INSERT INTO replica_meta VALUES('id',?)", [replicaID])
        }
        // Backfill pre-replication installs atomically, including old tombstones.
        try transaction {
            for note in try read("SELECT id,text,createdAt,updatedAt,revision FROM notes WHERE id NOT IN (SELECT id FROM replica_state)") {
                try writeRecord(ReplicaRecord(id: note.id, text: note.text, createdAt: note.createdAt, updatedAt: note.updatedAt, version: [replicaID: note.revision]))
            }
            let deleted = try statement("SELECT id FROM deleted WHERE id NOT IN (SELECT id FROM replica_state)")
            defer { sqlite3_finalize(deleted) }
            while sqlite3_step(deleted) == SQLITE_ROW {
                try writeRecord(ReplicaRecord(id: text(deleted, 0), text: nil, createdAt: 0, updatedAt: 0, version: [replicaID: 1]))
            }
        }
    }
    private static var storageFolder: String {
        #if os(macOS)
        return "NoteBaton/Notes"
        #else
        return "Notes" // Preserve the existing iOS container.
        #endif
    }
    deinit { sqlite3_close(db) }
    private func failure() -> ServiceError { ServiceError(status: 0, message: "手机本地存储失败，内容仍在编辑框，请检查剩余空间后重试") }
    private func execute(_ sql: String) throws { guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw failure() } }
    private func statement(_ sql: String, _ values: [Any] = []) throws -> OpaquePointer {
        var raw: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &raw, nil) == SQLITE_OK, let raw else { throw failure() }
        for (index, value) in values.enumerated() {
            let i = Int32(index + 1)
            if let s = value as? String { sqlite3_bind_text(raw, i, s, Int32(s.utf8.count), transient) }
            else if let n = value as? Int { sqlite3_bind_int64(raw, i, Int64(n)) }
            else if let n = value as? Double { sqlite3_bind_double(raw, i, n) }
        }
        return raw
    }
    private func text(_ stmt: OpaquePointer, _ col: Int32) -> String {
        guard let bytes = sqlite3_column_text(stmt, col) else { return "" }
        return String(decoding: UnsafeBufferPointer(start: bytes, count: Int(sqlite3_column_bytes(stmt, col))), as: UTF8.self)
    }
    private func read(_ sql: String, _ values: [Any] = []) throws -> [Note] {
        let stmt = try statement(sql, values); defer { sqlite3_finalize(stmt) }
        var notes: [Note] = []
        while true {
            let status = sqlite3_step(stmt)
            if status == SQLITE_DONE { return notes }
            guard status == SQLITE_ROW else { throw failure() }
            notes.append(Note(id: text(stmt, 0), text: text(stmt, 1), createdAt: sqlite3_column_double(stmt, 2), updatedAt: sqlite3_column_double(stmt, 3), revision: Int(sqlite3_column_int64(stmt, 4))))
        }
    }
    func note(_ id: String) throws -> Note? { try read("SELECT id,text,createdAt,updatedAt,revision FROM notes WHERE id=?", [id]).first }
    func page(after cursor: NoteCursor? = nil, limit: Int = 10) throws -> NotePage {
        let rows: [Note]
        if let cursor {
            rows = try read("SELECT id,text,createdAt,updatedAt,revision FROM notes WHERE updatedAt<? OR (updatedAt=? AND id>?) ORDER BY updatedAt DESC,id ASC LIMIT ?", [cursor.updatedAt, cursor.updatedAt, cursor.id, limit + 1])
        } else { rows = try read("SELECT id,text,createdAt,updatedAt,revision FROM notes ORDER BY updatedAt DESC,id ASC LIMIT ?", [limit + 1]) }
        return NotePage(items: Array(rows.prefix(limit)), hasMore: rows.count > limit)
    }
    func contains(text: String) throws -> Bool {
        let hash = Self.hash(text)
        let stmt = try statement("SELECT 1 FROM notes WHERE hash=? LIMIT 1", [hash]); defer { sqlite3_finalize(stmt) }
        let result = sqlite3_step(stmt)
        guard result == SQLITE_ROW || result == SQLITE_DONE else { throw failure() }
        return result == SQLITE_ROW
    }
    static func hash(_ text: String) -> String { SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined() }
    @discardableResult func save(id: String, text: String, baseRevision: Int, importedAt: Double? = nil) throws -> Note {
        guard UUID(uuidString: id) != nil, text.unicodeScalars.count <= 100_000 else { throw ServiceError(status: 400, message: "笔记最多支持 100,000 个字符") }
        let tombstone = try statement("SELECT 1 FROM deleted WHERE id=?", [id])
        let wasDeleted = sqlite3_step(tombstone) == SQLITE_ROW; sqlite3_finalize(tombstone)
        guard !wasDeleted else { throw ServiceError(status: 409, message: "这条笔记已删除，当前输入已保留，请复制到新笔记") }
        let existing = try note(id)
        // Retry after a lost acknowledgement is idempotent.
        if let existing, existing.text == text { return existing }
        guard (existing?.revision ?? 0) == baseRevision else { throw ServiceError(status: 409, message: "这条笔记已在其他设备修改。当前输入已保留，请复制后返回查看最新版本") }
        guard existing != nil || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ServiceError(status: 400, message: "请输入笔记内容") }
        let now = importedAt ?? Date().timeIntervalSince1970 * 1000
        let note = Note(id: id, text: text, createdAt: existing?.createdAt ?? now, updatedAt: max(now, (existing?.updatedAt ?? 0) + 1), revision: (existing?.revision ?? 0) + 1)
        var version = try record(id)?.version ?? [:]
        version[replicaID, default: 0] += 1
        let value = ReplicaRecord(id: id, text: text, createdAt: note.createdAt, updatedAt: note.updatedAt, version: version)
        try transaction { try writeRecord(value) }
        return try self.note(id)!
    }
    func delete(id: String, baseRevision: Int? = nil) throws {
        if let baseRevision, let note = try note(id), note.revision != baseRevision { throw ServiceError(status: 409, message: "笔记已更新，请刷新后再删除") }
        guard UUID(uuidString: id) != nil else { throw failure() }
        let previous = try record(id)
        if previous?.deleted == true { return }
        var version = previous?.version ?? [:]; version[replicaID, default: 0] += 1
        let record = ReplicaRecord(id: id, text: nil, createdAt: previous?.createdAt ?? 0,
                                   updatedAt: max(Date().timeIntervalSince1970 * 1000, previous?.updatedAt ?? 0), version: version)
        try transaction { try writeRecord(record) }
    }
    private func run(_ sql: String, _ values: [Any] = []) throws {
        let stmt = try statement(sql, values); defer { sqlite3_finalize(stmt) }
        guard sqlite3_step(stmt) == SQLITE_DONE else { throw failure() }
    }
    private func transaction(_ body: () throws -> Void) throws {
        try execute("BEGIN IMMEDIATE")
        do { try body(); try execute("COMMIT") } catch { try? execute("ROLLBACK"); throw error }
    }
    func record(_ id: String) throws -> ReplicaRecord? {
        let stmt = try statement("SELECT record FROM replica_state WHERE id=?", [id]); defer { sqlite3_finalize(stmt) }
        let status = sqlite3_step(stmt)
        if status == SQLITE_DONE { return nil }
        guard status == SQLITE_ROW else { throw failure() }
        return try JSONDecoder().decode(ReplicaRecord.self, from: Data(text(stmt, 0).utf8))
    }
    private func writeRecord(_ value: ReplicaRecord) throws {
        try value.validate()
        let json = String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
        try execute("UPDATE replica_clock SET value=value+1 WHERE id=1")
        try run("INSERT INTO replica_state VALUES(?,?,(SELECT value FROM replica_clock WHERE id=1)) ON CONFLICT(id) DO UPDATE SET record=excluded.record,sequence=excluded.sequence", [value.id, json])
        if let text = value.text {
            try run("INSERT INTO notes VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text,createdAt=excluded.createdAt,updatedAt=excluded.updatedAt,revision=excluded.revision,hash=excluded.hash", [value.id, text, value.createdAt, value.updatedAt, value.revision, Self.hash(text)])
        } else {
            try run("INSERT OR IGNORE INTO deleted VALUES(?)", [value.id])
            try run("DELETE FROM notes WHERE id=?", [value.id])
        }
    }
    /// A cursor is local to this database and this link; only acknowledged work advances it.
    func changes(after: Int, limit: Int = 10) throws -> ReplicaPage {
        guard after >= 0 else { throw failure() }
        let stmt = try statement("SELECT sequence,record FROM replica_state WHERE sequence>? ORDER BY sequence LIMIT ?", [after, limit + 1]); defer { sqlite3_finalize(stmt) }
        var items: [ReplicaChange] = []
        while true {
            let status = sqlite3_step(stmt)
            if status == SQLITE_DONE { break }
            guard status == SQLITE_ROW else { throw failure() }
            items.append(ReplicaChange(sequence: Int(sqlite3_column_int64(stmt, 0)), record: try JSONDecoder().decode(ReplicaRecord.self, from: Data(text(stmt, 1).utf8))))
        }
        let page = Array(items.prefix(limit))
        return ReplicaPage(items: page, cursor: page.last?.sequence ?? after, hasMore: items.count > limit)
    }
    func cursors(_ link: String) throws -> (pushed: Int, pulled: Int) {
        let stmt = try statement("SELECT pushed,pulled FROM replica_cursors WHERE link=?", [link]); defer { sqlite3_finalize(stmt) }
        let result = sqlite3_step(stmt)
        if result == SQLITE_DONE { return (0,0) }
        guard result == SQLITE_ROW else { throw failure() }
        return (Int(sqlite3_column_int64(stmt, 0)), Int(sqlite3_column_int64(stmt, 1)))
    }
    func checkpoint(_ link: String, pushed: Int, pulled: Int) throws {
        try run("INSERT INTO replica_cursors VALUES(?,?,?) ON CONFLICT(link) DO UPDATE SET pushed=excluded.pushed,pulled=excluded.pulled", [link, pushed, pulled])
    }
    @discardableResult func merge(_ incoming: ReplicaRecord) throws -> Bool {
        try incoming.validate()
        var changed = false
        try transaction {
            guard let existing = try record(incoming.id) else { try writeRecord(incoming); changed = true; return }
            if existing.dominates(incoming) { return }
            let concurrent = !incoming.dominates(existing)
            // Tombstones are permanent: a delayed edit must never resurrect an ID.
            let winner: ReplicaRecord
            if existing.deleted { winner = existing }
            else if incoming.deleted { winner = incoming }
            else if concurrent {
                winner = Self.hash(existing.text!) > Self.hash(incoming.text!) ? existing : incoming
            } else { winner = incoming }
            let loser = winner == existing ? incoming : existing
            if concurrent, let text = loser.text, text != winner.text {
                let conflictID = ReplicaRecord.conflictID(id: incoming.id, text: text)
                if try record(conflictID) == nil {
                    // Stable ID prevents duplicate conflict copies on retries or relay loops.
                    try writeRecord(ReplicaRecord(id: conflictID, text: text, createdAt: loser.createdAt, updatedAt: loser.updatedAt, version: loser.version))
                }
            }
            var merged = winner
            for (device, counter) in loser.version { merged.version[device] = max(merged.version[device, default: 0], counter) }
            merged.createdAt = min(existing.createdAt, incoming.createdAt)
            merged.updatedAt = max(existing.updatedAt, incoming.updatedAt)
            try writeRecord(merged); changed = true
        }
        return changed
    }
    func importLegacy(_ clip: Clip) throws {
        if try note(clip.id) == nil { try save(id: clip.id, text: clip.text, baseRevision: 0, importedAt: clip.createdAt) }
        guard try note(clip.id) != nil else { throw failure() }
    }
}
