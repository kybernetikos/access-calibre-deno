# Calibre Reader Deno MCP Server

A Deno-native implementation of the Calibre Reader MCP server.

## Features

- List libraries and books
- Search across libraries using Calibre syntax
- Read book content (HTML or Markdown)
- Search within a book
- Get book covers and metadata
- List and get files from EPUBs (images, stylesheets, etc.)

## Running the Server

You can run this server directly via its URL using Deno.

```bash
CALIBRE_URL=http://localhost:8080/ deno run -allow-net=localhost:8080 --allow-env=CALIBRE_URL,CALIBRE_USERNAME,CALIBRE_PASSWORD https://raw.githubusercontent.com/kybernetikos/access-calibre-deno/refs/heads.main/main.ts
```

### Environment Variables

- `CALIBRE_URL`: The URL of your Calibre Content Server (default: `http://[::1]:8080/`)
- `CALIBRE_USERNAME`: Optional username for authentication
- `CALIBRE_PASSWORD`: Optional password for authentication

### MCP Configuration

Add this to your MCP settings (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "calibre": {
      "command": "deno",
      "args": [
        "run",
        "--allow-net=localhost:8080",
        "--allow-env=CALIBRE_URL,CALIBRE_USERNAME,CALIBRE_PASSWORD",
        "https://raw.githubusercontent.com/kybernetikos/access-calibre-deno/refs/heads.main/main.ts"
      ],
      "env": {
        "CALIBRE_URL": "http://localhost:8080/"
      }
    }
  }
}
```
