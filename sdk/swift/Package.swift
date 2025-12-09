// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "McpApps",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
        .tvOS(.v16),
        .watchOS(.v9)
    ],
    products: [
        .library(
            name: "McpApps",
            targets: ["McpApps"]
        ),
    ],
    dependencies: [
        // MCP Swift SDK for core types
        .package(url: "https://github.com/modelcontextprotocol/swift-sdk.git", from: "0.10.0"),
    ],
    targets: [
        .target(
            name: "McpApps",
            dependencies: [
                .product(name: "MCP", package: "swift-sdk"),
            ],
            path: "Sources/McpApps"
        ),
        .testTarget(
            name: "McpAppsTests",
            dependencies: ["McpApps"],
            path: "Tests/McpAppsTests"
        ),
    ]
)
