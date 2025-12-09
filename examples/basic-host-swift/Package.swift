// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BasicHostSwift",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .executable(
            name: "BasicHostSwift",
            targets: ["BasicHostApp"]
        ),
    ],
    dependencies: [
        // Local MCP Apps Swift SDK
        .package(path: "../../sdk/swift"),
        // MCP Swift SDK for MCP client
        .package(url: "https://github.com/modelcontextprotocol/swift-sdk.git", from: "0.10.0"),
    ],
    targets: [
        .executableTarget(
            name: "BasicHostApp",
            dependencies: [
                .product(name: "McpApps", package: "swift"),
                .product(name: "MCP", package: "swift-sdk"),
            ],
            path: "Sources/BasicHostApp"
        ),
    ]
)
