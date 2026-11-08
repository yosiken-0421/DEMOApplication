import Foundation
import Security

/// Annict の個人用アクセストークンを Keychain に保存する。
enum KeychainStore {
    private static let service = "com.yosiken0421.machikane"
    private static let annictAccount = "annict.token"

    static var annictToken: String? {
        get { read(annictAccount) }
        set {
            if let v = newValue?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty { write(annictAccount, v) } else { delete(annictAccount) }
        }
    }

    private static func base(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    private static func read(_ account: String) -> String? {
        var q = base(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    private static func write(_ account: String, _ value: String) {
        let data = Data(value.utf8)
        let q = base(account)
        let status = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = q
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    private static func delete(_ account: String) {
        SecItemDelete(base(account) as CFDictionary)
    }
}
