import AppKit
import SwiftUI

final class MacAppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // The app-owned store keeps syncing while the notes window is closed.
        false
    }
}

struct MacMenuBarView: View {
    @Bindable var store: ClipboardStore
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Text("NoteBaton")
        Label(L10n.text(store.connection), systemImage: store.connected ? "checkmark.circle" : "circle")
            .accessibilityIdentifier("menuBarSyncStatus")
        Divider()
        Button(L10n.text("打开 NoteBaton")) {
            openWindow(id: "notes")
            NSApplication.shared.activate()
        }.accessibilityIdentifier("menuBarOpenNotes")
        Divider()
        Button(L10n.text("退出 NoteBaton")) {
            NSApplication.shared.terminate(nil)
        }.keyboardShortcut("q")
            .accessibilityIdentifier("menuBarQuit")
    }
}
