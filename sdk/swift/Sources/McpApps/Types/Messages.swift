import Foundation
import MCP

// MARK: - Implementation Info

/// Application/host identification.
public struct Implementation: Codable, Sendable, Equatable {
    public var name: String
    public var version: String

    public init(name: String, version: String) {
        self.name = name
        self.version = version
    }
}

// MARK: - Initialization Messages

/// Parameters for the ui/initialize request from Guest UI to Host.
public struct McpUiInitializeParams: Codable, Sendable {
    /// App identification (name and version)
    public var appInfo: Implementation
    /// Features and capabilities this app provides
    public var appCapabilities: McpUiAppCapabilities
    /// Protocol version this app supports
    public var protocolVersion: String

    public init(
        appInfo: Implementation,
        appCapabilities: McpUiAppCapabilities,
        protocolVersion: String
    ) {
        self.appInfo = appInfo
        self.appCapabilities = appCapabilities
        self.protocolVersion = protocolVersion
    }
}

/// Result from the ui/initialize request.
public struct McpUiInitializeResult: Codable, Sendable {
    /// Negotiated protocol version string
    public var protocolVersion: String
    /// Host application identification and version
    public var hostInfo: Implementation
    /// Features and capabilities provided by the host
    public var hostCapabilities: McpUiHostCapabilities
    /// Rich context about the host environment
    public var hostContext: McpUiHostContext

    public init(
        protocolVersion: String,
        hostInfo: Implementation,
        hostCapabilities: McpUiHostCapabilities,
        hostContext: McpUiHostContext
    ) {
        self.protocolVersion = protocolVersion
        self.hostInfo = hostInfo
        self.hostCapabilities = hostCapabilities
        self.hostContext = hostContext
    }
}

// MARK: - Tool Notifications (Host → Guest)

/// Parameters for ui/notifications/tool-input notification.
/// Contains complete tool arguments sent to the Guest UI.
public struct McpUiToolInputParams: Codable, Sendable {
    /// Complete tool call arguments as key-value pairs
    public var arguments: [String: AnyCodable]?

    public init(arguments: [String: AnyCodable]? = nil) {
        self.arguments = arguments
    }
}

/// Parameters for ui/notifications/tool-input-partial notification.
/// Contains partial/streaming tool arguments during tool call initialization.
public struct McpUiToolInputPartialParams: Codable, Sendable {
    /// Partial tool call arguments (incomplete, may change)
    public var arguments: [String: AnyCodable]?

    public init(arguments: [String: AnyCodable]? = nil) {
        self.arguments = arguments
    }
}

// MARK: - Size Notification (Bidirectional)

/// Parameters for ui/notifications/size-changed notification.
public struct McpUiSizeChangedParams: Codable, Sendable {
    /// New width in pixels
    public var width: Int?
    /// New height in pixels
    public var height: Int?

    public init(width: Int? = nil, height: Int? = nil) {
        self.width = width
        self.height = height
    }
}

// MARK: - Message Request (Guest → Host)

/// Content block types for messages.
public enum ContentBlockType: String, Codable, Sendable {
    case text
    case image
}

/// Text content block.
public struct TextContent: Codable, Sendable {
    public var type: String = "text"
    public var text: String

    public init(text: String) {
        self.text = text
    }
}

/// Parameters for ui/message request.
public struct McpUiMessageParams: Codable, Sendable {
    /// Message role, currently only "user" is supported
    public var role: String
    /// Message content blocks (text, image, etc.)
    public var content: [TextContent]

    public init(role: String = "user", content: [TextContent]) {
        self.role = role
        self.content = content
    }
}

/// Result from ui/message request.
public struct McpUiMessageResult: Codable, Sendable {
    /// True if the host rejected or failed to deliver the message.
    /// False or nil indicates the message was accepted.
    public var isError: Bool?

    public init(isError: Bool? = nil) {
        self.isError = isError
    }
}

// MARK: - Open Link Request (Guest → Host)

/// Parameters for ui/open-link request.
public struct McpUiOpenLinkParams: Codable, Sendable {
    /// URL to open in the host's browser
    public var url: String

    public init(url: String) {
        self.url = url
    }
}

/// Result from ui/open-link request.
public struct McpUiOpenLinkResult: Codable, Sendable {
    /// True if the host failed to open the URL.
    /// False or nil indicates success.
    public var isError: Bool?

    public init(isError: Bool? = nil) {
        self.isError = isError
    }
}

// MARK: - Resource Teardown Request (Host → Guest)

/// Parameters for ui/resource-teardown request.
public struct McpUiResourceTeardownParams: Codable, Sendable {
    public init() {}
}

