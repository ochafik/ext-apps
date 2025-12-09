import Foundation
import SwiftUI
import MCP
import McpApps

/// View model managing MCP server connection and tool execution.
///
/// This class handles:
/// - Connecting to an MCP server via StreamableHTTP
/// - Listing available tools from the server
/// - Calling tools and retrieving their UI resources
/// - Managing AppBridge instances for each tool UI
@MainActor
class McpHostViewModel: ObservableObject {
    // MARK: - Published State

    /// Current connection state
    @Published var connectionState: ConnectionState = .disconnected

    /// List of tools available from the connected server
    @Published var tools: [MCPTool] = []

    /// Currently selected tool for execution
    @Published var selectedTool: MCPTool?

    /// JSON input for tool execution
    @Published var toolInputJson: String = "{}"

    /// Active tool calls being displayed
    @Published var activeToolCalls: [ToolCallInfo] = []

    /// Error message to display
    @Published var errorMessage: String?

    // MARK: - Private State

    private var mcpClient: MCPClient?
    private var serverUrl: URL

    /// Host implementation info
    private let hostInfo = Implementation(
        name: "BasicHostSwift",
        version: "1.0.0"
    )

    /// Host capabilities advertised to Guest UIs
    private let hostCapabilities = McpUiHostCapabilities(
        openLinks: true,
        serverTools: ServerToolsCapability(),
        serverResources: ServerResourcesCapability(),
        logging: true
    )

    // MARK: - Initialization

    init(serverUrl: URL = URL(string: "http://localhost:3001/mcp")!) {
        self.serverUrl = serverUrl
    }

    // MARK: - Connection Management

    /// Connect to the MCP server and list available tools
    func connect() async {
        connectionState = .connecting
        errorMessage = nil

        do {
            // Create MCP client
            let client = MCPClient(
                info: ClientInfo(name: hostInfo.name, version: hostInfo.version)
            )

            // Connect using StreamableHTTP transport
            let transport = StreamableHTTPClientTransport(endpoint: serverUrl)
            try await client.connect(transport: transport)

            self.mcpClient = client

            // List available tools
            let toolsList = try await client.listTools()
            self.tools = toolsList.tools

            connectionState = .connected

            // Select first tool by default
            if !tools.isEmpty {
                selectedTool = tools[0]
            }
        } catch {
            connectionState = .error(error.localizedDescription)
            errorMessage = "Failed to connect: \(error.localizedDescription)"
        }
    }

    /// Disconnect from the MCP server
    func disconnect() async {
        if let client = mcpClient {
            await client.close()
        }
        mcpClient = nil
        tools = []
        selectedTool = nil
        activeToolCalls = []
        connectionState = .disconnected
    }

    // MARK: - Tool Execution

    /// Call the selected tool with the provided input
    func callTool() async {
        guard let tool = selectedTool else { return }
        guard let client = mcpClient else { return }

        errorMessage = nil

        do {
            // Parse JSON input
            guard let inputData = toolInputJson.data(using: .utf8),
                  let inputDict = try JSONSerialization.jsonObject(with: inputData) as? [String: Any] else {
                throw ToolCallError.invalidJson
            }

            // Call the tool
            let request = CallToolRequest(
                name: tool.name,
                arguments: inputDict
            )

            // Create tool call info
            let toolCallInfo = ToolCallInfo(
                tool: tool,
                input: inputDict,
                client: client,
                hostInfo: hostInfo,
                hostCapabilities: hostCapabilities
            )

            // Add to active tool calls
            activeToolCalls.append(toolCallInfo)

            // Execute the call asynchronously
            Task {
                await toolCallInfo.execute()
            }

        } catch {
            errorMessage = "Failed to call tool: \(error.localizedDescription)"
        }
    }

    /// Remove a tool call from the active list
    func removeToolCall(_ toolCall: ToolCallInfo) {
        activeToolCalls.removeAll { $0.id == toolCall.id }
    }
}

// MARK: - Connection State

enum ConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case error(String)

    var description: String {
        switch self {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .error(let message): return "Error: \(message)"
        }
    }
}

// MARK: - Tool Call Info

/// Information about an active tool call and its UI
@MainActor
class ToolCallInfo: ObservableObject, Identifiable {
    let id = UUID()

    /// The tool being called
    let tool: MCPTool

    /// Input arguments for the tool
    let input: [String: Any]

    /// MCP client for server communication
    let client: MCPClient

