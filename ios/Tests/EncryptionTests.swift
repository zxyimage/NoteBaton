import Foundation

@main struct EncryptionTests {
    static func main() throws {
        struct Context: Decodable { let origin, deviceId, peerId, connectionId, clientNonce, phoneNonce: String }
        struct Vector: Decodable { let plaintext: String; let browserFrame, phoneFrame: EncryptedEnvelope }
        struct Fixture: Decodable { let secret: String; let context: Context; let vectors: [Vector] }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        let c = fixture.context
        let context = EncryptionContext(origin: c.origin, deviceId: c.deviceId, peerId: c.peerId, connectionId: c.connectionId, clientNonce: c.clientNonce, phoneNonce: c.phoneNonce)
        let phone = try EncryptedChannel(secret: fixture.secret, context: context)
        let browser = try EncryptedChannel(secret: fixture.secret, context: context, browser: true)
        for v in fixture.vectors {
            let text = Data(v.plaintext.utf8)
            let decodedPhone = try phone.open(v.browserFrame), decodedBrowser = try browser.open(v.phoneFrame)
            precondition(decodedPhone == text); precondition(decodedBrowser == text)
            let sealedPhone = try phone.seal(text), sealedBrowser = try browser.seal(text)
            precondition(sealedPhone.ciphertext == v.phoneFrame.ciphertext); precondition(sealedBrowser.ciphertext == v.browserFrame.ciphertext)
        }
        func reject(_ action: () throws -> Void) {
            do { try action(); fatalError("Invalid ciphertext accepted") } catch { }
        }
        reject { _ = try phone.open(fixture.vectors[0].browserFrame) }
        let fresh = try EncryptedChannel(secret: fixture.secret, context: context)
        var corrupt = fixture.vectors[0].browserFrame
        corrupt.ciphertext = (corrupt.ciphertext!.first == "A" ? "B" : "A") + corrupt.ciphertext!.dropFirst()
        reject { _ = try fresh.open(corrupt) }
        let wrong = try EncryptedChannel(secret: String(repeating: "ef", count: 32), context: context)
        reject { _ = try wrong.open(fixture.vectors[0].browserFrame) }
        reject { _ = try fresh.open(fixture.vectors[0].phoneFrame) }
        print("CryptoKit ↔ Web Crypto: matching HKDF/AES-GCM, 100k Unicode/NUL, tamper/replay/wrong-key/reflection rejection passed")
    }
}
