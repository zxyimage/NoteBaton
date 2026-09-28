import Foundation

@main struct LocalNotesTests {
    static func main() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("notes.sqlite")
        let db = try NoteDatabase(url: url)
        let id = UUID().uuidString.lowercased()
        let text = "# 标题\n中文 🐱\n\u{0000}" + String(repeating: "😀", count: 99_986)
        assert(text.unicodeScalars.count <= 100_000)
        let first = try db.save(id: id, text: text, baseRevision: 0)
        assert(first.text == text)
        let readback = try db.note(id); assert(readback?.text == text)
        let duplicate = try db.contains(text: text); assert(duplicate)
        let retry = try db.save(id: id, text: text, baseRevision: 0); assert(retry.revision == 1)
        do { try db.save(id: id, text: "conflict", baseRevision: 0); fatalError("must reject stale edit") } catch let e as ServiceError { assert(e.status == 409) }
        do { try db.save(id: id, text: String(repeating: "😀", count: 100_001), baseRevision: 1); fatalError("must enforce scalar limit") } catch let e as ServiceError { assert(e.status == 400) }
        let saved = try db.save(id: id, text: String(repeating: "😀", count: 100_000), baseRevision: 1)
        assert(saved.revision == 2 && saved.text.unicodeScalars.count == 100_000)
        let reopened = try NoteDatabase(url: url)
        let persisted = try reopened.note(id); assert(persisted == saved)
        for i in 0..<24 { try db.save(id: UUID().uuidString.lowercased(), text: "note \(i)", baseRevision: 0, importedAt: Double(i)) }
        let a = try db.page(); let b = try db.page(after: a.cursor); let c = try db.page(after: b.cursor)
        assert(a.items.count == 10 && b.items.count == 10 && c.items.count == 5 && !c.hasMore)
        assert(Set((a.items + b.items + c.items).map(\.id)).count == 25)
        let earliest = c.items.last!
        let updated = try db.save(id: earliest.id, text: "now recent", baseRevision: 1)
        let recent = try db.page(); assert(recent.items.first?.id == updated.id)
        do { try db.delete(id: id, baseRevision: 1); fatalError("stale delete") } catch let e as ServiceError { assert(e.status == 409) }
        try db.delete(id: id, baseRevision: 2)
        do { try db.save(id: id, text: "late retry", baseRevision: 0); fatalError("deleted note resurrected") } catch let e as ServiceError { assert(e.status == 409) }
        let clip = Clip(id: UUID().uuidString.lowercased(), seq: 1, text: "legacy", source: "iPhone", createdAt: 1234)
        try db.importLegacy(clip); try db.importLegacy(clip)
        let imported = try db.note(clip.id); assert(imported?.createdAt == 1234 && imported?.revision == 1)
        print("PASS: local disk persistence, 100k Unicode/NUL, dedup, revision conflicts, 10-item paging, modified sort, deletion retry, legacy import")
    }
}
