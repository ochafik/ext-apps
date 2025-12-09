package io.modelcontextprotocol.apps.transport

import android.net.Uri
import android.os.Build
import android.webkit.WebView
import androidx.annotation.RequiresApi
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import io.modelcontextprotocol.apps.protocol.JSONRPCMessage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Transport implementation for Android WebView using postMessage API.
 *
 * This transport enables bidirectional communication between a Kotlin/Android host
 * and a JavaScript guest UI running in a WebView. It implements the McpAppsTransport
 * interface for MCP Apps communication using the modern postMessage API.
 *
 * ## Architecture
 *
 * The transport works by:
 * 1. Creating a WebMessageChannel with two ports (native and JS)
 * 2. Using the native port to receive messages from JavaScript
 * 3. Sending the JS port to the WebView via postWebMessage
 * 4. Injecting a bridge script that:
 *    - Receives the MessagePort from the 'message' event
 *    - Overrides `window.parent.postMessage()` to use the port for TypeScript SDK compatibility
 * 5. Using `WebViewCompat.postWebMessage()` to send messages (dispatches native MessageEvent)
 *
 * ## Requirements
 *
 * - Android 6.0 (API 23) or higher
 * - androidx.webkit:webkit library
 *
 * ## Usage
 *
 * ```kotlin
 * val webView = findViewById<WebView>(R.id.webView)
 * val transport = WebViewTransport(webView)
 *
 * // Connect to AppBridge
 * val bridge = AppBridge(mcpClient, hostInfo, hostCapabilities)
 * bridge.connect(transport)
 *
 * // Load your guest UI
 * webView.loadUrl("file:///android_asset/guest-ui.html")
 * ```
 *
 * ## JavaScript Side
 *
 * The guest UI uses standard postMessage API:
 * - `window.parent.postMessage(message, '*')` to send messages (TypeScript SDK compatibility)
 * - `window.addEventListener('message', (event) => { ... })` to receive messages
 *
 * @param webView The Android WebView instance to communicate with
 * @param json Optional JSON serializer (defaults to kotlinx.serialization.json.Json)
 */
