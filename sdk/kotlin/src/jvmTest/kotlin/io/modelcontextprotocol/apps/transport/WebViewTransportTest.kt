package io.modelcontextprotocol.apps.transport

import android.net.Uri
import android.os.Build
import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebMessagePortCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import io.modelcontextprotocol.apps.protocol.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.mockito.kotlin.*
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.assertFailsWith

/**
 * Unit tests for WebViewTransport.
 *
 * Note: These tests use Mockito to mock the WebView and WebViewCompat since we're testing
 * the transport logic without needing an actual Android environment.
 */
class WebViewTransportTest {

    private lateinit var nativePort: WebMessagePortCompat
    private lateinit var jsPort: WebMessagePortCompat
    private lateinit var portCallback: WebMessagePortCompat.WebMessageCallbackCompat

    /**
     * Create a mock WebView that simulates the Android WebView behavior.
     */
    private fun createMockWebView(): WebView {
        val webView = mock<WebView>()
        val settings = mock<android.webkit.WebSettings>()
        whenever(webView.settings).thenReturn(settings)

        // Mock post() to execute runnables immediately for testing
        whenever(webView.post(any())).thenAnswer { invocation ->
            val runnable = invocation.arguments[0] as Runnable
            runnable.run()
            true
        }

        return webView
    }

    @BeforeEach
    fun setup() {
        // Create mock ports
        nativePort = mock<WebMessagePortCompat>()
        jsPort = mock<WebMessagePortCompat>()

        // Capture the callback when setWebMessageCallback is called
        whenever(nativePort.setWebMessageCallback(any())).thenAnswer { invocation ->
            portCallback = invocation.arguments[0] as WebMessagePortCompat.WebMessageCallbackCompat
        }
    }

