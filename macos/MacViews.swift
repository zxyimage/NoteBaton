import SwiftUI

struct MacRootView: View {
    @Bindable var store: ClipboardStore
    @State private var selection: String?
    @State private var pairing = false
    @State private var deleting: Note?
    var body: some View {
        if !store.isActivated { MacWelcomeView(store: store) }
        else { workspace }
    }
    private var workspace: some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Circle().fill(store.connected ? .green : .orange).frame(width: 7, height: 7)
                    Text(L10n.text(store.connection)).font(.caption).foregroundStyle(.secondary)
                }.padding()
                List(selection: $selection) {
                    ForEach(store.notes) { note in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(String(note.text.prefix(160))).lineLimit(3)
                            Text(note.date, format: .dateTime.month().day().hour().minute()).font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 6).tag(note.id)
                            .contextMenu {
                                Button(L10n.text("复制笔记")) { store.copy(note.text) }
                                Button(L10n.text("删除笔记"), role: .destructive) { deleting = note }
                            }
                    }
                    if store.hasMore { Button(L10n.text("加载更多笔记")) { store.loadMore() } }
                }
                Text(L10n.text("笔记保存在本机 · 离线也可编辑")).font(.caption).foregroundStyle(.secondary).padding()
            }.navigationTitle("NoteBaton").navigationSplitViewColumnWidth(min: 240, ideal: 300)
        } detail: {
            if let selection { MacNoteEditor(store: store, id: selection).id(selection) }
            else {
                ContentUnavailableView(L10n.text("我的笔记"), systemImage: "doc.on.clipboard", description: Text(L10n.text("iPhone、Mac 与网页，接着写。")))
            }
        }
        .toolbar {
            ToolbarItem {
                Button { selection = UUID().uuidString.lowercased() } label: { Label(L10n.text("新建笔记"), systemImage: "square.and.pencil") }.keyboardShortcut("n")
            }
            ToolbarItem {
                Button { store.importClipboard() } label: { Label(L10n.text("导入剪贴板"), systemImage: "clipboard") }.keyboardShortcut("v", modifiers: [.command, .shift])
            }
            ToolbarItem {
                Button { pairing = true } label: { Label(L10n.text("配对与同步"), systemImage: "qrcode") }.keyboardShortcut(",")
            }
        }
        .sheet(isPresented: $pairing) {
            NavigationStack {
                PairingView(store: store).formStyle(.grouped)
            }.frame(minWidth: 520, idealWidth: 600, minHeight: 540, idealHeight: 640)
        }
        .confirmationDialog(L10n.text("删除这条笔记？所有已配对设备也会同步删除。"), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button(L10n.text("删除笔记"), role: .destructive) {
                if let deleting { store.delete(deleting); if selection == deleting.id { selection = nil } }
                deleting = nil
            }
        }
        .alert(L10n.text("暂时无法完成"), isPresented: Binding(get: { !pairing && store.error != nil }, set: { if !$0 && !pairing { store.error = nil } })) {
            Button(L10n.text("知道了"), role: .cancel) { store.error = nil }
        } message: { Text(L10n.error(store.error ?? "")) }
    }
}
private struct MacNoteEditor: View {
    @Bindable var store: ClipboardStore
    let id: String
    @State private var text: String
    @State private var savedText: String
    @State private var revision: Int
    @State private var preview = false
    @State private var failure: String?
    init(store: ClipboardStore, id: String) {
        self.store = store; self.id = id
        let note = store.note(id)
        _text = State(initialValue: note?.text ?? ""); _savedText = State(initialValue: note?.text ?? "")
        _revision = State(initialValue: note?.revision ?? 0)
    }
    private func save() {
        guard text != savedText, revision != 0 || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        do {
            let note = try store.save(id: id, text: text, revision: revision)
            savedText = note.text; revision = note.revision; failure = nil
        } catch { failure = error.localizedDescription }
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(L10n.text("编辑笔记")).font(.headline)
                Spacer()
                Button { store.copy(text) } label: { Label(L10n.text("复制笔记"), systemImage: "doc.on.doc") }
                Toggle(L10n.text("预览"), isOn: $preview).toggleStyle(.button)
            }.padding()
            Divider()
            if preview { MarkdownView(text: text) }
            else { TextEditor(text: $text).font(.body).padding().accessibilityLabel(L10n.text("笔记内容")) }
            Divider()
            HStack {
                Text(failure.map(L10n.error) ?? L10n.text("已保存到本机")).foregroundStyle(failure == nil ? Color.secondary : .red)
                Spacer()
                Text("\(text.unicodeScalars.count) / 100,000")
            }.font(.caption).padding()
        }
        .onChange(of: text) { _, _ in save() }
        .onChange(of: store.notes) { _, _ in
            // Refresh a clean editor when another device changes its note; retain unsaved input.
            if text == savedText, let note = store.note(id), note.revision != revision {
                text = note.text; savedText = note.text; revision = note.revision
            }
        }
    }
}

private struct MacWelcomeView: View {
    @Bindable var store: ClipboardStore
    @State private var privacy = false
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            LanguagePicker().frame(width: 230)
            Image(systemName: "doc.on.clipboard.fill").font(.system(size: 56)).foregroundStyle(.tint)
            Text("NoteBaton").font(.largeTitle.bold())
            Text(L10n.text("iPhone、Mac 与网页，接着写。")).font(.title2)
            Text(L10n.text("笔记保存在本机及已同步的设备。没有云备份，请另行保留重要内容的副本。")).foregroundStyle(.secondary)
            Text(L10n.text("打开 App 时会读取剪贴板，相同内容不会重复保存。系统可能会询问粘贴权限。")).font(.callout).foregroundStyle(.secondary)
            Button(L10n.text("开始使用")) { store.activate() }.buttonStyle(.borderedProminent).controlSize(.large)
            Button(L10n.text("隐私政策")) { privacy = true }
        }.padding(48).frame(maxWidth: 640, alignment: .leading)
        .sheet(isPresented: $privacy) { NavigationStack { PrivacyPolicyView(showsCloseButton: true) }.frame(width: 650, height: 650) }
    }
}
