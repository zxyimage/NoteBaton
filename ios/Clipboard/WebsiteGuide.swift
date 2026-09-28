import SwiftUI

enum OfficialWebsite {
    static let host = "notebaton.org"
    static let url = URL(string: "https://notebaton.org")!
}

struct WebsiteGuide: View {
    var copyAddress: (() -> Void)? = nil
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Link(destination: OfficialWebsite.url) {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(L10n.text("在浏览器中打开")).font(.headline)
                            Text(verbatim: OfficialWebsite.host).font(.subheadline)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "arrow.up.right.square")
                    }.contentShape(Rectangle())
                }
                .foregroundStyle(.tint)
                .accessibilityIdentifier("officialWebsite")
                .accessibilityHint(L10n.text("在浏览器中打开"))
                if let copyAddress {
                    Button {
                        copyAddress(); copied = true
                    } label: {
                        Image(systemName: copied ? "checkmark" : "doc.on.doc").frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(L10n.text(copied ? "已复制" : "复制网站地址"))
                    .accessibilityIdentifier("copyWebsiteAddress")
                }
            }
            Text(L10n.text("在网站中选择 Note，复制配对链接后回到这里。"))
                .font(.footnote).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.borderless)
    }
}
