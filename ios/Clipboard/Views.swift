import SwiftUI

private struct EditorRoute: Hashable { let id: String }
struct RootView: View {
    @Bindable var store: ClipboardStore
    var body: some View {
        Group {
            if !store.isActivated { WelcomeView(store: store) }
            else { NotesView(store: store) }
        }
        .alert(L10n.text("暂时无法完成"), isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button(L10n.text("知道了"), role: .cancel) { store.error = nil }
        } message: { Text(L10n.error(store.error ?? "")) }
    }
}
private struct WelcomeView: View {
    @Bindable var store: ClipboardStore
    @State private var showingPrivacy = false
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    LanguagePicker().pickerStyle(.menu)
                    Spacer()
                    Image(systemName: "doc.on.clipboard.fill").font(.system(size: 58)).foregroundStyle(.tint)
                    Text(L10n.text("随手记，\n接着用。")).font(.system(size: 40, weight: .bold))
                    Text(L10n.text("文字、链接和 Markdown。\niPhone、Mac 与网页，接着写。")).foregroundStyle(.secondary).lineSpacing(5)
                    WebsiteGuide { store.copy(OfficialWebsite.url.absoluteString) }
                        .padding(16)
                        .background(Color.accentColor.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                    Spacer()
                    Text(L10n.text("打开 App 时会读取剪贴板，相同内容不会重复保存。iOS 可能会询问粘贴权限。")).font(.footnote).foregroundStyle(.secondary)
                    Text(L10n.text("笔记保存在本机及已同步的设备。没有云备份，请另行保留重要内容的副本。")).font(.footnote).foregroundStyle(.secondary)
                    Button { store.activate() } label: { Text(L10n.text("开始使用")).fontWeight(.semibold).frame(maxWidth: .infinity).padding(10) }.buttonStyle(.borderedProminent)
                    Button(L10n.text("隐私政策")) { showingPrivacy = true }.font(.footnote)
                }.padding(28).frame(minHeight: geometry.size.height)
            }
        }
        .sheet(isPresented: $showingPrivacy) {
            NavigationStack {
                PrivacyPolicyView(showsCloseButton: true)
            }
        }
    }
}
private struct NotesView: View {
    @Bindable var store: ClipboardStore
    @State private var path: [EditorRoute] = []
    @State private var deleting: Note?
    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 7) {
                        Circle().fill(store.connected ? Color.green : Color.orange).frame(width: 7, height: 7)
                        Text(L10n.text(store.connection)).font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Text(L10n.format("%@ 条", store.notes.count.formatted(.number.locale(AppLanguage.shared.locale)))).font(.caption).foregroundStyle(.secondary)
                    }
                    if let server = store.identity?.server {
                        Text(server).font(.caption2).foregroundStyle(.secondary).textSelection(.enabled)
                    }
                    if store.migrating { ProgressView(L10n.text("正在迁移旧笔记…")).font(.footnote) }
                    if let notice = store.notice { Text(L10n.text(notice)).font(.footnote).foregroundStyle(.tint).accessibilityIdentifier("notice") }
                    if store.notes.isEmpty {
                        ContentUnavailableView(L10n.text("从第一条笔记开始"), systemImage: "square.and.pencil", description: Text(L10n.text("输入、粘贴或复制文字。\n笔记会自动保存到手机。")))
                            .padding(.top, 40)
                    }
                    ForEach(store.notes) { note in
                        VStack(alignment: .leading, spacing: 12) {
                            Button { path.append(EditorRoute(id: note.id)) } label: {
                                Text(note.text.isEmpty ? L10n.text("空白笔记") : String(note.text.prefix(220)))
                                    .font(.body).foregroundStyle(.primary).lineLimit(6)
                                    .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                            }.buttonStyle(.plain).accessibilityLabel(L10n.format("编辑笔记：%@", String(note.text.prefix(50))))
                            HStack {
                                Text(note.date, format: .dateTime.month().day().hour().minute()).font(.caption).foregroundStyle(.secondary)
                                Spacer()
                                Button { store.copy(note.text) } label: { Image(systemName: "doc.on.doc").frame(width: 36, height: 32) }.accessibilityLabel(L10n.text("复制笔记"))
                                Button { deleting = note } label: { Image(systemName: "trash").frame(width: 36, height: 32).foregroundStyle(.secondary) }.accessibilityLabel(L10n.text("删除笔记"))
                            }.buttonStyle(.plain)
                        }.padding(16).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
                    }
                    if store.hasMore { Button(L10n.text("加载更多笔记")) { store.loadMore() }.frame(maxWidth: .infinity) }
                    Text(L10n.text("笔记保存在本机 · iPhone 在前台时同步"))
                        .font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 10)
                }.padding(18).padding(.bottom, 95)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(L10n.text("我的笔记"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { PairingView(store: store) } label: { Label(L10n.text("配对与同步"), systemImage: "qrcode") }.accessibilityLabel(L10n.text("配对与同步"))
                }
            }
            .overlay(alignment: .bottom) {
                Button { path.append(EditorRoute(id: UUID().uuidString.lowercased())) } label: {
                    Label(L10n.text("新建笔记"), systemImage: "plus").font(.headline).padding(.horizontal, 25).padding(.vertical, 17)
                }.buttonStyle(.plain).foregroundStyle(.white).background(.tint, in: Capsule())
                    .shadow(color: .black.opacity(0.15), radius: 14, y: 6).padding(.bottom, 16)
                    .accessibilityIdentifier("newNote")
            }
            .navigationDestination(for: EditorRoute.self) { route in NoteEditor(store: store, id: route.id) }
            .confirmationDialog(L10n.text("删除这条笔记？所有已配对设备也会同步删除。"), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
                Button(L10n.text("删除笔记"), role: .destructive) { if let deleting { store.delete(deleting) }; deleting = nil }
            }
        }
    }
}
private struct NoteEditor: View {
    @Bindable var store: ClipboardStore
    let id: String
    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    @State private var revision: Int
    @State private var savedText: String
    @State private var mode = 0
    @State private var failure: String?
    @FocusState private var focused: Bool
    init(store: ClipboardStore, id: String) {
        self.store = store; self.id = id
        let note = store.note(id)
        _text = State(initialValue: note?.text ?? "")
        _savedText = State(initialValue: note?.text ?? "")
        _revision = State(initialValue: note?.revision ?? 0)
    }
    private var count: Int { text.unicodeScalars.count }
    @discardableResult private func save() -> Bool {
        if text == savedText || (revision == 0 && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { return true }
        do {
            let note = try store.save(id: id, text: text, revision: revision)
            revision = note.revision; savedText = text; failure = nil; return true
        } catch { failure = error.localizedDescription; return false }
    }
    private func finish() { if save() { focused = false; Task { await store.changed(id: id) }; dismiss() } }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Picker(L10n.text("显示模式"), selection: $mode) { Text(L10n.text("编辑")).tag(0); Text(L10n.text("预览")).tag(1) }.pickerStyle(.segmented).frame(width: 145)
                Spacer()
                Text("\(count.formatted(.number.locale(AppLanguage.shared.locale))) / 100,000").font(.caption2).foregroundStyle(count > 100_000 ? .red : .secondary)
            }.padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            if mode == 0 {
                ZStack(alignment: .topLeading) {
                    if text.isEmpty { Text(L10n.text("支持 Markdown\n\n# 一个想法\n随手写下，自动保存。")).foregroundStyle(.tertiary).padding(.horizontal, 21).padding(.top, 13).allowsHitTesting(false) }
                    TextEditor(text: $text).font(.body).scrollContentBackground(.hidden).padding(.horizontal, 16).padding(.top, 5)
                        .focused($focused).accessibilityLabel(L10n.text("笔记内容")).accessibilityIdentifier("noteEditor")
                }
            } else { MarkdownView(text: text) }
            Divider()
            HStack(spacing: 6) {
                Image(systemName: failure == nil ? "checkmark.circle" : "exclamationmark.circle")
                Text(failure.map(L10n.error) ?? (revision == 0 ? L10n.text("输入后自动保存到设备") : L10n.text("已保存到设备")))
                    .font(.caption).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if mode == 0 { PasteButton(payloadType: String.self) { values in if let value = values.first { text += value } }.labelStyle(.iconOnly).buttonBorderShape(.capsule) }
            }.foregroundStyle(failure == nil ? Color.secondary : Color.red).padding(.horizontal, 16).padding(.vertical, 8)
        }
        .navigationTitle(revision == 0 ? L10n.text("新建笔记") : L10n.text("编辑笔记")).navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button { finish() } label: { HStack(spacing: 4) { Image(systemName: "chevron.left"); Text(L10n.text("返回")) } } }
            ToolbarItem(placement: .topBarTrailing) { Button(L10n.text("保存")) { finish() }.fontWeight(.semibold) }
            ToolbarItemGroup(placement: .keyboard) { Spacer(); Button(L10n.text("收起键盘")) { focused = false } }
        }
        .onChange(of: store.notes) { _, _ in
            if text == savedText, let latest = store.note(id), latest.revision != revision {
                text = latest.text; savedText = latest.text; revision = latest.revision; failure = nil
            }
        }
        .onChange(of: text) { _, _ in _ = save() }
        .onChange(of: mode) { _, _ in focused = false }
        .onDisappear { _ = save() }
    }
}
struct LegacyImportView: View {
    @Bindable var store: ClipboardStore
    @Environment(\.dismiss) private var dismiss
    @State private var username = "owner"
    @State private var password = ""
    @State private var busy = false
    var body: some View {
        Form {
            Section {
                Text(L10n.text("使用旧版接力的账号密码，将历史笔记迁入这台手机。只有确认本地保存成功后，才会清除旧云端副本。")).font(.subheadline).foregroundStyle(.secondary)
                TextField(L10n.text("旧版账号"), text: $username).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField(L10n.text("旧版密码"), text: $password).textContentType(.password)
                Button(busy ? L10n.text("正在迁移…") : L10n.text("导入到此手机")) {
                    busy = true
                    Task { let ok = await store.importLegacy(username: username, password: password); busy = false; if ok { password = ""; dismiss() } }
                }.disabled(busy || username.isEmpty || password.isEmpty)
            }
        }.navigationTitle(L10n.text("导入旧版笔记")).navigationBarTitleDisplayMode(.inline)
    }
}