@RequiresApi(Build.VERSION_CODES.M)
class WebViewTransport(
    private val webView: WebView,
    private val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    }
) : McpAppsTransport {

    private val _incoming = MutableSharedFlow<JSONRPCMessage>(replay = 0, extraBufferCapacity = 64)
    private val _errors = MutableSharedFlow<Throwable>(replay = 0, extraBufferCapacity = 64)

    override val incoming: Flow<JSONRPCMessage> = _incoming
    override val errors: Flow<Throwable> = _errors

    private var isStarted = false
    private var nativePort: androidx.webkit.WebMessagePortCompat? = null

    /**
     * Start the transport and set up the WebMessageChannel.
     *
     * This method:
     * 1. Configures the WebView to enable JavaScript
     * 2. Creates a WebMessageChannel with two ports
     * 3. Sets up message callback on the native port
     * 4. Sends the JS port to the WebView
     * 5. Injects the bridge script for TypeScript SDK compatibility
     */
    override suspend fun start() {
        if (isStarted) return

        // Check for required WebView features
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)) {
            throw UnsupportedOperationException("WebView POST_WEB_MESSAGE feature is not supported on this device")
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL)) {
            throw UnsupportedOperationException("WebView CREATE_WEB_MESSAGE_CHANNEL feature is not supported on this device")
        }

        isStarted = true

        // Configure WebView on the main thread
        webView.post {
            // Enable JavaScript
            webView.settings.javaScriptEnabled = true

            // Create WebMessageChannel
            val channel = WebViewCompat.createWebMessageChannel(webView)
            nativePort = channel[0]
            val jsPort = channel[1]

            // Set up callback for messages from JS
            nativePort?.setWebMessageCallback(object : androidx.webkit.WebMessagePortCompat.WebMessageCallbackCompat() {
                override fun onMessage(port: androidx.webkit.WebMessagePortCompat, message: WebMessageCompat?) {
                    message?.data?.let { messageData ->
                        try {
                            val jsonRpcMessage = json.decodeFromString<JSONRPCMessage>(messageData)
                            val result = _incoming.tryEmit(jsonRpcMessage)
                            if (!result) {
                                _errors.tryEmit(IllegalStateException("Failed to emit message: buffer full"))
                            }
                        } catch (e: Exception) {
                            _errors.tryEmit(Exception("Failed to parse message from JavaScript: ${e.message}", e))
                        }
                    }
                }
            })

            // Inject the bridge script first
            webView.evaluateJavascript(BRIDGE_SCRIPT, null)

            // Send the JS port to the WebView
            // The message payload is "mcp-channel-init" which the bridge script listens for
            val initMessage = WebMessageCompat("mcp-channel-init", arrayOf(jsPort))
            WebViewCompat.postWebMessage(webView, initMessage, Uri.EMPTY)
        }
    }

    /**
     * Send a JSON-RPC message to the JavaScript guest UI.
     *
     * The message is serialized to JSON and sent using WebViewCompat.postWebMessage,
     * which natively dispatches a MessageEvent on the window object in the WebView.
     *
     * @param message The JSON-RPC message to send
     */
    override suspend fun send(message: JSONRPCMessage) {
        if (!isStarted) {
            throw IllegalStateException("Transport not started. Call start() first.")
        }

        val messageJson = json.encodeToString(message)
        val webMessage = WebMessageCompat(messageJson)

        webView.post {
            WebViewCompat.postWebMessage(webView, webMessage, Uri.EMPTY)
        }
    }

    /**
     * Close the transport and cleanup resources.
     *
     * Closes the native message port and marks the transport as stopped.
     */
    override suspend fun close() {
        if (!isStarted) return

        webView.post {
            nativePort?.close()
            nativePort = null
        }

        isStarted = false
    }

    companion object {
        /**
         * JavaScript bridge script injected into the WebView.
         *
         * This script:
         * 1. Listens for the MessagePort from the native side
         * 2. Stores the port for sending messages to native
         * 3. Overrides window.parent.postMessage() for TypeScript SDK compatibility
         * 4. Messages from native arrive as native MessageEvents (no handling needed here)
         */
        private const val BRIDGE_SCRIPT = """
(function() {
    'use strict';

    // Prevent re-initialization
    if (window.mcpBridge && window.mcpBridge._initialized) {
        return;
    }

    // Create the MCP bridge object
    window.mcpBridge = {
        _initialized: true,
        _port: null,

        /**
         * Send a message to the Android host via the MessagePort.
         * @param {object} message - JSON-RPC message object
         */
        send: function(message) {
            if (!this._port) {
                console.error('MCP MessagePort not initialized yet');
                return;
            }
            try {
                const messageJson = JSON.stringify(message);
                this._port.postMessage(messageJson);
            } catch (e) {
                console.error('Failed to send message:', e);
            }
        }
    };

    // Listen for the MessagePort from native
    window.addEventListener('message', function(event) {
        // Check if this is the channel initialization message
        if (event.data === 'mcp-channel-init' && event.ports && event.ports[0]) {
            window.mcpBridge._port = event.ports[0];

            // Override window.parent.postMessage for TypeScript SDK compatibility
            // The TypeScript SDK uses postMessage, so we redirect it to our port
            const originalPostMessage = window.parent.postMessage;
            window.parent.postMessage = function(message, targetOrigin) {
                // If this is a JSON-RPC message (has jsonrpc field), use our bridge
                if (message && typeof message === 'object' && message.jsonrpc) {
                    window.mcpBridge.send(message);
                } else {
                    // Otherwise, fall back to original postMessage
                    originalPostMessage.call(window.parent, message, targetOrigin);
                }
            };

            console.log('MCP WebView bridge initialized with MessagePort');
        }
    });
})();
"""
    }
}
