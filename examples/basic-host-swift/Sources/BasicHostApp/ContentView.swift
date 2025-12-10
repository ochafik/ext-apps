import SwiftUI
import MCP
import McpApps

struct ContentView: View {
    @StateObject private var viewModel = McpHostViewModel()

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Compact connection section
                connectionSection
                    .padding(.horizontal)
                    .padding(.vertical, 8)

                Divider()

                // Tool call section (only when connected)
                if viewModel.connectionState == .connected {
                    toolCallSection
                        .padding(.horizontal)
                        .padding(.vertical, 8)

                    Divider()
                }

                // Active tool calls
                if !viewModel.activeToolCalls.isEmpty {
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(viewModel.activeToolCalls) { toolCall in
                                ToolCallCard(
                                    toolCallInfo: toolCall,
                                    onRemove: { viewModel.removeToolCall(toolCall) }
                                )
                            }
                        }
                        .padding()
                    }
                } else {
                    Spacer()
                    Text("No active tool calls")
                        .foregroundColor(.secondary)
                        .font(.subheadline)
                    Spacer()
                }
            }
            .navigationTitle("MCP Host")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Compact Connection Section

    private var connectionSection: some View {
        VStack(spacing: 8) {
            // Server dropdown + Connect/Disconnect button on same line
            HStack {
                Picker("Server", selection: $viewModel.selectedServerIndex) {
                    ForEach(Array(McpHostViewModel.knownServers.enumerated()), id: \.offset) { index, server in
                        Text(server.0).tag(index)
                    }
                    Text("Custom...").tag(-1)
                }
                .pickerStyle(.menu)
                .disabled(viewModel.connectionState == .connected || viewModel.connectionState == .connecting)

                Spacer()

                connectionButton
            }

            // Custom URL field (only when Custom is selected)
            if viewModel.selectedServerIndex == -1 {
                TextField("http://localhost:3001/mcp", text: $viewModel.customServerUrl)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.caption, design: .monospaced))
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                    .disabled(viewModel.connectionState == .connected || viewModel.connectionState == .connecting)
            }

            // Error message
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption2)
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var connectionButton: some View {
        Group {
            if case .error = viewModel.connectionState {
                Button("Retry") {
                    Task { await viewModel.connect() }
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                .controlSize(.small)
            } else if viewModel.connectionState == .disconnected {
                Button("Connect") {
                    Task { await viewModel.connect() }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            } else if viewModel.connectionState == .connecting {
                HStack(spacing: 4) {
                    ProgressView().scaleEffect(0.7)
                    Text("...")
                }
                .font(.caption)
            } else if viewModel.connectionState == .connected {
                Button("Disconnect") {
                    Task { await viewModel.disconnect() }
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .controlSize(.small)
            }
        }
    }

    // MARK: - Compact Tool Call Section

    private var toolCallSection: some View {
        HStack {
            // Tool dropdown
            Picker("Tool", selection: $viewModel.selectedTool) {
                ForEach(viewModel.tools, id: \.name) { tool in
                    Text(tool.name).tag(tool as Tool?)
                }
            }
            .pickerStyle(.menu)

            Spacer()

            // Call button
            Button("Call") {
                Task { await viewModel.callTool() }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(viewModel.selectedTool == nil)
        }
    }

    private var isValidJson: Bool {
        guard let data = viewModel.toolInputJson.data(using: .utf8) else { return false }
        return (try? JSONSerialization.jsonObject(with: data)) != nil
    }
}

// MARK: - Tool Call Card

struct ToolCallCard: View {
    @ObservedObject var toolCallInfo: ToolCallInfo
    let onRemove: () -> Void

    @State private var isInputExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header with tool name, state, and actions
            HStack {
                Text(toolCallInfo.tool.name)
                    .font(.headline)

                Spacer()

                Text(toolCallInfo.state.description)
                    .font(.caption)
                    .foregroundColor(stateColor)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(stateColor.opacity(0.1))
                    .cornerRadius(4)

                // Expand/collapse input
                Button {
                    withAnimation { isInputExpanded.toggle() }
                } label: {
                    Image(systemName: isInputExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.secondary)
                }

                // Remove button
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }

            // Collapsible input section
            if isInputExpanded {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Input:")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if let jsonData = try? JSONSerialization.data(
                        withJSONObject: toolCallInfo.input,
                        options: .prettyPrinted
                    ), let jsonString = String(data: jsonData, encoding: .utf8) {
                        Text(jsonString)
                            .font(.system(.caption2, design: .monospaced))
                            .padding(6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(UIColor.systemGray6))
                            .cornerRadius(4)
                    }
                }
            }

            // Content area (error, WebView, or result)
            if let error = toolCallInfo.error {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(4)
            } else if toolCallInfo.state == .ready, toolCallInfo.htmlContent != nil {
                WebViewContainer(toolCallInfo: toolCallInfo)
                    .frame(height: 350)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                    )
            } else if toolCallInfo.state == .completed, let result = toolCallInfo.result {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(result.content.enumerated()), id: \.offset) { _, content in
                        switch content {
                        case .text(let text):
                            Text(text)
                                .font(.system(.caption, design: .monospaced))
                                .padding(6)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(UIColor.systemGray6))
                                .cornerRadius(4)
                        default:
                            EmptyView()
                        }
                    }
                }
            } else if toolCallInfo.state == .calling || toolCallInfo.state == .loadingUi {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text(toolCallInfo.state.description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .padding()
            }
        }
        .padding(12)
        .background(Color(UIColor.systemBackground))
        .cornerRadius(12)
        .shadow(radius: 2)
    }

    private var stateColor: Color {
        switch toolCallInfo.state {
        case .calling, .loadingUi: return .orange
        case .ready, .completed: return .green
        case .error: return .red
        }
    }
}

#Preview {
    ContentView()
}
