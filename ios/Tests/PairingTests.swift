import Foundation

@main struct PairingTests {
    static func main() async throws {
        struct Case: Decodable { let input: String; let manual: String; let server: String?; let code: String?; let key: String? }
        struct Fixtures: Decodable { let valid: [Case]; let invalid: [Case] }
        let fixtures = try JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: URL(fileURLWithPath: "../tests/pairing-fixtures.json")))
        for item in fixtures.valid {
            let target = try PairingTarget.parse(item.input, manualServer: item.manual)
            precondition(target.server.absoluteString == item.server)
            precondition(target.code == item.code)
            precondition(target.encryptionKey == item.key)
        }
        for item in fixtures.invalid {
            do { _ = try PairingTarget.parse(item.input, manualServer: item.manual); fatalError("Accepted invalid fixture: \(item.input)") }
            catch is ServiceError { }
        }
        precondition(!PairingTarget.isPairingInput("https://ordinary.example/article"))
        precondition(PairingTarget.isPairingInput(fixtures.valid[0].input))
        if let base = ProcessInfo.processInfo.environment["REDIRECT_TEST_URL"] {
            for status in [301, 302, 303, 307, 308] {
                let client = APIClient(server: URL(string: base)!, token: "fake-test-credential")
                do {
                    _ = try await client.send("/redirect/\(status)", method: "POST", body: Data("fake-test-secret".utf8))
                    fatalError("Followed redirect")
                } catch let error as ServiceError { precondition(error.status == status) }
            }
            try await APIClient(server: URL(string: base)!).verifyService()
            let ws = APIClient(server: URL(string: base)!, token: "fake-test-credential").websocket()
            ws.resume()
            do { _ = try await ws.receive(); fatalError("Redirected WebSocket unexpectedly connected") }
            catch { ws.cancel(with: .goingAway, reason: nil) }
        }
        print("Pairing parser and redirect checks passed")
    }
}
