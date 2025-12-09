import SwiftUI
import WebKit
import McpApps

/// SwiftUI wrapper for WKWebView with MCP Apps integration.
///
/// This view:
/// 1. Creates a WKWebView instance
/// 2. Sets up WKWebViewTransport for AppBridge communication
/// 3. Loads the UI HTML from the tool call
/// 4. Handles AppBridge initialization and lifecycle
struct WebViewContainer: UIViewRepresentable {
    /// Tool call information containing HTML and AppBridge setup
    @ObservedObject var toolCallInfo: ToolCallInfo

    func makeUIView(context: Context) -> WKWebView {
        // Create web view configuration
        let configuration = WKWebViewConfiguration()

        // Enable JavaScript
        configuration.preferences.javaScriptEnabled = true

        // Create web view
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.scrollView.isScrollEnabled = true
        webView.isOpaque = false
        webView.backgroundColor = .clear

        // Set up navigation delegate
        webView.navigationDelegate = context.coordinator

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Only load content once when HTML is available
        guard let html = toolCallInfo.htmlContent,
              context.coordinator.hasLoadedContent == false else {
            return
        }

        // Create transport
        let transport = WKWebViewTransport(webView: webView, handlerName: "mcpBridge")

        // Set up AppBridge
        Task {
            do {
                // Start transport (injects bridge script)
                try await transport.start()

                // Set up AppBridge with callbacks
                try await toolCallInfo.setupAppBridge(transport: transport)

                // Load HTML content
                await MainActor.run {
                    webView.loadHTMLString(html, baseURL: nil)
                    context.coordinator.hasLoadedContent = true
                }
            } catch {
                print("[WebViewContainer] Failed to set up AppBridge: \(error)")
                await MainActor.run {
                    toolCallInfo.state = .error
                    toolCallInfo.error = "Failed to set up AppBridge: \(error.localizedDescription)"
                }
            }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    /// Coordinator to handle WebView navigation
    class Coordinator: NSObject, WKNavigationDelegate {
        var hasLoadedContent = false

        func webView(
            _ webView: WKWebView,
            didFinish navigation: WKNavigation!
        ) {
            print("[WebViewContainer] WebView finished loading")
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            print("[WebViewContainer] WebView navigation failed: \(error)")
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            print("[WebViewContainer] WebView provisional navigation failed: \(error)")
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            // Allow all navigation for now
            // In a production app, you might want to restrict navigation
            decisionHandler(.allow)
        }
    }
}
