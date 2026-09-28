import Foundation

struct Note: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let text: String
    let createdAt: Double
    let updatedAt: Double
    let revision: Int
    var date: Date { Date(timeIntervalSince1970: updatedAt / 1000) }
}
struct NoteCursor: Codable, Sendable { let id: String; let updatedAt: Double }
struct NotePage { let items: [Note]; let hasMore: Bool; var cursor: NoteCursor? { items.last.map { NoteCursor(id: $0.id, updatedAt: $0.updatedAt) } } }
struct DeviceIdentity: Codable, Sendable {
    let server: String
    let deviceId: String
    let secret: String
    var token: String { "\(deviceId).owner.\(secret)" }
}
struct Peer: Decodable, Identifiable { let id: String; let name: String; let createdAt: Double; let expiresAt: Double; let kind: String? }
struct PeerList: Decodable { let peers: [Peer] }
struct PairedSecret: Codable {
    var kind: String? = nil
    let server: String
    let deviceId: String
    let peerId: String
    let secret: String
    let expiresAt: Double
}
struct RelayRequest: Decodable {
    let type: String
    let requestId: String?
    let peerId: String?
    let connectionId: String?
    let action: String?
    let cursor: NoteCursor?
    let knownIds: [String]?
    let id: String?
    let text: String?
    let baseRevision: Int?
    let after: Int?
    let record: ReplicaRecord?
}
// Retained only to safely import an existing v1 installation.
struct Clip: Codable, Identifiable, Sendable { let id: String; let seq: Int; let text: String; let source: String; let createdAt: Double }
struct ClipPage: Decodable { let items: [Clip]; let version: Int; let nextCursor: Int? }
struct StoredSession: Codable, Sendable { let server: String; let token: String; let username: String; let expiresAt: Double }
struct ServiceError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}
