import SwiftUI

struct ThirdPartyNoticesView: View {
    private let notices: String = {
        guard let url = Bundle.main.url(forResource: "third-party-notices", withExtension: "txt", subdirectory: "Markdown"),
              let text = try? String(contentsOf: url, encoding: .utf8) else {
            return L10n.text("许可文件不可用，请重新构建 App。")
        }
        return text
    }()
    var body: some View {
        ScrollView { Text(L10n.text(notices)).font(.system(.footnote, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding() }
            .navigationTitle(L10n.text("第三方开源许可")).inlineTitle()
    }
}
