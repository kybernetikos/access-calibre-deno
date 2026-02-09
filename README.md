# Calibre Reader Deno MCP Server

A Deno-native implementation of the Calibre Reader MCP server.

## Features

- **Sandboxed Execution**: Runs in a Deno sandbox to prevent it from accessing your local files or network except for the calibre server.
- **List libraries and books**: Browse your entire Calibre collection.
- **Search across libraries**: Use Calibre's powerful search syntax (e.g., `author:"=Asimov"`, `series:"=Foundation"`).
- **Read book content**: Extract chapters as HTML or clean Markdown.
- **Smart Truncation**: Chapters are served in manageable chunks (default 30k characters) with `offset` support for reading long chapters.
- **Search within books**: Find specific text across the entire content of a book.
- **Metadata and Covers**: Access full book metadata and cover images.
- **EPUB Inspection**: List and extract individual files from EPUBs (images, stylesheets, etc.).
- **Visual Rendering**: Render specific book pages as images to see complex layouts or illustrations (uses a Deno-native browser automation library). Note that this tool requires more permissions and will download a browser on first use.
- **Interactive Prompts**: Includes an `analyze_book` prompt to guide LLMs through investigating a book.

## Running the Server

You will need to have a Calibre Content Server running locally.  Start one by running calibre and choosing the "Connect/share" option.

### MCP Settings

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
        "https://raw.githubusercontent.com/kybernetikos/access-calibre-deno/refs/heads/main/main.ts"
      ],
      "env": {
        "CALIBRE_URL": "http://localhost:8080/"
      }
    }
  }
}
```

Note: If you want to use the render_chapter_page tool, you should be aware that it requires more permissions than the other tools. It will download chrome in the background, which may cause the first call to time out. It's also the only tool that needs extensive other permissions - in this case, more network (to communicate with the browser renderer), environment variable access (for configuration), read, write and run access (for chrome download and running).

### Local Installation

If you have cloned the repository:

```bash
CALIBRE_URL=http://localhost:8080/ deno run --allow-net=localhost:8080 --allow-env=CALIBRE_URL,CALIBRE_USERNAME,CALIBRE_PASSWORD main.ts
```

### Remote Execution

You can run this server directly via its GitHub URL:

```bash
CALIBRE_URL=http://localhost:8080/ deno run --allow-net=localhost:8080 --allow-env=CALIBRE_URL,CALIBRE_USERNAME,CALIBRE_PASSWORD https://raw.githubusercontent.com/kybernetikos/access-calibre-deno/main/main.ts
```

### Logging

Enable verbose logging by adding `--verbose` or `-v` to the command arguments. Logs are sent to `stderr`, so they won't interfere with the MCP protocol.

```bash
deno run ... main.ts --verbose
```

## Configuration

### Environment Variables

- `CALIBRE_URL`: The URL of your Calibre Content Server (default: `http://[::1]:8080/`)
- `CALIBRE_USERNAME`: Optional username for authentication
- `CALIBRE_PASSWORD`: Optional password for authentication

## Available Tools

- `list_libraries`: List all libraries in the Calibre instance.
- `search_books`: Search for books across all libraries using Calibre query syntax.
- `list_books`: List books in a specific library with pagination (`limit`, `offset`).
- `list_chapters`: Get the table of contents for a book.
- `get_chapter_content`: Get raw HTML content of a chapter.
- `get_chapter_content_markdown`: Get chapter content converted to Markdown. Supports `offset` and `length` for large chapters.
- `search_in_book`: Search for text within a specific book.
- `get_book_metadata`: Get detailed metadata for a book.
- `get_book_cover`: Retrieve the cover image.
- `list_epub_files`: List all files inside the EPUB container.
- `get_epub_file`: Retrieve a specific file (image or text) from the EPUB.
- `render_chapter_page`: Render a specific page of a chapter as an image.
    - **Note**: The first time this tool is used, it will download chrome in the background, which may cause the first call to time out.
    - **Security**: This is the only tool that needs extensive other permissions - in this case, more network, environment variable access, read write and run access. If you are worried about what the agent might do, you should avoid using this tool (and can omit the extra permissions).
