# Claude Code Custom Commands (Skills)

This directory contains custom slash commands for Claude Code.

## What are Skills/Commands?

Claude Code commands are markdown files that get expanded as prompts when you invoke them with `/command-name`. They let you create reusable workflows.

## Available Commands

| Command                     | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `/setup-chatgpt-aggregator` | Automate ChatGPT Apps connector setup with MCP Aggregator |

## How to Use

1. In Claude Code, type `/` followed by the command name
2. The command's markdown content becomes part of the conversation
3. Claude executes the workflow described in the command

Example:

```
/setup-chatgpt-aggregator
```

## How to Package/Share

Commands are just markdown files. To share:

1. **Copy the file** - Share `.claude/commands/*.md` files
2. **Include in repo** - Commit to `.claude/commands/` in your project
3. **Global commands** - Put in `~/.claude/commands/` for all projects

### Directory Structure

```
.claude/
├── commands/
│   ├── README.md                      # This file
│   └── setup-chatgpt-aggregator.md    # ChatGPT setup skill
└── settings.local.json                # Local permissions
```

## Prerequisites for setup-chatgpt-aggregator

1. **Enable the chrome MCP server**:

   ```
   /mcp
   # Select "chrome" → "Enable"
   ```

2. **Install cloudflared**:

   ```bash
   brew install cloudflare/cloudflare/cloudflared
   ```

3. **Have a ChatGPT account** with developer mode access

## Creating New Commands

Create a new `.md` file in this directory:

```markdown
# My Command Name

Description of what this command does.

## Steps

1. First step...
2. Second step...
```

The filename (without `.md`) becomes the command name:

- `my-command.md` → `/my-command`

## MCP Server Dependency

The `setup-chatgpt-aggregator` skill requires the `chrome` MCP server defined in `.mcp.json`:

```json
{
  "mcpServers": {
    "chrome": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--headless=false"]
    }
  }
}
```

## More Info

- [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code)
- [MCP Protocol](https://modelcontextprotocol.io)