    @Test
    fun testStartInitializesWebView() = runTest {
        val webView = createMockWebView()

        // Mock static methods using mockStatic
        mockStatic(WebViewFeature::class.java).use { webViewFeatureMock ->
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE) }.thenReturn(true)
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL) }.thenReturn(true)

            mockStatic(WebViewCompat::class.java).use { webViewCompatMock ->
                webViewCompatMock.`when`<Array<WebMessagePortCompat>> { WebViewCompat.createWebMessageChannel(webView) }
                    .thenReturn(arrayOf(nativePort, jsPort))

                val transport = WebViewTransport(webView)
                transport.start()

                // Verify JavaScript is enabled
                verify(webView.settings).javaScriptEnabled = true

                // Verify channel was created
                webViewCompatMock.verify { WebViewCompat.createWebMessageChannel(webView) }

                // Verify callback was set on native port
                verify(nativePort).setWebMessageCallback(any())

                // Verify bridge script was injected
                verify(webView).evaluateJavascript(argThat { contains("window.mcpBridge") }, isNull())

                // Verify port was sent to WebView
                webViewCompatMock.verify {
                    WebViewCompat.postWebMessage(
                        eq(webView),
                        argThat { it.data == "mcp-channel-init" && it.ports?.contains(jsPort) == true },
                        eq(Uri.EMPTY)
                    )
                }
            }
        }
    }

    @Test
    fun testSendMessageToWebView() = runTest {
        val webView = createMockWebView()

        mockStatic(WebViewFeature::class.java).use { webViewFeatureMock ->
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE) }.thenReturn(true)
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL) }.thenReturn(true)

            mockStatic(WebViewCompat::class.java).use { webViewCompatMock ->
                webViewCompatMock.`when`<Array<WebMessagePortCompat>> { WebViewCompat.createWebMessageChannel(webView) }
                    .thenReturn(arrayOf(nativePort, jsPort))

                val transport = WebViewTransport(webView)
                transport.start()

                // Create a test message
                val message = JSONRPCRequest(
                    id = JsonPrimitive(1),
                    method = "test/method",
                    params = buildJsonObject {
                        put("key", JsonPrimitive("value"))
                    }
                )

                transport.send(message)

                // Verify postWebMessage was called with the serialized message
                webViewCompatMock.verify {
                    WebViewCompat.postWebMessage(
                        eq(webView),
                        argThat { it.data?.contains("test/method") == true },
                        eq(Uri.EMPTY)
                    )
                }
            }
        }
    }

    @Test
    fun testReceiveMessageFromJavaScript() = runTest {
        val webView = createMockWebView()

        mockStatic(WebViewFeature::class.java).use { webViewFeatureMock ->
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE) }.thenReturn(true)
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL) }.thenReturn(true)

            mockStatic(WebViewCompat::class.java).use { webViewCompatMock ->
                webViewCompatMock.`when`<Array<WebMessagePortCompat>> { WebViewCompat.createWebMessageChannel(webView) }
                    .thenReturn(arrayOf(nativePort, jsPort))

                val transport = WebViewTransport(webView)
                transport.start()

                // Create a test message JSON
                val messageJson = """{"jsonrpc":"2.0","id":1,"method":"ui/initialize","params":{}}"""

                // Collect incoming messages in a separate coroutine
                val receivedMessages = mutableListOf<JSONRPCMessage>()
                val job = launch {
                    transport.incoming.collect { receivedMessages.add(it) }
                }

                // Simulate JavaScript sending a message via the port
                val webMessage = WebMessageCompat(messageJson)
                portCallback.onMessage(nativePort, webMessage)

                // Give some time for the message to be processed
                delay(50)

                // Verify message was received
                assertTrue(receivedMessages.isNotEmpty(), "Should have received at least one message")
                val received = receivedMessages.first() as JSONRPCRequest
                assertEquals("ui/initialize", received.method)
                assertEquals(JsonPrimitive(1), received.id)

                job.cancel()
            }
        }
    }

    @Test
    fun testCloseClosesPort() = runTest {
        val webView = createMockWebView()

        mockStatic(WebViewFeature::class.java).use { webViewFeatureMock ->
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE) }.thenReturn(true)
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL) }.thenReturn(true)

            mockStatic(WebViewCompat::class.java).use { webViewCompatMock ->
                webViewCompatMock.`when`<Array<WebMessagePortCompat>> { WebViewCompat.createWebMessageChannel(webView) }
                    .thenReturn(arrayOf(nativePort, jsPort))

                val transport = WebViewTransport(webView)
                transport.start()
                transport.close()

                // Verify port is closed
                verify(nativePort).close()
            }
        }
    }

    @Test
    fun testErrorHandlingForInvalidJSON() = runTest {
        val webView = createMockWebView()

        mockStatic(WebViewFeature::class.java).use { webViewFeatureMock ->
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE) }.thenReturn(true)
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL) }.thenReturn(true)

            mockStatic(WebViewCompat::class.java).use { webViewCompatMock ->
                webViewCompatMock.`when`<Array<WebMessagePortCompat>> { WebViewCompat.createWebMessageChannel(webView) }
                    .thenReturn(arrayOf(nativePort, jsPort))

                val transport = WebViewTransport(webView)
                transport.start()

                // Collect errors
                val receivedErrors = mutableListOf<Throwable>()
                val job = launch {
                    transport.errors.collect { receivedErrors.add(it) }
                }

                // Simulate JavaScript sending invalid JSON
                val webMessage = WebMessageCompat("invalid json{")
                portCallback.onMessage(nativePort, webMessage)

                delay(50)

                // Verify error was emitted
                assertTrue(receivedErrors.isNotEmpty(), "Should have received at least one error")
                assertTrue(receivedErrors.first().message?.contains("Failed to parse") == true)

                job.cancel()
            }
        }
    }

    @Test
    fun testMultipleMessages() = runTest {
        val webView = createMockWebView()

        mockStatic(WebViewFeature::class.java).use { webViewFeatureMock ->
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE) }.thenReturn(true)
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL) }.thenReturn(true)

            mockStatic(WebViewCompat::class.java).use { webViewCompatMock ->
                webViewCompatMock.`when`<Array<WebMessagePortCompat>> { WebViewCompat.createWebMessageChannel(webView) }
                    .thenReturn(arrayOf(nativePort, jsPort))

                val transport = WebViewTransport(webView)
                transport.start()

                // Collect incoming messages
                val receivedMessages = mutableListOf<JSONRPCMessage>()
                val job = launch {
                    transport.incoming.collect { receivedMessages.add(it) }
                }

                // Send multiple messages
                val message1 = """{"jsonrpc":"2.0","method":"notification/one"}"""
                val message2 = """{"jsonrpc":"2.0","method":"notification/two"}"""
                val message3 = """{"jsonrpc":"2.0","id":42,"method":"request/three"}"""

                portCallback.onMessage(nativePort, WebMessageCompat(message1))
                portCallback.onMessage(nativePort, WebMessageCompat(message2))
                portCallback.onMessage(nativePort, WebMessageCompat(message3))

                delay(100)

                // Verify all messages were received
                assertEquals(3, receivedMessages.size)
                assertEquals("notification/one", (receivedMessages[0] as JSONRPCNotification).method)
                assertEquals("notification/two", (receivedMessages[1] as JSONRPCNotification).method)
                assertEquals("request/three", (receivedMessages[2] as JSONRPCRequest).method)

                job.cancel()
            }
        }
    }

    @Test
    fun testJavaScriptBridgeScriptFormat() {
        // Verify the bridge script contains expected components
        val bridgeScript = WebViewTransport::class.java.getDeclaredField("BRIDGE_SCRIPT").apply {
            isAccessible = true
        }.get(null) as String

        // Should create window.mcpBridge
        assertTrue(bridgeScript.contains("window.mcpBridge"), "Should define window.mcpBridge")

        // Should have send function
        assertTrue(bridgeScript.contains("send:"), "Should define send function")

        // Should override window.parent.postMessage
        assertTrue(
            bridgeScript.contains("window.parent.postMessage"),
            "Should override window.parent.postMessage"
        )

        // Should listen for MessagePort
        assertTrue(
            bridgeScript.contains("mcp-channel-init"),
            "Should listen for channel init message"
        )

        // Should check for port initialization
        assertTrue(
            bridgeScript.contains("_port"),
            "Should have port field"
        )

        // Should handle initialization check
        assertTrue(
            bridgeScript.contains("_initialized"),
            "Should have initialization guard"
        )
    }

    @Test
    fun testUnsupportedWebViewFeatureThrows() = runTest {
        val webView = createMockWebView()

        mockStatic(WebViewFeature::class.java).use { webViewFeatureMock ->
            webViewFeatureMock.`when`<Boolean> { WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE) }.thenReturn(false)

            val transport = WebViewTransport(webView)

            assertFailsWith<UnsupportedOperationException> {
                transport.start()
            }
        }
    }
}