    /// Host implementation info
    let hostInfo: Implementation

    /// Host capabilities
    let hostCapabilities: McpUiHostCapabilities

    /// AppBridge instance for this tool UI
    @Published var appBridge: AppBridge?

    /// HTML content for the UI
    @Published var htmlContent: String?

    /// CSP configuration from the UI resource
    @Published var cspConfig: CspConfig?

    /// Tool execution result
    @Published var result: CallToolResult?

    /// Execution state
    @Published var state: ExecutionState = .calling

    /// Error message if execution failed
    @Published var error: String?

    init(
        tool: MCPTool,
        input: [String: Any],
        client: MCPClient,
        hostInfo: Implementation,
        hostCapabilities: McpUiHostCapabilities
    ) {
        self.tool = tool
        self.input = input
        self.client = client
        self.hostInfo = hostInfo
        self.hostCapabilities = hostCapabilities
    }

    /// Execute the tool call and load UI if available
    func execute() async {
        do {
            state = .calling

            // Call the tool
            let request = CallToolRequest(name: tool.name, arguments: input)
            let callResult = try await client.callTool(request)
            self.result = callResult

            // Check if tool has a UI resource
            if let uiResourceUri = getUiResourceUri(from: tool) {
                state = .loadingUi
                try await loadUiResource(uri: uiResourceUri)
                state = .ready
            } else {
                state = .completed
            }
        } catch {
            state = .error
            self.error = error.localizedDescription
        }
    }

    /// Extract UI resource URI from tool metadata
    private func getUiResourceUri(from tool: MCPTool) -> String? {
        // Look for ui/resourceUri in tool._meta
        guard let meta = tool._meta as? [String: Any],
              let uri = meta[McpAppsConfig.resourceUriMetaKey] as? String,
              uri.hasPrefix("ui://") else {
            return nil
        }
        return uri
    }

    /// Load the UI resource HTML from the MCP server
    private func loadUiResource(uri: String) async throws {
        let request = ReadResourceRequest(uri: uri)
        let resource = try await client.readResource(request)

        // Extract HTML content
        guard let content = resource.contents.first else {
            throw ToolCallError.noResourceContent
        }

        // Check MIME type
        guard content.mimeType == McpAppsConfig.resourceMimeType else {
            throw ToolCallError.invalidMimeType(content.mimeType ?? "unknown")
        }

        // Decode HTML
        if let text = content.text {
            htmlContent = text
        } else if let blob = content.blob {
            // Decode base64 blob
            guard let data = Data(base64Encoded: blob),
                  let text = String(data: data, encoding: .utf8) else {
                throw ToolCallError.invalidHtmlContent
            }
            htmlContent = text
        }

        // Extract CSP configuration from metadata
        if let meta = content._meta as? [String: Any],
           let uiMeta = meta["ui"] as? [String: Any],
           let csp = uiMeta["csp"] as? [String: Any] {

            let connectDomains = csp["connectDomains"] as? [String]
            let resourceDomains = csp["resourceDomains"] as? [String]

            cspConfig = CspConfig(
                connectDomains: connectDomains,
                resourceDomains: resourceDomains
            )
        }
    }

