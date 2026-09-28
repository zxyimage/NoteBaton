import Foundation
import CryptoKit

struct EncryptedEnvelope: Codable {
    let type: String
    var v: Int? = nil
    var clientNonce: String? = nil
    var phoneNonce: String? = nil
    var seq: UInt64? = nil
    var ciphertext: String? = nil
    var peerId: String? = nil
    var connectionId: String? = nil
}
struct EncryptionContext {
    let origin: String
    let deviceId: String
    let peerId: String
    let connectionId: String
    let clientNonce: String
    let phoneNonce: String
    var label: String { ["relay-e2ee-v1", origin, deviceId, peerId, connectionId, clientNonce, phoneNonce].joined(separator: "\n") }
}
// This object is owned by the main actor. Receive processing is sequential.
final class EncryptedChannel {
    static let maximumFrame = 1_100_000
    let context: EncryptionContext
    private let outgoing: SymmetricKey
    private let incoming: SymmetricKey
    private let sendDirection: String
    private let receiveDirection: String
    private var sent: UInt64 = 0
    private var received: UInt64 = 0
    static func failure() -> ServiceError { ServiceError(status: 0, message: "加密验证失败，请重新连接或配对；未发送笔记明文") }
    static func bytes(_ hex: String) throws -> Data {
        guard hex.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw failure() }
        let chars = Array(hex.utf8)
        return Data(stride(from: 0, to: chars.count, by: 2).map { UInt8(String(decoding: chars[$0...$0+1], as: UTF8.self), radix: 16)! })
    }
    static func randomHex() -> String {
        SymmetricKey(size: .bits256).withUnsafeBytes { $0.map { String(format: "%02x", $0) }.joined() }
    }
    init(secret: String, context: EncryptionContext, browser: Bool = false) throws {
        self.context = context
        guard [context.deviceId, context.peerId, context.connectionId].allSatisfy({ UUID(uuidString: $0) != nil && $0 == $0.lowercased() }) else { throw Self.failure() }
        let salt = try Self.bytes(context.clientNonce) + Self.bytes(context.phoneNonce)
        let key = try SymmetricKey(data: Self.bytes(secret))
        func derive(_ direction: String) -> SymmetricKey {
            HKDF<SHA256>.deriveKey(inputKeyMaterial: key, salt: salt, info: Data("\(context.label)\n\(direction)".utf8), outputByteCount: 32)
        }
        sendDirection = browser ? "browser-to-phone" : "phone-to-browser"
        receiveDirection = browser ? "phone-to-browser" : "browser-to-phone"
        outgoing = derive(sendDirection); incoming = derive(receiveDirection)
    }
    private func nonce(_ sequence: UInt64) throws -> AES.GCM.Nonce {
        guard sequence > 0, sequence <= 0xffffffff else { throw Self.failure() }
        var bytes = Data(repeating: 0, count: 8)
        var tail = UInt32(sequence).bigEndian
        withUnsafeBytes(of: &tail) { bytes.append(contentsOf: $0) }
        return try AES.GCM.Nonce(data: bytes)
    }
    func seal(_ data: Data, type: String = "sealed") throws -> EncryptedEnvelope {
        guard data.count <= 800_000 else { throw Self.failure() }
        sent += 1
        let box = try AES.GCM.seal(data, using: outgoing, nonce: nonce(sent), authenticating: Data("\(context.label)\n\(sendDirection)\n\(sent)".utf8))
        return EncryptedEnvelope(type: type, v: 1, clientNonce: context.clientNonce, phoneNonce: context.phoneNonce, seq: sent,
                                 ciphertext: (box.ciphertext + box.tag).base64EncodedString(), peerId: context.peerId, connectionId: context.connectionId)
    }
    func open(_ frame: EncryptedEnvelope) throws -> Data {
        guard frame.v == 1, frame.clientNonce == context.clientNonce, frame.phoneNonce == context.phoneNonce,
              let seq = frame.seq, seq == received + 1, let encoded = frame.ciphertext, encoded.utf8.count <= 1_066_688,
              let data = Data(base64Encoded: encoded), data.count >= 16, data.count <= 800_016 else { throw Self.failure() }
        let box = try AES.GCM.SealedBox(nonce: nonce(seq), ciphertext: data.dropLast(16), tag: data.suffix(16))
        let plaintext = try AES.GCM.open(box, using: incoming, authenticating: Data("\(context.label)\n\(receiveDirection)\n\(seq)".utf8))
        received = seq
        return plaintext
    }
}
