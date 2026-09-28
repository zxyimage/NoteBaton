import SwiftUI
import CoreImage.CIFilterBuiltins

struct DevicePairingSection: View {
    @Bindable var store: ClipboardStore
    var server: String
    @Binding var generating: Bool
    @State private var invitation: DeviceInvitation?
    @State private var review: PairingTarget?
    @State private var message = ""

    private func qr(_ text: String) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator(); filter.message = Data(text.utf8)
        guard let output = filter.outputImage else { return nil }
        return CIContext().createCGImage(output, from: output.extent)
    }
    private func generate(connect target: PairingTarget? = nil) async {
        guard !generating else { return }
        generating = true; defer { generating = false }
        invitation = nil; message = ""; store.error = nil
        if let target, !(await store.connect(target)) { return }
        do { invitation = try await store.createInvitation() }
        catch { store.error = error.localizedDescription }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.text("在这台设备生成配对码，再用另一台设备扫码或粘贴链接。两边的笔记会合并。"))
                .font(.subheadline).foregroundStyle(.secondary)
            Button(L10n.text("生成本机配对码")) {
                if store.identity == nil {
                    do {
                        let address = server.trimmingCharacters(in: .whitespacesAndNewlines)
                        review = try PairingTarget.parse("", manualServer: address.isEmpty ? OfficialWebsite.url.absoluteString : address)
                    } catch { store.error = error.localizedDescription }
                } else { Task { await generate() } }
            }.disabled(generating || store.connecting || store.migrating)
                .accessibilityIdentifier("generateDevicePairing")
            if let invitation {
                if let code = qr(invitation.link) {
                    Image(decorative: code, scale: 1).interpolation(.none).resizable().scaledToFit()
                        .frame(width: 190, height: 190).padding(12).background(.white)
                        .accessibilityLabel(L10n.text("设备配对二维码"))
                }
                Button(L10n.text("复制设备配对链接")) { store.copy(invitation.link) }
                Text(L10n.text("等待另一台设备确认 · 配对码 5 分钟有效")).font(.caption).foregroundStyle(.secondary)
                Button(L10n.text("取消"), role: .cancel) { self.invitation = nil }
            }
            if !message.isEmpty { Text(L10n.text(message)).font(.caption).foregroundStyle(.secondary) }
        }.frame(maxWidth: .infinity, alignment: .leading)
        .buttonStyle(.borderless)
        .alert(L10n.text("确认同步服务"), isPresented: Binding(get: { review != nil }, set: { if !$0 { review = nil } }), presenting: review) { target in
            Button(L10n.text("返回"), role: .cancel) { review = nil }
            Button(L10n.text("连接并生成配对码")) { review = nil; Task { await generate(connect: target) } }
        } message: { target in
            Text(verbatim: target.server.absoluteString + "\n\n" + L10n.text("连接此服务后会生成本机配对码，再用另一台设备确认。"))
        }
        .onChange(of: store.identity?.server) { _, origin in
            if let invitation, invitation.server.absoluteString != origin { self.invitation = nil; message = "" }
        }
        .task(id: invitation?.link) {
            guard let current = invitation else { return }
            while !Task.isCancelled && Date().timeIntervalSince1970 * 1000 < current.expiresAt {
                do {
                    if try await store.claimInvitation(current) {
                        invitation = nil; message = "设备已配对，正在合并笔记"; return
                    }
                    try await Task.sleep(for: .seconds(2))
                } catch is CancellationError { return }
                catch {
                    guard !Task.isCancelled else { return }
                    message = error.localizedDescription
                    if let error = error as? ServiceError, [400, 410].contains(error.status) { invitation = nil; return }
                    do { try await Task.sleep(for: .seconds(3)) } catch { return }
                }
            }
            if !Task.isCancelled { invitation = nil; message = "配对码已过期，请重新生成" }
        }
    }
}

struct DeviceConnectionsView: View {
    @Bindable var store: ClipboardStore
    @State private var removing: NativeLink?

    var body: some View {
        ForEach(store.nativeLinks.filter { $0.server == store.identity?.server }) { link in
            HStack {
                VStack(alignment: .leading) {
                    Text(L10n.format("设备 · %@", String(link.deviceId.prefix(6))))
                    Text(L10n.text(store.deviceStatus[link.id] ?? "等待连接")).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button(L10n.text("移除"), role: .destructive) { removing = link }
            }
        }
        .confirmationDialog(L10n.text("移除此设备的同步连接？本机笔记会保留。"), isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button(L10n.text("移除配对"), role: .destructive) { if let removing { Task { await store.removeLink(removing) } }; removing = nil }
        }
    }
}
