import Foundation

// Version vectors distinguish causal updates from edits made independently offline.
// The relay only sees encrypted envelopes containing these records.
struct ReplicaRecord: Codable, Equatable {
    let id: String
    var text: String?
    var createdAt: Double
    var updatedAt: Double
    var version: [String: Int]
    var deleted: Bool { text == nil }
    var revision: Int { version.values.reduce(0, +) }

    func validate() throws {
        guard UUID(uuidString: id) != nil, id == id.lowercased(),
              createdAt.isFinite, updatedAt.isFinite, createdAt >= 0, updatedAt >= createdAt,
              text.map({ $0.unicodeScalars.count <= 100_000 }) ?? true,
              !version.isEmpty, version.count <= 512,
              version.allSatisfy({ UUID(uuidString: $0.key) != nil && $0.key == $0.key.lowercased() && $0.value > 0 && $0.value <= 1_000_000_000 }) else {
            throw ServiceError(status: 400, message: "设备同步数据不正确")
        }
    }
    func dominates(_ other: ReplicaRecord) -> Bool {
        other.version.allSatisfy { version[$0.key, default: 0] >= $0.value }
    }
    static func conflictID(id: String, text: String) -> String {
        let hash = NoteDatabase.hash("notebaton-conflict-v1\n\(id)\n\(text)")
        let chars = Array(hash.prefix(32))
        return [String(chars[0..<8]), String(chars[8..<12]), String(chars[12..<16]), String(chars[16..<20]), String(chars[20..<32])].joined(separator: "-")
    }
}
struct ReplicaChange: Codable { let sequence: Int; let record: ReplicaRecord }
struct ReplicaPage: Codable { let items: [ReplicaChange]; let cursor: Int; let hasMore: Bool }
struct NativeLink: Codable, Identifiable {
    let server: String
    let deviceId: String
    let peerId: String
    let token: String
    let secret: String
    let expiresAt: Double
    var id: String { "\(server)|\(deviceId)|\(peerId)" }
}
struct DeviceInvitation {
    let server: URL
    let code: String
    let claimSecret: String
    let encryptionKey: String
    let expiresAt: Double
    var link: String { "\(server.absoluteString)/pair#v=2&code=\(code)&key=\(encryptionKey)" }
}
