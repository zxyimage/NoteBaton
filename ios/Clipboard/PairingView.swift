import SwiftUI

struct PairingView: View {
    @Bindable var store: ClipboardStore
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""
    @State private var server = ""
    @State private var scanning = false
    @State private var advancedExpanded = false
    @State private var devicePairingExpanded = false
    @State private var generatingInvitation = false
    @State private var review: PairingTarget?
    @State private var revoking: Peer?
    @State private var success = false
    @FocusState private var focused: Bool

    private var hasPairingInput: Bool { !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var busy: Bool { store.connecting || store.migrating || generatingInvitation }

    private func prepare(_ value: String, server: String) {
        store.error = nil; success = false
        do { review = try PairingTarget.parse(value, manualServer: server); focused = false }
        catch { store.error = error.localizedDescription }
    }

    var body: some View {
        Form {
            Section {
                WebsiteGuide().padding(.vertical, 4)
            } header: { Text(L10n.text("1. 打开网页版")) }
            Section {
                pairingInput
                HStack {
                    #if os(iOS)
                    Button { scanning = true } label: { Label(L10n.text("扫描二维码"), systemImage: "qrcode.viewfinder") }
                    #endif
                    Spacer()
                    PasteButton(payloadType: String.self) { if let value = $0.first { input = value } }
                }
                #if os(iOS)
                Button(L10n.text("配对")) { prepare(input, server: server) }
                    .buttonStyle(.borderedProminent).disabled(!hasPairingInput)
                    .accessibilityIdentifier("pairLink")
                if success { Label(L10n.text("连接成功"), systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
                #endif
            } header: { Text(L10n.text("2. 粘贴配对链接")) }
            footer: { Text(L10n.text("确认网址后，即可开始同步。")) }
            Section {
                DisclosureGroup(isExpanded: $devicePairingExpanded) {
                    DevicePairingSection(store: store, server: server, generating: $generatingInvitation)
                        .padding(.top, 8)
                } label: { Text(L10n.text("连接另一台 iPhone 或 Mac")) }
                .disclosureGroupStyle(PairingDisclosureStyle(identifier: "devicePairingOptions", keepsContentAlive: true))
            }
            Section {
                DisclosureGroup(isExpanded: $advancedExpanded) {
                    advancedSettings.padding(.top, 12)
                } label: { Text(L10n.text("高级设置")) }
                .disclosureGroupStyle(PairingDisclosureStyle(identifier: "advancedPairingSettings"))
            } footer: { Text(L10n.text("自定义服务、已配对设备与更多选项")) }
        }
        .disabled(busy)
        .overlay {
            if store.connecting || generatingInvitation {
                ProgressView(L10n.text(generatingInvitation ? "正在生成…" : "正在连接…"))
                    .padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            }
        }
        .navigationTitle(L10n.text("配对与同步")).inlineTitle()
        #if os(iOS)
        .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button(L10n.text("收起键盘")) { focused = false } } }
        #else
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.text("关闭")) { store.error = nil; dismiss() }
                    .keyboardShortcut(.cancelAction).disabled(busy)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.text(success ? "完成" : "配对")) {
                    if success { store.error = nil; dismiss() }
                    else { prepare(input, server: server) }
                }.keyboardShortcut(.defaultAction).disabled(busy || (!success && !hasPairingInput))
                    .accessibilityIdentifier("pairLink")
            }
        }
        .interactiveDismissDisabled(busy)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let error = store.error {
                HStack(alignment: .top) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(L10n.text("暂时无法完成")).font(.headline)
                        Text(L10n.error(error)).font(.callout)
                    }
                    Spacer()
                    Button(L10n.text("知道了")) { store.error = nil }
                }.padding().frame(maxWidth: .infinity, alignment: .leading).background(.regularMaterial)
            } else if success {
                Label(L10n.text("连接成功"), systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green).padding().frame(maxWidth: .infinity, alignment: .leading).background(.regularMaterial)
            }
        }
        #endif
        .task { server = store.identity?.server ?? ""; input = store.suggestedPairingLink; await store.loadPeers() }
        .onChange(of: input) { _, value in
            store.suggestedPairingLink = value
            if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { success = false }
        }
        #if os(iOS)
        .sheet(isPresented: $scanning) {
            NavigationStack {
                QRScanner { result in input = result; scanning = false } onError: { message in scanning = false; store.error = message }
                    .ignoresSafeArea(edges: .bottom).navigationTitle(L10n.text("扫描网页配对码")).inlineTitle()
                    .toolbar { ToolbarItem(placement: .topBarLeading) { Button(L10n.text("返回")) { scanning = false } } }
            }
        }
        #endif
        .alert(L10n.text("确认同步服务"), isPresented: Binding(get: { review != nil }, set: { if !$0 { review = nil } }), presenting: review) { target in
            Button(L10n.text("返回"), role: .cancel) { review = nil }
            Button(target.code == nil ? L10n.text("连接服务") : L10n.text("授权此设备或网页")) {
                review = nil; success = false
                Task {
                    success = await store.connect(target)
                    if success {
                        // Connecting a custom service must not consume an unsubmitted pairing link.
                        if target.code != nil { input = "" }
                        server = target.server.absoluteString
                        if hasPairingInput { success = false; store.suggestedPairingLink = input }
                    }
                }
            }
        } message: { target in
            Text(verbatim: target.server.absoluteString + "\n\n" + L10n.text(target.code == nil ? "连接后，此服务上已配对的设备和网页可以同步本机笔记。" : "授权此设备或网页读取和编辑本机笔记。设备配对会双向合并笔记。") + "\n" + L10n.text("切换将断开当前服务，本机笔记会保留。"))
        }
        .confirmationDialog(L10n.text("移除此设备或网页的访问权限？已同步副本会保留。"), isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }), titleVisibility: .visible) {
            Button(L10n.text("移除配对"), role: .destructive) { if let revoking { Task { await store.revoke(revoking) } }; revoking = nil }
        }
    }

    private var pairingInput: some View {
        TextField(L10n.text("粘贴网页或另一台设备的完整配对链接"), text: $input, axis: .vertical)
            .labelsHidden().serverInput().focused($focused)
            .accessibilityLabel(L10n.text("配对链接"))
            .accessibilityIdentifier("pairingLinkInput")
            #if os(macOS)
            .textFieldStyle(.roundedBorder).lineLimit(3...5)
            #else
            .lineLimit(2...5)
            #endif
    }

    private var advancedSettings: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Text(L10n.text("自定义同步服务")).font(.headline)
                TextField(L10n.text("https://你的域名"), text: $server)
                    .serverInput().focused($focused).accessibilityLabel(L10n.text("服务网址"))
                Button(L10n.text("连接此服务")) { prepare("", server: server) }
                    .disabled(server.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Text(L10n.text("完整配对链接已包含网址，通常无需填写。"))
                    .font(.footnote).foregroundStyle(.secondary)
                Text(L10n.text("输入配对字符串时，请先填写它所属的网站。完整配对链接会使用链接里的网址。"))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Divider()
            VStack(alignment: .leading, spacing: 10) {
                Text(L10n.text("当前同步服务")).font(.headline)
                if let identity = store.identity {
                    serviceLink(identity.server)
                    Text(L10n.text(store.connection)).font(.caption).foregroundStyle(.secondary)
                    Button(L10n.text("断开服务，使用本机模式")) { store.disconnect(); success = false }
                } else { Text(L10n.text("本机模式 · 笔记仍会自动保存")).foregroundStyle(.secondary) }
            }
            if !store.services.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text(L10n.text("已保存服务")).font(.headline)
                    ForEach(store.services, id: \.self) { origin in
                        HStack {
                            serviceLink(origin)
                            Spacer()
                            if origin == store.identity?.server {
                                Image(systemName: "checkmark").accessibilityLabel(L10n.text("当前同步服务"))
                            } else {
                                Button(L10n.text("连接服务")) { prepare("", server: origin) }
                            }
                        }
                    }
                }
            }
            if store.identity != nil {
                Divider()
                VStack(alignment: .leading, spacing: 10) {
                    Text(L10n.text("已授权的设备与网页")).font(.headline)
                    DeviceConnectionsView(store: store)
                    if store.peers.isEmpty && !store.nativeLinks.contains(where: { $0.server == store.identity?.server }) {
                        Text(L10n.text("尚无授权设备或网页")).foregroundStyle(.secondary)
                    }
                    ForEach(store.peers) { peer in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(L10n.format(peer.kind == "native" ? "设备 · %@" : "网页 · %@", String(peer.id.prefix(6))))
                                Text(Date(timeIntervalSince1970: peer.createdAt / 1000), format: .dateTime.month().day().hour().minute())
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(L10n.text("移除"), role: .destructive) { revoking = peer }
                        }
                    }
                }
                #if os(iOS)
                if !store.legacyMigrated { NavigationLink(L10n.text("导入旧版笔记")) { LegacyImportView(store: store) } }
                #endif
            }
            Divider()
            LanguagePicker()
            Text(L10n.text("iPhone 在前台、Mac App 运行时同步。笔记端到端加密，服务只转发密文。配对链接包含密钥，请勿公开。网页授权 7 天、设备授权 1 年有效。"))
                .font(.footnote).foregroundStyle(.secondary)
            NavigationLink(L10n.text("App 隐私政策")) { PrivacyPolicyView() }
            NavigationLink(L10n.text("第三方开源许可")) { ThirdPartyNoticesView() }
        }.frame(maxWidth: .infinity, alignment: .leading)
            .buttonStyle(.borderless)
    }

    @ViewBuilder private func serviceLink(_ origin: String) -> some View {
        if let url = try? PairingTarget.origin(origin) {
            Link(destination: url) { Label(origin, systemImage: "arrow.up.right.square").font(.callout) }
        } else { Text(origin).font(.callout) }
    }
}

private struct PairingDisclosureStyle: DisclosureGroupStyle {
    let identifier: String
    var keepsContentAlive = false

    func makeBody(configuration: Configuration) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { configuration.isExpanded.toggle() } label: {
                HStack(spacing: 8) {
                    Image(systemName: configuration.isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    configuration.label
                    Spacer(minLength: 0)
                }.padding(.vertical, 6).contentShape(Rectangle())
            }.buttonStyle(.plain)
                .accessibilityValue(L10n.text(configuration.isExpanded ? "已展开" : "已收起"))
                .accessibilityIdentifier(identifier)
            // Keep a generated code and its approval polling alive when the row is collapsed.
            if configuration.isExpanded || keepsContentAlive {
                configuration.content
                    .frame(height: configuration.isExpanded ? nil : 0, alignment: .top)
                    .clipped().opacity(configuration.isExpanded ? 1 : 0)
                    .accessibilityHidden(!configuration.isExpanded)
                    .disabled(!configuration.isExpanded)
            }
        }
    }
}
