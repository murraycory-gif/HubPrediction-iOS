import Foundation
import Security

enum KalshiAuthError: LocalizedError {
    case badPEM
    case signFailed
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .badPEM: return "PEM not readable. Paste the Kalshi RSA private key (BEGIN PRIVATE KEY)."
        case .signFailed: return "Could not sign the Kalshi request."
        case .http(let code, let msg): return "Kalshi \(code): \(msg)"
        }
    }
}

enum KalshiAuth {
    static let host = "https://external-api.kalshi.com"

    static func signedJSON(method: String, path: String, body: [String: Any]? = nil, timeout: TimeInterval = 8) async throws -> Any {
        guard let creds = KalshiCreds.load() else {
            throw KalshiAuthError.http(401, "Add API Key ID + PEM in Keys.")
        }
        let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
        let sig = try sign(pem: creds.pem, timestamp: timestamp, method: method, path: path)
        guard let url = URL(string: host + path) else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = timeout
        req.setValue("HUB-Prediction/1.0", forHTTPHeaderField: "User-Agent")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(creds.keyId, forHTTPHeaderField: "KALSHI-ACCESS-KEY")
        req.setValue(sig, forHTTPHeaderField: "KALSHI-ACCESS-SIGNATURE")
        req.setValue(timestamp, forHTTPHeaderField: "KALSHI-ACCESS-TIMESTAMP")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) ?? ["raw": String(data: data, encoding: .utf8) ?? ""]
        if !(200..<300).contains(code) {
            let msg = ((json as? [String: Any])?["message"] as? String)
                ?? String(data: data, encoding: .utf8)
                ?? "http \(code)"
            throw KalshiAuthError.http(code, msg)
        }
        return json
    }

    static func sign(pem: String, timestamp: String, method: String, path: String) throws -> String {
        let key = try rsaKey(fromPEM: pem)
        let payload = Data((timestamp + method + path).utf8)
        var err: Unmanaged<CFError>?
        guard let sig = SecKeyCreateSignature(key, .rsaSignatureMessagePSSSHA256, payload as CFData, &err) else {
            throw err?.takeRetainedValue() as Error? ?? KalshiAuthError.signFailed
        }
        return (sig as Data).base64EncodedString()
    }

    static func rsaKey(fromPEM pem: String) throws -> SecKey {
        let stripped = pem
            .replacingOccurrences(of: "-----BEGIN PRIVATE KEY-----", with: "")
            .replacingOccurrences(of: "-----END PRIVATE KEY-----", with: "")
            .replacingOccurrences(of: "-----BEGIN RSA PRIVATE KEY-----", with: "")
            .replacingOccurrences(of: "-----END RSA PRIVATE KEY-----", with: "")
            .components(separatedBy: .whitespacesAndNewlines)
            .joined()
        guard let der = Data(base64Encoded: stripped), !der.isEmpty else { throw KalshiAuthError.badPEM }
        let attrs: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
        ]
        var err: Unmanaged<CFError>?
        if let key = SecKeyCreateWithData(der as CFData, attrs as CFDictionary, &err) {
            return key
        }
        if let pkcs1 = pkcs1(fromPKCS8: der),
           let key = SecKeyCreateWithData(pkcs1 as CFData, attrs as CFDictionary, &err) {
            return key
        }
        throw KalshiAuthError.badPEM
    }

    /// Drop PKCS#8 header so SecKey can read a PKCS#1 RSA blob.
    private static func pkcs1(fromPKCS8 der: Data) -> Data? {
        let bytes = [UInt8](der)
        guard bytes.first == 0x30 else { return nil }
        var i = 0
        func skipLen(_ at: inout Int) -> Int? {
            guard at < bytes.count else { return nil }
            let b = bytes[at]
            at += 1
            if b & 0x80 == 0 { return Int(b) }
            let n = Int(b & 0x7F)
            guard n > 0, at + n <= bytes.count else { return nil }
            var v = 0
            for _ in 0..<n { v = (v << 8) | Int(bytes[at]); at += 1 }
            return v
        }
        i += 1
        _ = skipLen(&i)
        // version INTEGER
        guard i < bytes.count, bytes[i] == 0x02 else { return nil }
        i += 1
        guard let vLen = skipLen(&i) else { return nil }
        i += vLen
        // AlgorithmIdentifier SEQUENCE
        guard i < bytes.count, bytes[i] == 0x30 else { return nil }
        i += 1
        guard let aLen = skipLen(&i) else { return nil }
        i += aLen
        // OCTET STRING wrapping PKCS#1
        guard i < bytes.count, bytes[i] == 0x04 else { return nil }
        i += 1
        guard let oLen = skipLen(&i), i + oLen <= bytes.count else { return nil }
        return Data(bytes[i..<(i + oLen)])
    }
}
