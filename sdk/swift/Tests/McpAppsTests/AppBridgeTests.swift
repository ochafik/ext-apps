import XCTest
@testable import McpApps

final class AppBridgeTests: XCTestCase {

    let testHostInfo = Implementation(name: "TestHost", version: "1.0.0")
    let testAppInfo = Implementation(name: "TestApp", version: "1.0.0")
    let testHostCapabilities = McpUiHostCapabilities(
        openLinks: true,
        serverTools: ServerToolsCapability(),
        logging: true
    )

    func testMessageTypes() throws {
        // Test that all message types encode/decode correctly
        let initParams = McpUiInitializeParams(
            appInfo: Implementation(name: "TestApp", version: "1.0.0"),
            appCapabilities: McpUiAppCapabilities(
                tools: AppToolsCapability(listChanged: true)
            ),
            protocolVersion: "2025-11-21"
        )

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let encoded = try encoder.encode(initParams)
        let decoded = try decoder.decode(McpUiInitializeParams.self, from: encoded)

        XCTAssertEqual(decoded.appInfo.name, initParams.appInfo.name)
        XCTAssertEqual(decoded.protocolVersion, initParams.protocolVersion)
    }

    func testHostContext() throws {
        let context = McpUiHostContext(
            theme: .dark,
            displayMode: .inline,
            viewport: Viewport(width: 800, height: 600, maxHeight: 1000),
            locale: "en-US",
            timeZone: "America/New_York",
            platform: .mobile,
            deviceCapabilities: DeviceCapabilities(touch: true, hover: false),
            safeAreaInsets: SafeAreaInsets(top: 44, right: 0, bottom: 34, left: 0)
        )

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let encoded = try encoder.encode(context)
        let decoded = try decoder.decode(McpUiHostContext.self, from: encoded)

        XCTAssertEqual(decoded.theme, .dark)
        XCTAssertEqual(decoded.displayMode, .inline)
        XCTAssertEqual(decoded.viewport?.width, 800)
        XCTAssertEqual(decoded.locale, "en-US")
        XCTAssertEqual(decoded.platform, .mobile)
        XCTAssertEqual(decoded.deviceCapabilities?.touch, true)
    }

    func testToolInputParams() throws {
        let params = McpUiToolInputParams(
            arguments: [
                "query": AnyCodable("weather in NYC"),
                "count": AnyCodable(5)
            ]
        )

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let encoded = try encoder.encode(params)
        let decoded = try decoder.decode(McpUiToolInputParams.self, from: encoded)

        XCTAssertEqual(decoded.arguments?["query"]?.value as? String, "weather in NYC")
        XCTAssertEqual(decoded.arguments?["count"]?.value as? Int, 5)
    }

    func testJSONRPCRequest() throws {
        let request = JSONRPCRequest(
            id: .number(1),
            method: "ui/initialize",
            params: ["test": AnyCodable("value")]
        )

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let encoded = try encoder.encode(request)
        let decoded = try decoder.decode(JSONRPCRequest.self, from: encoded)

        XCTAssertEqual(decoded.id, .number(1))
        XCTAssertEqual(decoded.method, "ui/initialize")
        XCTAssertEqual(decoded.jsonrpc, "2.0")
    }

    func testJSONRPCNotification() throws {
        let notification = JSONRPCNotification(
            method: "ui/notifications/initialized",
            params: nil
        )

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let encoded = try encoder.encode(notification)
        let decoded = try decoder.decode(JSONRPCNotification.self, from: encoded)

        XCTAssertEqual(decoded.method, "ui/notifications/initialized")
        XCTAssertEqual(decoded.jsonrpc, "2.0")
    }

    func testAnyCodable() throws {
        let values: [String: AnyCodable] = [
            "string": AnyCodable("hello"),
            "int": AnyCodable(42),
            "double": AnyCodable(3.14),
            "bool": AnyCodable(true),
            "array": AnyCodable([1, 2, 3]),
            "dict": AnyCodable(["nested": "value"])
        ]

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let encoded = try encoder.encode(values)
        let decoded = try decoder.decode([String: AnyCodable].self, from: encoded)

        XCTAssertEqual(decoded["string"]?.value as? String, "hello")
        XCTAssertEqual(decoded["int"]?.value as? Int, 42)
        XCTAssertEqual(decoded["bool"]?.value as? Bool, true)
    }

    func testAppBridgeCreation() async throws {
        let bridge = AppBridge(
            hostInfo: testHostInfo,
            hostCapabilities: testHostCapabilities
        )

        XCTAssertFalse(await bridge.isReady())
        XCTAssertNil(await bridge.getAppCapabilities())
        XCTAssertNil(await bridge.getAppVersion())
    }

    func testInMemoryTransportCreation() async throws {
        let (transport1, transport2) = await InMemoryTransport.createLinkedPair()

        try await transport1.start()
        try await transport2.start()

        // Test that we can create transports without error
        await transport1.close()
        await transport2.close()
    }

    func testInitializeResult() throws {
        let result = McpUiInitializeResult(
            protocolVersion: McpAppsConfig.latestProtocolVersion,
            hostInfo: testHostInfo,
            hostCapabilities: testHostCapabilities,
            hostContext: McpUiHostContext(theme: .light)
        )

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let encoded = try encoder.encode(result)
        let decoded = try decoder.decode(McpUiInitializeResult.self, from: encoded)

        XCTAssertEqual(decoded.protocolVersion, McpAppsConfig.latestProtocolVersion)
        XCTAssertEqual(decoded.hostInfo.name, testHostInfo.name)
        XCTAssertEqual(decoded.hostContext.theme, .light)
    }

    func testLogLevel() throws {
        let levels: [LogLevel] = [.debug, .info, .notice, .warning, .error, .critical, .alert, .emergency]

        for level in levels {
            let params = LoggingMessageParams(
                level: level,
                data: AnyCodable("Test message"),
                logger: "TestLogger"
            )

            let encoder = JSONEncoder()
            let decoder = JSONDecoder()

            let encoded = try encoder.encode(params)
            let decoded = try decoder.decode(LoggingMessageParams.self, from: encoded)

            XCTAssertEqual(decoded.level, level)
        }
    }

    func testResourceMeta() throws {
        let meta = McpUiResourceMeta(
            csp: McpUiResourceCsp(
                connectDomains: ["https://api.example.com"],
                resourceDomains: ["https://cdn.example.com"]
            ),
            domain: "https://widget.example.com",
            prefersBorder: true
        )

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let encoded = try encoder.encode(meta)
        let decoded = try decoder.decode(McpUiResourceMeta.self, from: encoded)

        XCTAssertEqual(decoded.csp?.connectDomains?.first, "https://api.example.com")
        XCTAssertEqual(decoded.domain, "https://widget.example.com")
        XCTAssertEqual(decoded.prefersBorder, true)
    }
}
