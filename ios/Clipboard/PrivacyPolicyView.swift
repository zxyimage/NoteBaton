import SwiftUI

struct PrivacyPolicyView: View {
    var showsCloseButton = false
    @Environment(\.dismiss) private var dismiss
    private var policy: String {
        guard let url = Bundle.main.url(forResource: AppLanguage.shared.code == "zh-Hans" ? "app-privacy.zh-CN" : "app-privacy", withExtension: "md", subdirectory: "Legal"),
              let text = try? String(contentsOf: url, encoding: .utf8) else {
            return "# Privacy Policy\n\nThe bundled privacy policy could not be loaded. Please check for an App update or use the Privacy Policy link on the App Store product page."
        }
        return text
    }

    var body: some View {
        MarkdownView(text: policy)
            .navigationTitle(L10n.text("隐私政策"))
            .inlineTitle()
            .toolbar {
                if showsCloseButton {
                    ToolbarItem(placement: .cancellationAction) { Button(L10n.text("完成")) { dismiss() } }
                }
            }
    }
}
