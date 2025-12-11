package io.modelcontextprotocol.apps

import io.modelcontextprotocol.apps.protocol.*
import io.modelcontextprotocol.apps.transport.McpAppsTransport

import io.modelcontextprotocol.apps.generated.*
import kotlinx.serialization.json.*
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

/**
 * Options for configuring AppBridge behavior.
 */
data class HostOptions(
    val hostContext: McpUiHostContext = McpUiHostContext()
)

/**
 * Host-side bridge for communicating with a single Guest UI (App).
 *
 * @param hostInfo Host application identification
 * @param hostCapabilities Features the host supports
 * @param options Configuration options
 */
class AppBridge(
    private val hostInfo: Implementation,
    private val hostCapabilities: McpUiHostCapabilities,
    private val options: HostOptions = HostOptions()
) : Protocol() {

    private var appCapabilities: McpUiAppCapabilities? = null
    private var appInfo: Implementation? = null
    private var hostContext: McpUiHostContext = options.hostContext
    private var isInitialized: Boolean = false

    // Notification handlers (App → Host)
    /** Called when Guest UI completes initialization. */
    var onInitialized: (() -> Unit)? = null

    /** Called when Guest UI reports a size change. */
    var onSizeChange: ((McpUiSizeChangedParams) -> Unit)? = null

    /** Called when Guest UI sends a logging message. */
    var onLoggingMessage: ((LoggingMessageParams) -> Unit)? = null

    /** Called when Guest UI sends a ping request. */
    var onPing: (() -> Unit)? = null

    // Request handlers (App → Host, must return result)
    /** Called when Guest UI wants to add a message to the conversation. */
    var onMessage: (suspend (McpUiMessageParams) -> McpUiMessageResult)? = null

    /** Called when Guest UI wants to open an external link. */
    var onOpenLink: (suspend (McpUiOpenLinkParams) -> McpUiOpenLinkResult)? = null

    // MCP Server forwarding callbacks (App → Server via Host)
    /** Called when Guest UI wants to call a server tool. */
    var onToolCall: (suspend (name: String, arguments: JsonObject?) -> JsonElement)? = null

    /** Called when Guest UI wants to read a server resource. */
    var onResourceRead: (suspend (uri: String) -> JsonElement)? = null

    init {
        setupHandlers()
    }

    private fun setupHandlers() {
        // Handle ui/initialize request
        setRequestHandler(
            method = "ui/initialize",
            paramsDeserializer = { params ->
                json.decodeFromJsonElement<McpUiInitializeParams>(params ?: JsonObject(emptyMap()))
            },
            resultSerializer = { result: McpUiInitializeResult ->
                json.encodeToJsonElement(result)
            }
        ) { params ->
            handleInitialize(params)
        }

        // Handle ui/notifications/initialized notification
        setNotificationHandler(
            method = "ui/notifications/initialized",
            paramsDeserializer = { Unit }
        ) {
            isInitialized = true
            onInitialized?.invoke()
        }

        // Handle ui/notifications/size-changed notification
        setNotificationHandler(
            method = "ui/notifications/size-changed",
            paramsDeserializer = { params ->
                json.decodeFromJsonElement<McpUiSizeChangedParams>(params ?: JsonObject(emptyMap()))
            }
        ) { params ->
            onSizeChange?.invoke(params)
        }

        // Handle ui/message request
        setRequestHandler(
            method = "ui/message",
            paramsDeserializer = { params ->
                json.decodeFromJsonElement<McpUiMessageParams>(params ?: JsonObject(emptyMap()))
            },
            resultSerializer = { result: McpUiMessageResult ->
                json.encodeToJsonElement(result)
            }
        ) { params ->
            onMessage?.invoke(params) ?: McpUiMessageResult(isError = true)
        }

        // Handle ui/open-link request
        setRequestHandler(
            method = "ui/open-link",
            paramsDeserializer = { params ->
                json.decodeFromJsonElement<McpUiOpenLinkParams>(params ?: JsonObject(emptyMap()))
            },
            resultSerializer = { result: McpUiOpenLinkResult ->
                json.encodeToJsonElement(result)
            }
        ) { params ->
            onOpenLink?.invoke(params) ?: McpUiOpenLinkResult(isError = true)
        }

        // Handle notifications/message (logging)
        setNotificationHandler(
            method = "notifications/message",
            paramsDeserializer = { params ->
                json.decodeFromJsonElement<LoggingMessageParams>(params ?: JsonObject(emptyMap()))
            }
        ) { params ->
            onLoggingMessage?.invoke(params)
        }

        // Handle ping request
        setRequestHandler(
            method = "ping",
            paramsDeserializer = { Unit },
            resultSerializer = { JsonObject(emptyMap()) }
        ) {
            onPing?.invoke()
        }

        // Handle tools/call - forward to callback
        setRequestHandler(
            method = "tools/call",
            paramsDeserializer = { it },
            resultSerializer = { it ?: JsonObject(emptyMap()) }
        ) { params ->
            val callback = onToolCall ?: throw IllegalStateException("tools/call not configured")
            val name = (params?.get("name") as? JsonPrimitive)?.content
                ?: throw IllegalArgumentException("Missing tool name")
            val arguments = params?.get("arguments") as? JsonObject
            callback(name, arguments)
        }

        // Handle resources/read - forward to callback
        setRequestHandler(
            method = "resources/read",
            paramsDeserializer = { it },
            resultSerializer = { it ?: JsonObject(emptyMap()) }
        ) { params ->
            val callback = onResourceRead ?: throw IllegalStateException("resources/read not configured")
            val uri = (params?.get("uri") as? JsonPrimitive)?.content
                ?: throw IllegalArgumentException("Missing resource URI")
            callback(uri)
        }
    }

    private fun handleInitialize(params: McpUiInitializeParams): McpUiInitializeResult {
        appCapabilities = params.appCapabilities
        appInfo = params.appInfo

        val requestedVersion = params.protocolVersion
        val protocolVersion = if (McpAppsConfig.SUPPORTED_PROTOCOL_VERSIONS.contains(requestedVersion)) {
            requestedVersion
        } else {
            McpAppsConfig.LATEST_PROTOCOL_VERSION
        }

        return McpUiInitializeResult(
            protocolVersion = protocolVersion,
            hostInfo = hostInfo,
            hostCapabilities = hostCapabilities,
            hostContext = hostContext
        )
    }

    fun getAppCapabilities(): McpUiAppCapabilities? = appCapabilities
    fun getAppVersion(): Implementation? = appInfo
    fun isReady(): Boolean = isInitialized

    suspend fun setHostContext(newContext: McpUiHostContext) {
        if (newContext != hostContext) {
            hostContext = newContext
            notification(
                method = "ui/notifications/host-context-changed",
                params = newContext,
                paramsSerializer = { json.encodeToJsonElement(it) as JsonObject }
            )
        }
    }

    /**
     * Send complete tool arguments to the Guest UI.
     * Must be called after initialization completes.
     */
    suspend fun sendToolInput(params: McpUiToolInputParams) {
        notification(
            method = "ui/notifications/tool-input",
            params = params,
            paramsSerializer = { json.encodeToJsonElement(it) as JsonObject }
        )
    }

    /**
     * Send streaming partial tool arguments to the Guest UI.
     * May be called zero or more times before sendToolInput.
     */
    suspend fun sendToolInputPartial(params: McpUiToolInputPartialParams) {
        notification(
            method = "ui/notifications/tool-input-partial",
            params = params,
            paramsSerializer = { json.encodeToJsonElement(it) as JsonObject }
        )
    }

    /**
     * Send tool execution result to the Guest UI.
     * Must be called after sendToolInput.
     */
    suspend fun sendToolResult(params: McpUiToolResultParams) {
        notification(
            method = "ui/notifications/tool-result",
            params = params,
            paramsSerializer = { json.encodeToJsonElement(it) as JsonObject }
        )
    }

    /**
     * Notify the Guest UI that tool execution was cancelled.
     */
    suspend fun sendToolCancelled(params: McpUiToolCancelledParams = McpUiToolCancelledParams()) {
        notification(
            method = "ui/notifications/tool-cancelled",
            params = params,
            paramsSerializer = { json.encodeToJsonElement(it) as JsonObject }
        )
    }

    suspend fun sendSandboxResourceReady(html: String, sandbox: String? = null, csp: CspConfig? = null) {
        notification(
            method = "ui/notifications/sandbox-resource-ready",
            params = McpUiSandboxResourceReadyParams(html = html, sandbox = sandbox, csp = csp),
            paramsSerializer = { json.encodeToJsonElement(it) as JsonObject }
        )
    }

    /**
     * Request the App to perform cleanup before the resource is torn down.
     *
     * @param timeout Maximum time to wait for the App to respond (default 500ms)
     */
    suspend fun sendResourceTeardown(timeout: Duration = 500.milliseconds): McpUiResourceTeardownResult {
        return request(
            method = "ui/resource-teardown",
            params = McpUiResourceTeardownParams(),
            paramsSerializer = { JsonObject(emptyMap()) },
            resultDeserializer = { McpUiResourceTeardownResult() },
            timeout = timeout
        )
    }
}
