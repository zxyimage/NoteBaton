import SwiftUI
import WebKit

#if os(macOS)
typealias MarkdownRepresentable = NSViewRepresentable
#else
typealias MarkdownRepresentable = UIViewRepresentable
#endif
struct MarkdownView: MarkdownRepresentable {
    let text: String
    func makeCoordinator() -> Coordinator { Coordinator() }
    #if os(macOS)
    func makeNSView(context: Context) -> WKWebView { makeWebView(context: context) }
    func updateNSView(_ view: WKWebView, context: Context) { update(view, context: context) }
    #else
    func makeUIView(context: Context) -> WKWebView { makeWebView(context: context) }
    func updateUIView(_ view: WKWebView, context: Context) { update(view, context: context) }
    #endif
    private func makeWebView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: config)
        #if os(iOS)
        view.isOpaque = false; view.backgroundColor = .clear; view.scrollView.backgroundColor = .clear
        #endif
        view.navigationDelegate = context.coordinator
        context.coordinator.text = text
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Markdown") {
            view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return view
    }
    private func update(_ view: WKWebView, context: Context) { context.coordinator.text = text; context.coordinator.render(view) }
    final class Coordinator: NSObject, WKNavigationDelegate {
        var text = ""; private var rendered: String?; private var ready = false
        func render(_ view: WKWebView) {
            guard ready, rendered != text else { return }; rendered = text
            view.callAsyncJavaScript("window.renderNote(text)", arguments: ["text": text], in: nil, in: .page) { _ in }
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { ready = true; render(webView) }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated {
                if let url = navigationAction.request.url, ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") {
                    #if os(macOS)
                    NSWorkspace.shared.open(url)
                    #else
                    UIApplication.shared.open(url)
                    #endif
                }
                decisionHandler(.cancel)
            } else { decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel) }
        }
    }
}
