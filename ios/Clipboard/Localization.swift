import Foundation
import Observation
import SwiftUI

@Observable final class AppLanguage {
    static let shared = AppLanguage()
    var selection: String {
        didSet { UserDefaults.standard.set(selection, forKey: "notebaton.language") }
    }
    private init() {
        let saved = UserDefaults.standard.string(forKey: "notebaton.language") ?? "system"
        selection = ["system", "zh-Hans", "en"].contains(saved) ? saved : "system"
    }
    var code: String {
        selection == "system" ? ((Locale.preferredLanguages.first ?? "en").hasPrefix("zh") ? "zh-Hans" : "en") : selection
    }
    var locale: Locale { Locale(identifier: code) }
}

enum L10n {
    static func text(_ key: String) -> String {
        let code = AppLanguage.shared.code
        guard let path = Bundle.main.path(forResource: code, ofType: "lproj"), let bundle = Bundle(path: path) else { return key }
        return bundle.localizedString(forKey: key, value: key, table: nil)
    }
    static func format(_ key: String, _ arguments: CVarArg...) -> String {
        String(format: text(key), locale: AppLanguage.shared.locale, arguments: arguments)
    }
    static func error(_ message: String) -> String {
        let prefix = "旧笔记迁移未完成，云端未主动清除。"
        if message.hasPrefix(prefix) {
            return format(prefix + "%@", error(String(message.dropFirst(prefix.count))))
        }
        return text(message)
    }
}

struct LanguagePicker: View {
    @Bindable private var language = AppLanguage.shared
    var body: some View {
        Picker(L10n.text("语言"), selection: $language.selection) {
            Text(L10n.text("跟随系统")).tag("system")
            Text(verbatim: "简体中文").tag("zh-Hans")
            Text(verbatim: "English").tag("en")
        }.accessibilityIdentifier("languagePicker")
    }
}
