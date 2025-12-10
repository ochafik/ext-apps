package io.modelcontextprotocol.apps.types

import kotlinx.serialization.Serializable

/**
 * Capabilities provided by the Guest UI (App).
 *
 * Apps declare these capabilities during the initialization handshake to indicate
 * what features they provide to the host.
 */
@Serializable
data class McpUiAppCapabilities(
    /** Experimental features (structure TBD) */
    val experimental: Map<String, kotlinx.serialization.json.JsonElement>? = null,
    /**
     * App exposes MCP-style tools that the host can call.
     * These are app-specific tools, not proxied from the server.
     */
    val tools: AppToolsCapability? = null
)

@Serializable
data class AppToolsCapability(
    /** App supports tools/list_changed notifications */
    val listChanged: Boolean? = null
)
