import Foundation

/// Color theme preference for the host environment.
public enum McpUiTheme: String, Codable, Sendable {
    case light
    case dark
}

/// Display mode for UI presentation.
public enum McpUiDisplayMode: String, Codable, Sendable {
    /// Embedded within the conversation flow
    case inline
    /// Expanded to fill the available viewport
    case fullscreen
    /// Picture-in-picture floating window
    case pip
}

/// Platform type for responsive design decisions.
public enum McpUiPlatform: String, Codable, Sendable {
    case web
    case desktop
    case mobile
}

/// Device input capabilities.
public struct DeviceCapabilities: Codable, Sendable, Equatable {
    /// Whether the device supports touch input
    public var touch: Bool?
    /// Whether the device supports hover interactions
    public var hover: Bool?

    public init(touch: Bool? = nil, hover: Bool? = nil) {
        self.touch = touch
        self.hover = hover
    }
}

/// Viewport dimensions.
public struct Viewport: Codable, Sendable, Equatable {
    /// Current viewport width in pixels
    public var width: Int
    /// Current viewport height in pixels
    public var height: Int
    /// Maximum available height in pixels (if constrained)
    public var maxHeight: Int?
    /// Maximum available width in pixels (if constrained)
    public var maxWidth: Int?

    public init(width: Int, height: Int, maxHeight: Int? = nil, maxWidth: Int? = nil) {
        self.width = width
        self.height = height
        self.maxHeight = maxHeight
        self.maxWidth = maxWidth
    }
}

/// Safe area boundaries in pixels.
/// Used to avoid notches, rounded corners, and system UI.
public struct SafeAreaInsets: Codable, Sendable, Equatable {
    public var top: Int
    public var right: Int
    public var bottom: Int
    public var left: Int

    public init(top: Int, right: Int, bottom: Int, left: Int) {
        self.top = top
        self.right = right
        self.bottom = bottom
        self.left = left
    }
}

/// Rich context about the host environment provided to Guest UIs.
///
/// Hosts provide this context in the initialization response and send
/// updates via host-context-changed notifications when values change.
/// All fields are optional and Guest UIs should handle missing fields gracefully.
public struct McpUiHostContext: Codable, Sendable, Equatable {
    /// Current color theme preference
    public var theme: McpUiTheme?
    /// How the UI is currently displayed
    public var displayMode: McpUiDisplayMode?
    /// Display modes the host supports
    public var availableDisplayModes: [String]?
    /// Current and maximum dimensions available to the UI
    public var viewport: Viewport?
    /// User's language and region preference in BCP 47 format
    public var locale: String?
    /// User's timezone in IANA format
    public var timeZone: String?
    /// Host application identifier
    public var userAgent: String?
    /// Platform type for responsive design decisions
    public var platform: McpUiPlatform?
    /// Device input capabilities
    public var deviceCapabilities: DeviceCapabilities?
    /// Safe area boundaries in pixels
    public var safeAreaInsets: SafeAreaInsets?

    public init(
        theme: McpUiTheme? = nil,
        displayMode: McpUiDisplayMode? = nil,
        availableDisplayModes: [String]? = nil,
        viewport: Viewport? = nil,
        locale: String? = nil,
        timeZone: String? = nil,
        userAgent: String? = nil,
        platform: McpUiPlatform? = nil,
        deviceCapabilities: DeviceCapabilities? = nil,
        safeAreaInsets: SafeAreaInsets? = nil
    ) {
        self.theme = theme
        self.displayMode = displayMode
        self.availableDisplayModes = availableDisplayModes
        self.viewport = viewport
        self.locale = locale
        self.timeZone = timeZone
        self.userAgent = userAgent
        self.platform = platform
        self.deviceCapabilities = deviceCapabilities
        self.safeAreaInsets = safeAreaInsets
    }
}

/// Capabilities for server tools proxying.
public struct ServerToolsCapability: Codable, Sendable, Equatable {
    /// Host supports tools/list_changed notifications
    public var listChanged: Bool?

    public init(listChanged: Bool? = nil) {
        self.listChanged = listChanged
    }
}

/// Capabilities for server resources proxying.
public struct ServerResourcesCapability: Codable, Sendable, Equatable {
    /// Host supports resources/list_changed notifications
    public var listChanged: Bool?

    public init(listChanged: Bool? = nil) {
        self.listChanged = listChanged
    }
}

/// Capabilities supported by the host application.
///
/// Hosts declare these capabilities during the initialization handshake.
/// Guest UIs can check capabilities before attempting to use specific features.
public struct McpUiHostCapabilities: Codable, Sendable, Equatable {
    /// Host supports opening external URLs
    public var openLinks: Bool?
    /// Host can proxy tool calls to the MCP server
    public var serverTools: ServerToolsCapability?
    /// Host can proxy resource reads to the MCP server
    public var serverResources: ServerResourcesCapability?
    /// Host accepts log messages
    public var logging: Bool?

    public init(
        openLinks: Bool? = nil,
        serverTools: ServerToolsCapability? = nil,
        serverResources: ServerResourcesCapability? = nil,
        logging: Bool? = nil
    ) {
        self.openLinks = openLinks
        self.serverTools = serverTools
        self.serverResources = serverResources
        self.logging = logging
    }
}
