import SwiftUI

@main
struct ClipboardApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(MacAppDelegate.self) private var appDelegate
    #endif
    @State private var store = ClipboardStore()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        #if os(macOS)
        Window("NoteBaton", id: "notes") {
            MacRootView(store: store)
                .environment(\.locale, AppLanguage.shared.locale)
                .frame(minWidth: 760, minHeight: 520)
                .task { store.setActive(true) }
                .onChange(of: phase) { _, value in if value == .active { store.setActive(true); store.importClipboard() } }
        }.defaultSize(width: 1050, height: 720)
        MenuBarExtra("NoteBaton", systemImage: "doc.on.clipboard") {
            MacMenuBarView(store: store)
                .environment(\.locale, AppLanguage.shared.locale)
        }.menuBarExtraStyle(.menu)
        #else
        WindowGroup {
            RootView(store: store)
                .environment(\.locale, AppLanguage.shared.locale)
                .tint(Color(red: 0.21, green: 0.36, blue: 0.96))
                .task { store.setActive(phase == .active) }
                .onChange(of: phase) { _, value in store.setActive(value == .active) }
        }
        #endif
    }
}