/// Result from ui/resource-teardown request.
/// Empty result indicates the Guest UI is ready to be torn down.
public struct McpUiResourceTeardownResult: Codable, Sendable {
    public init() {}
}

// MARK: - Sandbox Messages (Internal, for web hosts)

/// Parameters for ui/notifications/sandbox-proxy-ready notification.
public struct McpUiSandboxProxyReadyParams: Codable, Sendable {
    public init() {}
}

/// CSP configuration.
public struct CspConfig: Codable, Sendable {
    /// Origins for network requests (fetch/XHR/WebSocket)
    public var connectDomains: [String]?
    /// Origins for static resources (scripts, images, styles, fonts)
    public var resourceDomains: [String]?

    public init(connectDomains: [String]? = nil, resourceDomains: [String]? = nil) {
        self.connectDomains = connectDomains
        self.resourceDomains = resourceDomains
    }
}

/// Parameters for ui/notifications/sandbox-resource-ready notification.
public struct McpUiSandboxResourceReadyParams: Codable, Sendable {
    /// HTML content to load into the inner iframe
    public var html: String
    /// Optional override for the inner iframe's sandbox attribute
    public var sandbox: String?
    /// CSP configuration from resource metadata
    public var csp: CspConfig?

    public init(html: String, sandbox: String? = nil, csp: CspConfig? = nil) {
        self.html = html
        self.sandbox = sandbox
        self.csp = csp
    }
}

// MARK: - Logging Notification (Guest → Host)

/// Log level for logging messages.
public enum LogLevel: String, Codable, Sendable {
    case debug
    case info
    case notice
    case warning
    case error
    case critical
    case alert
    case emergency
}

/// Parameters for notifications/message (logging) notification.
public struct LoggingMessageParams: Codable, Sendable {
    /// Log level
    public var level: LogLevel
    /// Log message
    public var data: AnyCodable
    /// Optional logger name/identifier
    public var logger: String?

    public init(level: LogLevel, data: AnyCodable, logger: String? = nil) {
        self.level = level
        self.data = data
        self.logger = logger
    }
}

// MARK: - UI Resource Metadata

/// Content Security Policy configuration for UI resources.
public struct McpUiResourceCsp: Codable, Sendable {
    /// Origins for network requests (fetch/XHR/WebSocket). Maps to CSP connect-src
    public var connectDomains: [String]?
    /// Origins for static resources. Maps to CSP img-src, script-src, style-src, font-src
    public var resourceDomains: [String]?

    public init(connectDomains: [String]? = nil, resourceDomains: [String]? = nil) {
        self.connectDomains = connectDomains
        self.resourceDomains = resourceDomains
    }
}

/// UI Resource metadata for security and rendering configuration.
public struct McpUiResourceMeta: Codable, Sendable {
    /// Content Security Policy configuration
    public var csp: McpUiResourceCsp?
    /// Dedicated origin for widget sandbox
    public var domain: String?
    /// Visual boundary preference - true if UI prefers a visible border
    public var prefersBorder: Bool?

    public init(csp: McpUiResourceCsp? = nil, domain: String? = nil, prefersBorder: Bool? = nil) {
        self.csp = csp
        self.domain = domain
        self.prefersBorder = prefersBorder
    }
}

// MARK: - AnyCodable Helper

/// Type-erased Codable wrapper for heterogeneous JSON values.
/// Uses @unchecked Sendable because we only store JSON-compatible values
/// (String, Int, Double, Bool, Array, Dictionary, NSNull) which are all safe.
public struct AnyCodable: Codable, Equatable, @unchecked Sendable {
    public let value: Any

    public init(_ value: Any) {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self.value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            self.value = bool
        } else if let int = try? container.decode(Int.self) {
            self.value = int
        } else if let double = try? container.decode(Double.self) {
            self.value = double
        } else if let string = try? container.decode(String.self) {
            self.value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            self.value = array.map { $0.value }
        } else if let dictionary = try? container.decode([String: AnyCodable].self) {
            self.value = dictionary.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "AnyCodable value cannot be decoded"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dictionary as [String: Any]:
            try container.encode(dictionary.mapValues { AnyCodable($0) })
        default:
            let context = EncodingError.Context(
                codingPath: container.codingPath,
                debugDescription: "AnyCodable value cannot be encoded"
            )
            throw EncodingError.invalidValue(value, context)
        }
    }

    public static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        switch (lhs.value, rhs.value) {
        case is (NSNull, NSNull):
            return true
        case let (lhs as Bool, rhs as Bool):
            return lhs == rhs
        case let (lhs as Int, rhs as Int):
            return lhs == rhs
        case let (lhs as Double, rhs as Double):
            return lhs == rhs
        case let (lhs as String, rhs as String):
            return lhs == rhs
        default:
            return false
        }
    }
}
