import Foundation
import Security

/// Runtime-only Kalshi API key + PEM. Never written to the git tree.
enum KalshiCreds {
    private static let service = "com.corymurray.HubPrediction.kalshi"
    private static let keyAccount = "access-key-id"
    private static let pemAccount = "private-pem"

    static func load() -> (keyId: String, pem: String)? {
        guard let keyId = read(keyAccount), let pem = read(pemAccount),
              !keyId.isEmpty, pem.contains("PRIVATE KEY")
        else { return nil }
        return (keyId, pem)
    }

    static var isPresent: Bool { load() != nil }

    static func save(keyId: String, pem: String) {
        write(keyAccount, keyId.trimmingCharacters(in: .whitespacesAndNewlines))
        write(pemAccount, pem.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    static func clear() {
        delete(keyAccount)
        delete(pemAccount)
    }

    private static func read(_ account: String) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data,
              let s = String(data: data, encoding: .utf8)
        else { return nil }
        return s
    }

    private static func write(_ account: String, _ value: String) {
        delete(account)
        let data = Data(value.utf8)
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemAdd(q as CFDictionary, nil)
    }

    private static func delete(_ account: String) {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(q as CFDictionary)
    }
}
