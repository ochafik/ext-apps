# Setup ChatGPT with MCP Aggregator Server

Automate the setup of ChatGPT Apps connector with the local MCP Aggregator server.

## FIRST: Enable the Chrome MCP Server

Before running this skill, enable the chrome MCP server:

1. Run `/mcp` in Claude Code
2. Select "chrome" from the list
3. Choose "Enable"

Or manually add to `~/.claude.json` under the project's `enabledMcpjsonServers` array.

## Overview

This skill automates:

1. Starting the aggregator server (port 3100) with all example backend servers
2. Creating a cloudflared tunnel to expose the aggregator
3. Opening ChatGPT.com and guiding through authentication
4. Configuring the Apps connector with the tunnel URL
5. Testing each tool from the aggregator

## Prerequisites

- `cloudflared` installed (`brew install cloudflare/cloudflare/cloudflared`)
- Chrome browser available
- ChatGPT account with developer mode access
- `chrome` MCP server enabled (see above)

## Execution Steps

### Step 1: Start Backend Servers and Aggregator

First, start the example servers that will feed into the aggregator:

```bash
# Start all example servers in background
npm run examples:start &

# Wait for servers to be ready
sleep 5

# Start the aggregator server pointing to all backends
BACKEND_SERVERS='["http://localhost:3101/mcp","http://localhost:3102/mcp","http://localhost:3103/mcp","http://localhost:3104/mcp","http://localhost:3105/mcp","http://localhost:3106/mcp","http://localhost:3107/mcp","http://localhost:3108/mcp","http://localhost:3109/mcp"]' \
PORT=3100 bun examples/aggregator-server/server.ts &

# Wait for aggregator
sleep 3
```

### Step 2: Start Cloudflared Tunnel

```bash
# Start tunnel and capture the URL
cloudflared tunnel --url http://localhost:3100 2>&1 | tee /tmp/cloudflared.log &

# Wait for tunnel URL to appear
sleep 5

# Extract the tunnel URL
TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1)
echo "Tunnel URL: $TUNNEL_URL"
```

### Step 3: Get Tool List from Aggregator

Query the aggregator to get all available tools:

```bash
# Initialize session and get tools
curl -s -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | jq -r '.result.sessionId // empty' > /tmp/mcp-session-id

SESSION_ID=$(cat /tmp/mcp-session-id)

# List tools
curl -s -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | jq -r '.result.tools[].name' > /tmp/aggregator-tools.txt

echo "Available tools:"
cat /tmp/aggregator-tools.txt
```

### Step 4: Browser Automation with Chrome DevTools MCP

Use the `chrome` MCP server to automate the ChatGPT setup. The MCP tools available are:

- `browser_navigate` - Navigate to a URL
- `browser_click` - Click an element
- `browser_type` - Type text into an element
- `browser_snapshot` - Take accessibility snapshot
- `browser_wait` - Wait for element or timeout

#### 4.1 Open ChatGPT and Authenticate

```
# Navigate to ChatGPT
Use chrome MCP: browser_navigate to "https://chatgpt.com"

# Run audio prompt for user
Run: say "Please authenticate to ChatGPT. Press any key when done."
Read a line from stdin to wait.

# Take snapshot to verify logged in
Use chrome MCP: browser_snapshot
Verify the page shows logged-in state (look for profile menu or chat input)
```

#### 4.2 Check for Developer Mode

```
# Take snapshot of the main input area
Use chrome MCP: browser_snapshot

# Look for "developer mode" indicator near the input box
# This may appear as a badge or overlay on the input
```

#### 4.3 Navigate to Settings > Apps & Connectors

```
# Click the profile/settings menu (usually top-right)
Use chrome MCP: browser_click on the profile menu button

# Click "Settings" in the dropdown
Use chrome MCP: browser_click on "Settings"

# Wait for settings panel
Use chrome MCP: browser_wait for settings panel

# Click "Apps & Connectors" or similar tab
Use chrome MCP: browser_click on "Apps & Connectors"
```

#### 4.4 Create New App Connector

```
# Click "Create App" or "Add Connector" button
Use chrome MCP: browser_click on the create/add button

# Fill in the form:
# - Name: "Aggregator"
Use chrome MCP: browser_type "Aggregator" in the name field

# - URL: The tunnel URL + /mcp
Use chrome MCP: browser_type "$TUNNEL_URL/mcp" in the URL field

# Click continue/next if there's a confirmation
Use chrome MCP: browser_click on continue button

# Select "No authentication" option
Use chrome MCP: browser_click on "None" or "No auth" option

# Click "Create" to finalize
Use chrome MCP: browser_click on "Create" button
```

#### 4.5 Test the Connector

```
# Go back to main chat
Use chrome MCP: browser_navigate to "https://chatgpt.com"

# Click the input box
Use chrome MCP: browser_click on the chat input

# Type @Aggregator to trigger autocomplete
Use chrome MCP: browser_type "@Aggregator"

# Wait for autocomplete dropdown
Use chrome MCP: browser_wait for autocomplete suggestions

# Verify "Aggregator" appears in suggestions
Use chrome MCP: browser_snapshot to verify

# Press Enter to select
Use chrome MCP: browser_type with Enter key

# Verify it shows as selected (badge below input)
Use chrome MCP: browser_snapshot to verify selection badge
```

#### 4.6 Test Each Tool

For each tool in `/tmp/aggregator-tools.txt`:

```
# Type a test prompt for this tool
Use chrome MCP: browser_type "use the {TOOL_NAME} mcp"

# Submit the message
Use chrome MCP: browser_type with Enter key

# Wait for response
Use chrome MCP: browser_wait for response to appear

# Take snapshot to verify
Use chrome MCP: browser_snapshot
```

## Cleanup

When done:

```bash
# Kill background processes
pkill -f cloudflared
pkill -f "bun examples/aggregator-server"
pkill -f "npm run examples:start"
```

## Notes

- The exact selectors for ChatGPT UI elements may change; use `browser_snapshot` to inspect the current DOM
- Developer mode access is required for Apps & Connectors
- The tunnel URL changes each time cloudflared starts
- All tools from the aggregator are prefixed with the backend server name (e.g., `basic-mcp-app-server-react/get-time`)