    /// Set up AppBridge after WebView is ready
    func setupAppBridge(transport: WKWebViewTransport) async throws {
        let bridge = AppBridge(
            hostInfo: hostInfo,
            hostCapabilities: hostCapabilities,
            options: HostOptions(
                hostContext: McpUiHostContext(
                    theme: .light,
                    displayMode: .inline,
                    platform: .mobile,
                    deviceCapabilities: DeviceCapabilities(touch: true, hover: false)
                )
            )
        )

        // Set up callbacks
        await bridge.setOnInitialized { [weak self] in
            Task { @MainActor in
                // Send tool input after initialization
                if let self = self {
                    try? await bridge.sendToolInput(
                        arguments: self.input.mapValues { AnyCodable($0) }
                    )

                    // Send tool result if available
                    if let result = self.result {
                        try? await self.sendToolResult(result, to: bridge)
                    }
                }
            }
        }

        await bridge.setOnMessage { role, content in
            print("[Host] Message from Guest UI: \(role) - \(content)")
            return McpUiMessageResult(isError: false)
        }

        await bridge.setOnOpenLink { url in
            print("[Host] Open link request: \(url)")
            if let urlObj = URL(string: url) {
                await UIApplication.shared.open(urlObj)
            }
            return McpUiOpenLinkResult(isError: false)
        }

        await bridge.setOnLoggingMessage { level, data, logger in
            print("[Host] Guest UI log [\(level)]: \(data.value) [\(logger ?? "")]")
        }

        await bridge.setOnSizeChange { width, height in
            print("[Host] Size change requested: \(width ?? 0) x \(height ?? 0)")
        }

        // Set up MCP server forwarding if needed
        await bridge.setOnToolCall { [weak self] toolName, arguments in
            guard let self = self else {
                throw ToolCallError.clientNotAvailable
            }

            let request = CallToolRequest(
                name: toolName,
                arguments: arguments?.mapValues { $0.value } ?? [:]
            )
            let result = try await self.client.callTool(request)

            return [
                "content": AnyCodable(result.content.map { content in
                    if let text = content.text {
                        return ["type": "text", "text": text]
                    }
                    return ["type": "text", "text": ""]
                }),
                "isError": AnyCodable(result.isError ?? false)
            ]
        }

        await bridge.setOnResourceRead { [weak self] uri in
            guard let self = self else {
                throw ToolCallError.clientNotAvailable
            }

            let request = ReadResourceRequest(uri: uri)
            let resource = try await self.client.readResource(request)

            return [
                "contents": AnyCodable(resource.contents.map { content in
                    var dict: [String: Any] = [:]
                    if let text = content.text {
                        dict["text"] = text
                    }
                    if let blob = content.blob {
                        dict["blob"] = blob
                    }
                    if let mimeType = content.mimeType {
                        dict["mimeType"] = mimeType
                    }
                    if let uri = content.uri {
                        dict["uri"] = uri
                    }
                    return dict
                })
            ]
        }

        // Connect the bridge
        try await bridge.connect(transport)

        self.appBridge = bridge
    }

    /// Send tool result to AppBridge
    private func sendToolResult(_ result: CallToolResult, to bridge: AppBridge) async throws {
        try await bridge.sendToolResult([
            "content": AnyCodable(result.content.map { content in
                if let text = content.text {
                    return ["type": "text", "text": text]
                }
                return ["type": "text", "text": ""]
            }),
            "isError": AnyCodable(result.isError ?? false)
        ])
    }
}

// MARK: - Execution State

enum ExecutionState {
    case calling
    case loadingUi
    case ready
    case completed
    case error

    var description: String {
        switch self {
        case .calling: return "Calling tool..."
        case .loadingUi: return "Loading UI..."
        case .ready: return "Ready"
        case .completed: return "Completed"
        case .error: return "Error"
        }
    }
}

// MARK: - Errors

enum ToolCallError: LocalizedError {
    case invalidJson
    case noResourceContent
    case invalidMimeType(String)
    case invalidHtmlContent
    case clientNotAvailable

    var errorDescription: String? {
        switch self {
        case .invalidJson:
            return "Invalid JSON input"
        case .noResourceContent:
            return "No content in UI resource"
        case .invalidMimeType(let mimeType):
            return "Invalid MIME type: \(mimeType)"
        case .invalidHtmlContent:
            return "Invalid HTML content"
        case .clientNotAvailable:
            return "MCP client not available"
        }
    }
}

// MARK: - Helper Extensions

extension AppBridge {
    func setOnInitialized(_ callback: @escaping @Sendable () -> Void) async {
        self.onInitialized = callback
    }

    func setOnMessage(_ callback: @escaping @Sendable (String, [TextContent]) async -> McpUiMessageResult) async {
        self.onMessage = callback
    }

    func setOnOpenLink(_ callback: @escaping @Sendable (String) async -> McpUiOpenLinkResult) async {
        self.onOpenLink = callback
    }

    func setOnLoggingMessage(_ callback: @escaping @Sendable (LogLevel, AnyCodable, String?) -> Void) async {
        self.onLoggingMessage = callback
    }

    func setOnSizeChange(_ callback: @escaping @Sendable (Int?, Int?) -> Void) async {
        self.onSizeChange = callback
    }

    func setOnToolCall(_ callback: @escaping @Sendable (String, [String: AnyCodable]?) async throws -> [String: AnyCodable]) async {
        self.onToolCall = callback
    }

    func setOnResourceRead(_ callback: @escaping @Sendable (String) async throws -> [String: AnyCodable]) async {
        self.onResourceRead = callback
    }
}
