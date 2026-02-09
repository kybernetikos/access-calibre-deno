import {
  McpServer as Server,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError
} from "./src/mcp-native.ts";
import { CalibreClient } from "./src/client.ts";
import { log, setVerbose } from "./src/logger.ts";

const CALIBRE_URL = Deno.env.get("CALIBRE_URL") || "http://[::1]:8080/";
const CALIBRE_USERNAME = Deno.env.get("CALIBRE_USERNAME") || null;
const CALIBRE_PASSWORD = Deno.env.get("CALIBRE_PASSWORD") || null;

const client = new CalibreClient(CALIBRE_URL, CALIBRE_USERNAME, CALIBRE_PASSWORD);

if (Deno.args.includes("--verbose") || Deno.args.includes("-v")) {
  setVerbose(true);
}

function toBase64(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const server = new Server(
  {
    name: "calibre-reader-deno",
    version: "1.0.0",
  }
);

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  log("ListPrompts requested");
  return {
    prompts: [
      {
        name: "analyze_book",
        description: "Guidance on how to investigate and analyze a book in the Calibre library.",
        arguments: [
          {
            name: "bookTitle",
            description: "The title of the book to analyze",
            required: true,
          },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  log(`GetPrompt requested: ${request.params.name}`, request.params.arguments);
  if (request.params.name === "analyze_book") {
    const bookTitle = request.params.arguments?.bookTitle;
    return {
      description: `Analyze book: ${bookTitle}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I want to investigate details in the book "${bookTitle}". 

To do this effectively, please follow these steps:
1. Use 'search_books' to find the book and get its 'libraryId' and 'bookId'. Use Calibre's search syntax for better accuracy (e.g., 'author:"Author Name"' or 'title:"Book Title"').
2. Use 'list_chapters' to understand the structure of the book.
3. If you are looking for specific information (characters, events, etc.), use 'search_in_book' to find relevant snippets.
4. Once you identify relevant chapters or sections from the search results or the table of contents, use 'get_chapter_content_markdown' to read the full text.
5. If you need more content from a chapter, use the 'offset' parameter.

Please start by searching for the book.`,
          },
        },
      ],
    };
  }
  throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${request.params.name}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  log("ListTools requested");
  return {
    tools: [
      {
        name: "list_libraries",
        description: "List available Calibre libraries with their book counts.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "search_books",
        description: "Search for books across all libraries. Supports Calibre syntax: author:\"Name\", title:\"Name\", series:\"Name\".",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      },
      {
        name: "list_books",
        description: "List books in a specific library",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string", description: "The ID of the library" },
            limit: { type: "number", description: "Max books (default 100)" },
            offset: { type: "number", description: "Offset (default 0)" },
          },
          required: ["libraryId"],
        },
      },
      {
        name: "list_chapters",
        description: "List all chapters of a specific book.",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string" },
            bookId: { type: "number" },
          },
          required: ["libraryId", "bookId"],
        },
      },
      {
        name: "get_chapter_content",
        description: "Get the HTML content of a specific chapter.",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string" },
            bookId: { type: "number" },
            path: { type: "string" },
          },
          required: ["libraryId", "bookId", "path"],
        },
      },
      {
        name: "get_chapter_content_markdown",
        description: "Get the content of a specific chapter converted to Markdown. RECOMMENDED.",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string" },
            bookId: { type: "number" },
            path: { type: "string" },
            offset: { type: "number", description: "Character offset" },
            length: { type: "number", description: "Number of characters (default 30000)" },
          },
          required: ["libraryId", "bookId", "path"],
        },
      },
      {
        name: "get_book_cover",
        description: "Get the cover image of a book.",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string" },
            bookId: { type: "number" },
          },
          required: ["libraryId", "bookId"],
        },
      },
      {
        name: "search_in_book",
        description: "Search for literal text within a book.",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string" },
            bookId: { type: "number" },
            query: { type: "string" },
          },
          required: ["libraryId", "bookId", "query"],
        },
      },
      {
        name: "get_book_metadata",
        description: "Get full metadata for a specific book.",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string" },
            bookId: { type: "number" },
          },
          required: ["libraryId", "bookId"],
        },
      },
      {
        name: "get_epub_file",
        description: "Get a specific file from an EPUB (e.g., an image or HTML file).",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string" },
            bookId: { type: "number" },
            path: { type: "string", description: "Path to the file within the EPUB" },
          },
          required: ["libraryId", "bookId", "path"],
        },
      },
      {
        name: "list_epub_files",
        description: "List all files contained within an EPUB (e.g., HTML, CSS, images).",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string" },
            bookId: { type: "number" },
          },
          required: ["libraryId", "bookId"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log(`Tool call: ${name}`, args);

  try {
    switch (name) {
      case "list_libraries": {
        const libraries = await client.getLibraries();
        const formatted = Object.entries(libraries).map(([id, info]) => ({
          id,
          name: info.name,
          bookCount: info.num_books,
        }));
        return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
      }
      case "search_books": {
        const query = (args as any).query;
        const libraries = await client.getLibraries();
        const results = [];
        for (const libraryId of Object.keys(libraries)) {
          const { books } = await client.getBooks(libraryId, 100, 0, query);
          for (const book of books) {
            results.push({
              libraryId,
              libraryName: (libraries[libraryId] as any).name,
              bookId: book.id || book.application_id,
              title: book.title,
              authors: book.authors,
            });
          }
        }
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }
      case "list_books": {
        const { libraryId, limit = 100, offset = 0 } = args as any;
        const { books, total } = await client.getBooks(libraryId, limit, offset);
        const simplified = books.map((book: any) => ({
          id: book.id || book.application_id,
          title: book.title,
          authors: book.authors,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify({ books: simplified, total }, null, 2) }],
        };
      }
      case "list_chapters": {
        const chapters = await client.getChapters((args as any).libraryId, (args as any).bookId);
        return { content: [{ type: "text", text: JSON.stringify(chapters, null, 2) }] };
      }
      case "get_chapter_content": {
        const content = await client.getChapterContent((args as any).libraryId, (args as any).bookId, (args as any).path);
        return { content: [{ type: "text", text: content }] };
      }
      case "get_chapter_content_markdown": {
        const { libraryId, bookId, path, offset = 0, length = 30000 } = args as any;
        let content = await client.getChapterContentMarkdown(libraryId, bookId, path);
        const totalLength = content.length;
        content = content.substring(offset, offset + length);
        if (totalLength > offset + length) {
          content += `\n\n... (truncated, use offset ${offset + length} to read more)`;
        }
        return { content: [{ type: "text", text: content }] };
      }
      case "get_book_cover": {
        const buffer = await client.getBookCover((args as any).libraryId, (args as any).bookId);
        return {
          content: [
            {
              type: "image",
              data: toBase64(buffer),
              mimeType: "image/png",
            },
          ],
        };
      }
      case "search_in_book": {
        const results = await client.searchInBook((args as any).libraryId, (args as any).bookId, (args as any).query);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }
      case "get_book_metadata": {
        const metadata = await client.getBookMetadata((args as any).libraryId, (args as any).bookId);
        return { content: [{ type: "text", text: JSON.stringify(metadata, null, 2) }] };
      }
      case "get_epub_file": {
        const { libraryId, bookId, path } = args as any;
        // Determine if it's an image or text
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
        if (isImage) {
          const buffer = await client.getEpubFile(libraryId, bookId, path, "buffer") as Uint8Array;
          const ext = path.split('.').pop()?.toLowerCase();
          const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          return {
            content: [
              {
                type: "image",
                data: toBase64(buffer),
                mimeType: mimeType,
              },
            ],
          };
        } else {
          const content = await client.getEpubFile(libraryId, bookId, path, "text") as string;
          return { content: [{ type: "text", text: content }] };
        }
      }
      case "list_epub_files": {
        const { libraryId, bookId } = args as any;
        const files = await client.getEpubContents(libraryId, bookId);
        return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    log(`Error in tool ${name}:`, error);
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

await server.start();
log("Calibre Reader Deno MCP Server running on stdio");
