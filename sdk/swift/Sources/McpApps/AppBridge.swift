import Foundation

/// Options for configuring AppBridge behavior.
public struct HostOptions: Sendable {
    /// Initial host context to send during initialization
    public var hostContext: McpUiHostContext

    public init(hostContext: McpUiHostContext = McpUiHostContext()) {
        self.hostContext = hostContext
    }
}

/// Host-side bridge for communicating with a single Guest UI (App).
///
/// AppBridge acts as a proxy between the host application and a Guest UI
/// running in a WebView. It handles the initialization handshake and
/// forwards MCP server capabilities to the Guest UI.
///
/// ## Architecture
///
/// **Guest UI ↔ AppBridge ↔ Host ↔ MCP Server**
///
/// ## Lifecycle
///
/// 1. **Create**: Instantiate AppBridge with MCP client and capabilities
/// 2. **Connect**: Call `connect()` with transport to establish communication
/// 3. **Wait for init**: Guest UI sends initialize request, bridge responds
/// 4. **Send data**: Call `sendToolInput()`, `sendToolResult()`, etc.
/// 5. **Teardown**: Call `sendResourceTeardown()` before unmounting WebView
public actor AppBridge {
    private let hostInfo: Implementation
    private let hostCapabilities: McpUiHostCapabilities
    private var hostContext: McpUiHostContext
    private var transport: (any McpAppsTransport)?

    private var appCapabilities: McpUiAppCapabilities?
    private var appInfo: Implementation?
    private var isInitialized: Bool = false
    private var nextRequestId: Int = 1

    private var pendingRequests: [JSONRPCId: CheckedContinuation<AnyCodable, Error>] = [:]
    private var requestHandlers: [String: @Sendable (([String: AnyCodable]?) async throws -> AnyCodable)] = [:]
    private var notificationHandlers: [String: @Sendable (([String: AnyCodable]?) async -> Void)] = [:]

    // Callbacks
    public var onInitialized: (@Sendable () -> Void)?
    public var onSizeChange: (@Sendable (Int?, Int?) -> Void)?
    public var onMessage: (@Sendable (String, [TextContent]) async -> McpUiMessageResult)?
    public var onOpenLink: (@Sendable (String) async -> McpUiOpenLinkResult)?
    public var onLoggingMessage: (@Sendable (LogLevel, AnyCodable, String?) -> Void)?
    public var onPing: (@Sendable () -> Void)?

    /// Create a new AppBridge instance.
    ///
    /// - Parameters:
    ///   - hostInfo: Host application identification (name and version)
    ///   - hostCapabilities: Features and capabilities the host supports
    ///   - options: Configuration options
    public init(
        hostInfo: Implementation,
        hostCapabilities: McpUiHostCapabilities,
        options: HostOptions = HostOptions()
    ) {
        self.hostInfo = hostInfo
        self.hostCapabilities = hostCapabilities
        self.hostContext = options.hostContext
        setupHandlers()
    }

    private func setupHandlers() {
        // Handle ui/initialize request
        requestHandlers["ui/initialize"] = { [weak self] params in
            guard let self = self else { throw BridgeError.disconnected }
            return try await self.handleInitialize(params)
        }

        // Handle ui/message request
        requestHandlers["ui/message"] = { [weak self] params in
            guard let self = self else { throw BridgeError.disconnected }
            return try await self.handleMessage(params)
        }

        // Handle ui/open-link request
        requestHandlers["ui/open-link"] = { [weak self] params in
            guard let self = self else { throw BridgeError.disconnected }
            return try await self.handleOpenLink(params)
        }

        // Handle ping request
        requestHandlers["ping"] = { [weak self] _ in
            await self?.onPing?()
            return AnyCodable([:])
        }
    }

    private func handleInitialize(_ params: [String: AnyCodable]?) async throws -> AnyCodable {
        // Decode params
        let data = try JSONSerialization.data(withJSONObject: params?.mapValues { $0.value } ?? [:])
        let initParams = try JSONDecoder().decode(McpUiInitializeParams.self, from: data)

        appCapabilities = initParams.appCapabilities
        appInfo = initParams.appInfo

        let requestedVersion = initParams.protocolVersion
        let protocolVersion = McpAppsConfig.supportedProtocolVersions.contains(requestedVersion)
            ? requestedVersion
            : McpAppsConfig.latestProtocolVersion

        let result = McpUiInitializeResult(
            protocolVersion: protocolVersion,
            hostInfo: hostInfo,
            hostCapabilities: hostCapabilities,
            hostContext: hostContext
        )

        let resultData = try JSONEncoder().encode(result)
        let resultDict = try JSONSerialization.jsonObject(with: resultData) as? [String: Any] ?? [:]
        return AnyCodable(resultDict)
    }

    private func handleMessage(_ params: [String: AnyCodable]?) async throws -> AnyCodable {
        let data = try JSONSerialization.data(withJSONObject: params?.mapValues { $0.value } ?? [:])
        let msgParams = try JSONDecoder().decode(McpUiMessageParams.self, from: data)

        let result = await onMessage?(msgParams.role, msgParams.content) ?? McpUiMessageResult(isError: true)
        return AnyCodable(["isError": result.isError ?? false])
    }

    private func handleOpenLink(_ params: [String: AnyCodable]?) async throws -> AnyCodable {
        let data = try JSONSerialization.data(withJSONObject: params?.mapValues { $0.value } ?? [:])
        let linkParams = try JSONDecoder().decode(McpUiOpenLinkParams.self, from: data)

        let result = await onOpenLink?(linkParams.url) ?? McpUiOpenLinkResult(isError: true)
        return AnyCodable(["isError": result.isError ?? false])
    }

    /// Connect to the Guest UI via transport.
    public func connect(_ transport: any McpAppsTransport) async throws {
        self.transport = transport
        try await transport.start()

        // Start processing incoming messages
        Task {
            for try await message in await transport.incoming {
                await handleMessage(message)
            }
        }
    }

    /// Close the connection.
    public func close() async {
        await transport?.close()
        transport = nil
    }

    private func handleMessage(_ message: JSONRPCMessage) async {
        switch message {
        case .request(let request):
            await handleRequest(request)
        case .notification(let notification):
            await handleNotification(notification)
        case .response(let response):
            handleResponse(response)
        case .error(let error):
            handleErrorResponse(error)
        }
    }

    private func handleRequest(_ request: JSONRPCRequest) async {
        guard let handler = requestHandlers[request.method] else {
            await sendError(id: request.id, code: JSONRPCError.methodNotFound, message: "Method not found: \(request.method)")
            return
        }

        do {
            let result = try await handler(request.params)
            let response = JSONRPCResponse(id: request.id, result: result)
            try await transport?.send(.response(response))
        } catch {
            await sendError(id: request.id, code: JSONRPCError.internalError, message: error.localizedDescription)
        }
    }

    private func handleNotification(_ notification: JSONRPCNotification) async {
        // Handle ui/notifications/initialized
        if notification.method == "ui/notifications/initialized" {
            isInitialized = true
            onInitialized?()
            return
        }

        // Handle ui/notifications/size-changed
        if notification.method == "ui/notifications/size-changed" {
            let width = (notification.params?["width"]?.value as? Int)
            let height = (notification.params?["height"]?.value as? Int)
            onSizeChange?(width, height)
            return
        }

        // Handle notifications/message (logging)
        if notification.method == "notifications/message" {
            if let level = notification.params?["level"]?.value as? String,
               let logLevel = LogLevel(rawValue: level),
               let data = notification.params?["data"] {
                let logger = notification.params?["logger"]?.value as? String
                onLoggingMessage?(logLevel, data, logger)
            }
            return
        }

        // Check custom handlers
        if let handler = notificationHandlers[notification.method] {
            await handler(notification.params)
        }
    }

    private func handleResponse(_ response: JSONRPCResponse) {
        if let continuation = pendingRequests.removeValue(forKey: response.id) {
            continuation.resume(returning: response.result)
        }
    }

    private func handleErrorResponse(_ response: JSONRPCErrorResponse) {
        if let id = response.id, let continuation = pendingRequests.removeValue(forKey: id) {
            continuation.resume(throwing: BridgeError.rpcError(response.error))
        }
    }

    private func sendError(id: JSONRPCId, code: Int, message: String) async {
        let error = JSONRPCErrorResponse(
            id: id,
            error: JSONRPCError(code: code, message: message)
        )
        try? await transport?.send(.error(error))
    }

    // MARK: - Public Methods

    /// Get the Guest UI's capabilities discovered during initialization.
    public func getAppCapabilities() -> McpUiAppCapabilities? {
        appCapabilities
    }

    /// Get the Guest UI's implementation info discovered during initialization.
    public func getAppVersion() -> Implementation? {
        appInfo
    }

    /// Check if the Guest UI has completed initialization.
    public func isReady() -> Bool {
        isInitialized
    }

    /// Send complete tool arguments to the Guest UI.
    public func sendToolInput(arguments: [String: AnyCodable]?) async throws {
        try await sendNotification(
            method: "ui/notifications/tool-input",
            params: ["arguments": AnyCodable(arguments?.mapValues { $0.value } ?? [:])]
        )
    }

    /// Send streaming partial tool arguments to the Guest UI.
    public func sendToolInputPartial(arguments: [String: AnyCodable]?) async throws {
        try await sendNotification(
            method: "ui/notifications/tool-input-partial",
            params: ["arguments": AnyCodable(arguments?.mapValues { $0.value } ?? [:])]
        )
    }

    /// Send tool execution result to the Guest UI.
    public func sendToolResult(_ result: [String: AnyCodable]) async throws {
        try await sendNotification(
            method: "ui/notifications/tool-result",
            params: result
        )
    }

    /// Update the host context and notify the Guest UI of changes.
    public func setHostContext(_ newContext: McpUiHostContext) async throws {
        guard newContext != hostContext else { return }
        hostContext = newContext

        let data = try JSONEncoder().encode(newContext)
        let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        try await sendNotification(
            method: "ui/notifications/host-context-changed",
            params: dict.mapValues { AnyCodable($0) }
        )
    }

    /// Request graceful shutdown of the Guest UI.
    public func sendResourceTeardown() async throws -> McpUiResourceTeardownResult {
        _ = try await sendRequest(method: "ui/resource-teardown", params: nil)
        return McpUiResourceTeardownResult()
    }

    // MARK: - Private Helpers

    private func sendNotification(method: String, params: [String: AnyCodable]?) async throws {
        let notification = JSONRPCNotification(method: method, params: params)
        try await transport?.send(.notification(notification))
    }

    private func sendRequest(method: String, params: [String: AnyCodable]?) async throws -> AnyCodable {
        let id = JSONRPCId.number(nextRequestId)
        nextRequestId += 1

        let request = JSONRPCRequest(id: id, method: method, params: params)

        return try await withCheckedThrowingContinuation { continuation in
            pendingRequests[id] = continuation
            Task {
                do {
                    try await transport?.send(.request(request))
                } catch {
                    if let cont = pendingRequests.removeValue(forKey: id) {
                        cont.resume(throwing: error)
                    }
                }
            }
        }
    }
}

/// Bridge errors.
public enum BridgeError: Error {
    case disconnected
    case rpcError(JSONRPCError)
    case timeout
}
