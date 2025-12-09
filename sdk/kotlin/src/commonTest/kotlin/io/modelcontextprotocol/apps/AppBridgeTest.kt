package io.modelcontextprotocol.apps

import io.modelcontextprotocol.apps.protocol.*
import io.modelcontextprotocol.apps.transport.InMemoryTransport
import io.modelcontextprotocol.apps.types.*
import io.modelcontextprotocol.kotlin.sdk.CallToolResult
import io.modelcontextprotocol.kotlin.sdk.Client
import io.modelcontextprotocol.kotlin.sdk.Implementation
import io.modelcontextprotocol.kotlin.sdk.TextContent
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import kotlin.test.*

/**
 * Tests for AppBridge <-> Guest UI communication.
 */
class AppBridgeTest {

    private val testHostInfo = Implementation(name = "TestHost", version = "1.0.0")
    private val testAppInfo = Implementation(name = "TestApp", version = "1.0.0")
    private val testHostCapabilities = McpUiHostCapabilities(
        openLinks = emptyMap(),
        serverTools = ServerToolsCapability(),
        logging = emptyMap()
    )

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    }

    /**
     * Helper to simulate a Guest UI on the other end of the transport.
     */
    private class MockGuestUI(
        private val transport: InMemoryTransport,
        private val json: Json
    ) {
        private var nextId = 1L
        val receivedNotifications = mutableListOf<JSONRPCNotification>()

        suspend fun start() {
            transport.start()
            kotlinx.coroutines.coroutineScope {
                kotlinx.coroutines.launch {
                    transport.incoming.collect { message ->
                        when (message) {
                            is JSONRPCNotification -> receivedNotifications.add(message)
                            else -> {}
                        }
                    }
                }
            }
        }

        suspend fun sendInitialize(
            appInfo: Implementation = Implementation("TestApp", "1.0.0"),
            appCapabilities: McpUiAppCapabilities = McpUiAppCapabilities()
        ): McpUiInitializeResult {
            val id = JsonPrimitive(nextId++)
            val request = JSONRPCRequest(
                id = id,
                method = "ui/initialize",
                params = json.encodeToJsonElement(
                    McpUiInitializeParams(
                        appInfo = appInfo,
                        appCapabilities = appCapabilities,
                        protocolVersion = McpAppsConfig.LATEST_PROTOCOL_VERSION
                    )
                ).jsonObject
            )
            transport.send(request)

            // Wait for response (simplified - in real test would use proper await)
            delay(50)

            return McpUiInitializeResult(
                protocolVersion = McpAppsConfig.LATEST_PROTOCOL_VERSION,
                hostInfo = Implementation("TestHost", "1.0.0"),
                hostCapabilities = McpUiHostCapabilities(),
                hostContext = McpUiHostContext()
            )
        }

        suspend fun sendInitialized() {
            val notification = JSONRPCNotification(
                method = "ui/notifications/initialized",
                params = JsonObject(emptyMap())
            )
            transport.send(notification)
        }

        suspend fun sendSizeChanged(width: Int?, height: Int?) {
            val params = buildJsonObject {
                width?.let { put("width", it) }
                height?.let { put("height", it) }
            }
            val notification = JSONRPCNotification(
                method = "ui/notifications/size-changed",
                params = params
            )
            transport.send(notification)
        }
    }

    @Test
    fun testInitializationHandshake() = runTest {
        // Create linked transports
        val (bridgeTransport, guestTransport) = InMemoryTransport.createLinkedPair()

        // Create mock MCP client (simplified - in real test would mock properly)
        // For now, we'll skip MCP client integration in tests

        // This test verifies the type structures compile and basic flow works
        val bridge = AppBridge(
            mcpClient = object : Client {
                // Mock implementation - in real test would use proper mock
            } as Client,
            hostInfo = testHostInfo,
            hostCapabilities = testHostCapabilities
        )

        var initialized = false
        bridge.onInitialized = { initialized = true }

        // Start bridge
        bridge.connect(bridgeTransport)

        // Simulate guest sending initialize
        val initRequest = JSONRPCRequest(
            id = JsonPrimitive(1),
            method = "ui/initialize",
            params = json.encodeToJsonElement(
                McpUiInitializeParams(
                    appInfo = testAppInfo,
                    appCapabilities = McpUiAppCapabilities(),
                    protocolVersion = McpAppsConfig.LATEST_PROTOCOL_VERSION
                )
            ).jsonObject
        )

        guestTransport.start()
        guestTransport.send(initRequest)

        delay(50) // Allow processing

        // Simulate guest sending initialized notification
        val initializedNotification = JSONRPCNotification(
            method = "ui/notifications/initialized"
        )
        guestTransport.send(initializedNotification)

        delay(50)

        assertTrue(initialized, "onInitialized callback should have been called")
        assertNotNull(bridge.getAppCapabilities())
        assertEquals(testAppInfo, bridge.getAppVersion())

        bridge.close()
    }

    @Test
    fun testSendToolInput() = runTest {
        val (bridgeTransport, guestTransport) = InMemoryTransport.createLinkedPair()

        val bridge = AppBridge(
            mcpClient = object : Client {} as Client,
            hostInfo = testHostInfo,
            hostCapabilities = testHostCapabilities
        )

        bridge.connect(bridgeTransport)
        guestTransport.start()

        // Collect notifications on guest side
        val receivedNotifications = mutableListOf<JSONRPCMessage>()
        kotlinx.coroutines.launch {
            guestTransport.incoming.collect { receivedNotifications.add(it) }
        }

        // Send tool input
        val arguments = mapOf(
            "location" to JsonPrimitive("NYC"),
            "units" to JsonPrimitive("metric")
        )
        bridge.sendToolInput(arguments)

        delay(50)

        assertTrue(receivedNotifications.isNotEmpty())
        val notification = receivedNotifications.first() as JSONRPCNotification
        assertEquals("ui/notifications/tool-input", notification.method)

        bridge.close()
    }

    @Test
    fun testSizeChangeNotification() = runTest {
        val (bridgeTransport, guestTransport) = InMemoryTransport.createLinkedPair()

        val bridge = AppBridge(
            mcpClient = object : Client {} as Client,
            hostInfo = testHostInfo,
            hostCapabilities = testHostCapabilities
        )

        var receivedWidth: Int? = null
        var receivedHeight: Int? = null

        bridge.onSizeChange = { width, height ->
            receivedWidth = width
            receivedHeight = height
        }

        bridge.connect(bridgeTransport)
        guestTransport.start()

        // Simulate guest sending size change
        val notification = JSONRPCNotification(
            method = "ui/notifications/size-changed",
            params = buildJsonObject {
                put("width", 400)
                put("height", 600)
            }
        )
        guestTransport.send(notification)

        delay(50)

        assertEquals(400, receivedWidth)
        assertEquals(600, receivedHeight)

        bridge.close()
    }

    @Test
    fun testMessageTypes() {
        // Test that all message types serialize correctly
        val initParams = McpUiInitializeParams(
            appInfo = Implementation("TestApp", "1.0.0"),
            appCapabilities = McpUiAppCapabilities(
                tools = AppToolsCapability(listChanged = true)
            ),
            protocolVersion = "2025-11-21"
        )

        val encoded = json.encodeToString(initParams)
        val decoded = json.decodeFromString<McpUiInitializeParams>(encoded)

        assertEquals(initParams.appInfo, decoded.appInfo)
        assertEquals(initParams.protocolVersion, decoded.protocolVersion)
    }

    @Test
    fun testHostContext() {
        val context = McpUiHostContext(
            theme = McpUiTheme.DARK,
            displayMode = McpUiDisplayMode.INLINE,
            viewport = Viewport(width = 800, height = 600, maxHeight = 1000),
            locale = "en-US",
            timeZone = "America/New_York",
            platform = McpUiPlatform.MOBILE,
            deviceCapabilities = DeviceCapabilities(touch = true, hover = false),
            safeAreaInsets = SafeAreaInsets(top = 44, right = 0, bottom = 34, left = 0)
        )

        val encoded = json.encodeToString(context)
        val decoded = json.decodeFromString<McpUiHostContext>(encoded)

        assertEquals(McpUiTheme.DARK, decoded.theme)
        assertEquals(McpUiDisplayMode.INLINE, decoded.displayMode)
        assertEquals(800, decoded.viewport?.width)
        assertEquals("en-US", decoded.locale)
        assertEquals(McpUiPlatform.MOBILE, decoded.platform)
        assertTrue(decoded.deviceCapabilities?.touch == true)
    }

    @Test
    fun testToolInputParams() {
        val params = McpUiToolInputParams(
            arguments = mapOf(
                "query" to JsonPrimitive("weather in NYC"),
                "count" to JsonPrimitive(5),
                "nested" to buildJsonObject {
                    put("key", "value")
                }
            )
        )

        val encoded = json.encodeToString(params)
        val decoded = json.decodeFromString<McpUiToolInputParams>(encoded)

        assertEquals("weather in NYC", decoded.arguments?.get("query")?.jsonPrimitive?.content)
        assertEquals(5, decoded.arguments?.get("count")?.jsonPrimitive?.int)
    }
}
