import Foundation

/// Capabilities for app-provided tools.
public struct AppToolsCapability: Codable, Sendable, Equatable {
    /// App supports tools/list_changed notifications
    public var listChanged: Bool?

    public init(listChanged: Bool? = nil) {
        self.listChanged = listChanged
    }
}

/// Capabilities provided by the Guest UI (App).
///
/// Apps declare these capabilities during the initialization handshake to indicate
/// what features they provide to the host.
public struct McpUiAppCapabilities: Codable, Sendable, Equatable {
    /// App exposes MCP-style tools that the host can call.
    /// These are app-specific tools, not proxied from the server.
    public var tools: AppToolsCapability?

    public init(tools: AppToolsCapability? = nil) {
        self.tools = tools
    }
}
