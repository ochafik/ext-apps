package io.modelcontextprotocol.apps.types

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Color theme preference for the host environment.
 */
@Serializable
enum class McpUiTheme {
    @SerialName("light") LIGHT,
    @SerialName("dark") DARK
}

/**
 * Display mode for UI presentation.
 */
@Serializable
enum class McpUiDisplayMode {
    /** Embedded within the conversation flow */
    @SerialName("inline") INLINE,
    /** Expanded to fill the available viewport */
    @SerialName("fullscreen") FULLSCREEN,
    /** Picture-in-picture floating window */
    @SerialName("pip") PIP
}

/**
 * Platform type for responsive design decisions.
 */
@Serializable
enum class McpUiPlatform {
    @SerialName("web") WEB,
    @SerialName("desktop") DESKTOP,
    @SerialName("mobile") MOBILE
}

/**
 * Device input capabilities.
 */
@Serializable
data class DeviceCapabilities(
    /** Whether the device supports touch input */
    val touch: Boolean? = null,
    /** Whether the device supports hover interactions */
    val hover: Boolean? = null
)

/**
 * Viewport dimensions.
 */
@Serializable
data class Viewport(
    /** Current viewport width in pixels */
    val width: Int,
    /** Current viewport height in pixels */
    val height: Int,
    /** Maximum available height in pixels (if constrained) */
    val maxHeight: Int? = null,
    /** Maximum available width in pixels (if constrained) */
    val maxWidth: Int? = null
)

/**
 * Safe area boundaries in pixels.
 * Used to avoid notches, rounded corners, and system UI.
 */
@Serializable
data class SafeAreaInsets(
    val top: Int,
    val right: Int,
    val bottom: Int,
    val left: Int
)

/**
 * Tool information for the current tool call.
 */
@Serializable
data class ToolInfo(
    /** JSON-RPC id of the tools/call request */
    val id: kotlinx.serialization.json.JsonElement? = null,
    /** Tool definition */
    val tool: io.modelcontextprotocol.kotlin.sdk.Tool
)

/**
 * Rich context about the host environment provided to Guest UIs.
 *
 * Hosts provide this context in the initialization response and send
 * updates via host-context-changed notifications when values change.
 * All fields are optional and Guest UIs should handle missing fields gracefully.
 */
@Serializable
data class McpUiHostContext(
    /** Metadata of the tool call that instantiated this App */
    val toolInfo: ToolInfo? = null,
    /** Current color theme preference */
    val theme: McpUiTheme? = null,
    /** How the UI is currently displayed */
    val displayMode: McpUiDisplayMode? = null,
    /** Display modes the host supports */
    val availableDisplayModes: List<String>? = null,
    /** Current and maximum dimensions available to the UI */
    val viewport: Viewport? = null,
    /** User's language and region preference in BCP 47 format */
    val locale: String? = null,
    /** User's timezone in IANA format */
    val timeZone: String? = null,
    /** Host application identifier */
    val userAgent: String? = null,
    /** Platform type for responsive design decisions */
    val platform: McpUiPlatform? = null,
    /** Device input capabilities */
    val deviceCapabilities: DeviceCapabilities? = null,
    /** Safe area boundaries in pixels */
    val safeAreaInsets: SafeAreaInsets? = null
)

/**
 * Capabilities supported by the host application.
 *
 * Hosts declare these capabilities during the initialization handshake.
 * Guest UIs can check capabilities before attempting to use specific features.
 */
@Serializable
data class McpUiHostCapabilities(
    /** Experimental features (structure TBD) */
    val experimental: Map<String, kotlinx.serialization.json.JsonElement>? = null,
    /** Host supports opening external URLs */
    val openLinks: Map<String, kotlinx.serialization.json.JsonElement>? = null,
    /** Host can proxy tool calls to the MCP server */
    val serverTools: ServerToolsCapability? = null,
    /** Host can proxy resource reads to the MCP server */
    val serverResources: ServerResourcesCapability? = null,
    /** Host accepts log messages */
    val logging: Map<String, kotlinx.serialization.json.JsonElement>? = null
)

@Serializable
data class ServerToolsCapability(
    /** Host supports tools/list_changed notifications */
    val listChanged: Boolean? = null
)

@Serializable
data class ServerResourcesCapability(
    /** Host supports resources/list_changed notifications */
    val listChanged: Boolean? = null
)
