# OAuth Demo MCP Server

A demo MCP server + app that starts **unauthenticated** and lets the user trigger an OAuth flow on demand.

## How It Works

The server exposes two tools through MCP Apps:

| Tool | Auth Required | Description |
|------|---------------|-------------|
| `get-time` | No | Returns the current server time. Always works. |
| `get-secret-data` | Yes (OAuth) | Returns secret data. Only available via the authenticated endpoint. |

The app UI shows both tools. When the user clicks **"Authenticate with OAuth"**, it calls `get-secret-data` which goes through the OAuth-protected endpoint. The host/MCP client handles the 401 → OAuth authorization flow → token exchange → retry automatically.

### Architecture

```
┌─────────────┐     ┌──────────────────────────────────┐     ┌────────────────┐
│   App UI    │────▶│  Host (MCP Client, e.g. Claude)  │────▶│  MCP Server    │
│  (iframe)   │     │  Handles OAuth flow automatically │     │  :3001/mcp     │
└─────────────┘     └──────────────────────────────────┘     │  :3001/mcp-auth│
                                                              └────────────────┘
                                                                     │
                                                              ┌──────┴─────────┐
                                                              │  OAuth Server  │
                                                              │  :3002         │
                                                              └────────────────┘
```

- **`:3001/mcp`** — Unauthenticated endpoint. All tools are registered but work without auth.
- **`:3001/mcp-authenticated`** — OAuth-protected endpoint. Same tools, but requires a Bearer token.
- **`:3002`** — OAuth Authorization Server (better-auth with MCP plugin, in-memory SQLite).

## Running

```bash
# Install dependencies (from repo root)
npm install

# Dev mode (with hot reload)
npm run dev --workspace examples/oauth-server

# Or build and start
npm run start --workspace examples/oauth-server
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | MCP server port |
| `AUTH_PORT` | `PORT + 1` | OAuth Authorization Server port |

### MCP Client Configuration

```json
{
  "mcpServers": {
    "oauth-demo": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

For the authenticated endpoint:

```json
{
  "mcpServers": {
    "oauth-demo-auth": {
      "url": "http://localhost:3001/mcp-authenticated"
    }
  }
}
```

## Demo Only

This example uses in-memory SQLite and auto-approves logins. **Not for production use.**
