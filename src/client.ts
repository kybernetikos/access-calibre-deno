import { ZipReader, Uint8ArrayReader, TextWriter, Uint8ArrayWriter } from "jsr:@zip-js/zip-js@^2.8.17";
import { log, error } from "./logger.ts";
import { launch } from "jsr:@astral/astral@^0.5.5";

export class CalibreClient {
  private baseUrl: string;
  private auth: string | null;

  constructor(baseUrl: string, username?: string | null, password?: string | null) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    if (username && password) {
      this.auth = btoa(`${username}:${password}`);
    } else {
      this.auth = null;
    }
  }

  private async fetch(url: string, options: RequestInit = {}) {
    const fullUrl = this.baseUrl + url;
    const headers = new Headers(options.headers || {});
    if (this.auth) {
      headers.set("Authorization", `Basic ${this.auth}`);
    }
    log(`Fetching ${fullUrl}`);
    const response = await fetch(fullUrl, { ...options, headers });
    if (!response.ok) {
      let details = "";
      try {
        details = await response.text();
      } catch {
        // ignore
      }
      throw new Error(`Fetch failed: ${response.status} ${response.statusText} at ${fullUrl}${details ? ` - ${details}` : ""}`);
    }
    return response;
  }

  async getLibraries() {
    const response = await this.fetch("/interface-data/init");
    const data = await response.json();
    const libraries = data.library_info || data.library_map || {};

    const result: Record<string, { name: string; num_books?: number }> = {};
    for (const [id, info] of Object.entries(libraries)) {
      let name = typeof info === "string" ? info : ((info as any).name || id);
      let count = (typeof info === "object" && info !== null) ? (info as any).num_books : undefined;

      if (count === undefined && data.library_id === id && data.search_result) {
        count = data.search_result.num_books_without_search;
      }

      if (count !== undefined) {
        result[id] = { name, num_books: count };
      } else {
        try {
          const booksResp = await this.fetch(`/ajax/books/${id}?num=1`);
          const booksData = await booksResp.json();
          let fetchedCount = 0;
          if (booksData) {
            fetchedCount = booksData.total_num || booksData.count || 0;
            if (fetchedCount === 0 && booksData.book_ids) {
              fetchedCount = booksData.book_ids.length;
            }
          }
          result[id] = { name, num_books: fetchedCount };
        } catch {
          result[id] = { name };
        }
      }
    }
    return result;
  }

  async getBooks(libraryId: string, limit = 100, offset = 0, search = "") {
    let bookIds: number[] = [];
    let total = 0;

    if (search) {
      const url = `/ajax/search?query=${encodeURIComponent(search)}&library_id=${encodeURIComponent(libraryId)}&num=${limit}&offset=${offset}&sort=timestamp&sort_order=desc`;
      const response = await this.fetch(url);
      const data = await response.json();
      bookIds = data.book_ids || [];
      total = data.total_num;
    } else {
      const url = `/ajax/books/${encodeURIComponent(libraryId)}?num=${limit}&start=${offset}`;
      const response = await this.fetch(url);
      const data = await response.json();
      // In this case, Calibre returns an object with book data directly or under a 'metadata' key
      // Actually Calibre /ajax/books returns { book_ids: [...], metadata: { id: { ... } } }
      bookIds = data.book_ids || [];
      total = data.total_num || bookIds.length;
    }

    if (bookIds.length === 0) {
      return { books: [], total };
    }

    const metadataResponse = await this.fetch(`/ajax/books/${encodeURIComponent(libraryId)}?num=1000000&start=0`);
    const metadataData = await metadataResponse.json();
    const metadataMap = metadataData.metadata || metadataData;

    const books = bookIds.map(id => metadataMap[id] || { id });
    return { books, total };
  }

  async getBookMetadata(libraryId: string, bookId: number) {
    const response = await this.fetch(`/ajax/book/${bookId}/${libraryId}`);
    return await response.json();
  }

  async getBookFormats(libraryId: string, bookId: number) {
    const metadata = await this.getBookMetadata(libraryId, bookId);
    return metadata.formats as string[];
  }

  async downloadBook(libraryId: string, bookId: number, format: string) {
    const url = `/get/${format}/${bookId}/${libraryId}`;
    const response = await this.fetch(url);
    return await response.arrayBuffer();
  }

  async getBookCover(libraryId: string, bookId: number) {
    const url = `/get/cover/${bookId}/${libraryId}`;
    const response = await this.fetch(url);
    return await response.arrayBuffer();
  }

  async getEpubBuffer(libraryId: string, bookId: number) {
    const formats = await this.getBookFormats(libraryId, bookId);
    const epubFormat = formats.find(f => f.toUpperCase() === "EPUB");
    if (!epubFormat) throw new Error(`Book ${bookId} does not have an EPUB format`);
    return await this.downloadBook(libraryId, bookId, epubFormat);
  }

  async getEpubContents(libraryId: string, bookId: number) {
    const buffer = await this.getEpubBuffer(libraryId, bookId);
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(buffer)));
    const entries = await reader.getEntries();
    await reader.close();
    return entries.map(e => e.filename);
  }

  async getEpubFile(libraryId: string, bookId: number, filePath: string, responseType: "text" | "buffer" = "text") {
    const buffer = await this.getEpubBuffer(libraryId, bookId);
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(buffer)));
    const entries = await reader.getEntries();
    const file = entries.find(e => e.filename === filePath);
    if (!file || !("getData" in file)) {
      await reader.close();
      throw new Error(`File ${filePath} not found or is a directory in EPUB`);
    }
    let result;
    if (responseType === "buffer") {
      result = await file.getData(new Uint8ArrayWriter());
    } else {
      result = await file.getData(new TextWriter());
    }
    await reader.close();
    return result;
  }

  private _normalizePath(filePath: string) {
    const parts = filePath.split("/");
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "." || part === "") continue;
      if (part === "..") {
        if (stack.length > 0) stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join("/");
  }

  async getChapters(libraryId: string, bookId: number) {
    const buffer = await this.getEpubBuffer(libraryId, bookId);
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(buffer)));
    const entries = await reader.getEntries();

    const containerEntry = entries.find(e => e.filename === "META-INF/container.xml");
    if (!containerEntry || !("getData" in containerEntry)) {
      await reader.close();
      throw new Error("EPUB missing META-INF/container.xml or it is a directory");
    }
    const containerXml = await containerEntry.getData(new TextWriter());
    const fullPathMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!fullPathMatch) {
      await reader.close();
      throw new Error("Could not find root file in container.xml");
    }
    const opfPath = fullPathMatch[1];
    const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

    const opfEntry = entries.find(e => e.filename === opfPath);
    if (!opfEntry || !("getData" in opfEntry)) {
      await reader.close();
      throw new Error(`Could not find OPF file at ${opfPath} or it is a directory`);
    }
    const opfXml = await opfEntry.getData(new TextWriter());

    const manifest: Record<string, string> = {};
    const itemRegex = /<item\s+[^>]*href\s*=\s*"([^"]+)"[^>]*id\s*=\s*"([^"]+)"|<item\s+[^>]*id\s*=\s*"([^"]+)"[^>]*href\s*=\s*"([^"]+)"/gi;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
      const id = itemMatch[2] || itemMatch[3];
      const href = itemMatch[1] || itemMatch[4];
      let decodedHref = href;
      try { decodedHref = decodeURIComponent(href); } catch { /* ignore */ }
      manifest[id] = this._normalizePath(opfDir + decodedHref);
    }

    const spine: string[] = [];
    const spineRegex = /<itemref\s+[^>]*idref\s*=\s*"([^"]+)"/gi;
    let spineMatch;
    while ((spineMatch = spineRegex.exec(opfXml)) !== null) {
      const idref = spineMatch[1];
      if (manifest[idref]) {
        spine.push(manifest[idref]);
      }
    }

    const toc = await this.getTOCFromEntries(entries, opfXml, opfDir);
    const chapters = spine.map(path => {
      const tocEntry = toc.find(t => t.path === path);
      return {
        title: tocEntry ? tocEntry.title : path.split("/").pop(),
        path: path
      };
    });

    await reader.close();
    return chapters;
  }

  private async getTOCFromEntries(entries: any[], opfXml: string, opfDir: string) {
    const ncxMatch = opfXml.match(/id="([^"]+)"[^>]+media-type="application\/x-dtbncx\+xml"/i) || 
                     opfXml.match(/media-type="application\/x-dtbncx\+xml"[^>]+id="([^"]+)"/i);
    let toc: { title: string; path: string }[] = [];

    if (ncxMatch) {
      const ncxId = ncxMatch[1];
      const ncxHrefMatch = opfXml.match(new RegExp(`id="${ncxId}"[^>]+href="([^"]+)"`)) ||
                           opfXml.match(new RegExp(`href="([^"]+)"[^>]+id="${ncxId}"`));
      if (ncxHrefMatch) {
        const ncxPath = opfDir + ncxHrefMatch[1];
        const ncxEntry = entries.find(e => e.filename === ncxPath);
        if (ncxEntry && ("getData" in ncxEntry)) {
          const ncxXml = await ncxEntry.getData(new TextWriter());
          const navPointRegex = /<navPoint[^>]*>[\s\S]*?<navLabel>[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<\/navLabel>[\s\S]*?<content src="([^"]+)"/g;
          let match;
          while ((match = navPointRegex.exec(ncxXml)) !== null) {
            let label = match[1].trim();
            let href = match[2];
            if (href.includes("#")) href = href.split("#")[0];
            const fullPath = this._normalizePath(opfDir + href);
            if (!toc.find(t => t.path === fullPath)) {
              toc.push({ title: label, path: fullPath });
            }
          }
        }
      }
    }

    if (toc.length === 0) {
      const navMatch = opfXml.match(/properties="[^"]*nav[^"]*"[^>]+href="([^"]+)"/i) ||
                       opfXml.match(/href="([^"]+)"[^>]+properties="[^"]*nav[^"]*"/i);
      if (navMatch) {
        const navPath = this._normalizePath(opfDir + navMatch[1]);
        const navEntry = entries.find(e => e.filename === navPath);
        if (navEntry && ("getData" in navEntry)) {
          const navXml = await navEntry.getData(new TextWriter());
          const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
          let match;
          while ((match = linkRegex.exec(navXml)) !== null) {
            let href = match[1];
            if (href.includes("#")) href = href.split("#")[0];
            const fullPath = this._normalizePath(opfDir + href);
            const label = match[2].replace(/<[^>]+>/g, "").trim();
            if (!toc.find(t => t.path === fullPath)) {
              toc.push({ title: label, path: fullPath });
            }
          }
        }
      }
    }
    return toc;
  }

  async getChapterContent(libraryId: string, bookId: number, chapterPath: string): Promise<string> {
    const content = await this.getEpubFile(libraryId, bookId, chapterPath, "text");
    return content as string;
  }

  async getChapterContentMarkdown(libraryId: string, bookId: number, chapterPath: string) {
    const html = await this.getChapterContent(libraryId, bookId, chapterPath);
    return this.htmlToMarkdown(html);
  }

  htmlToMarkdown(html: string | null): string {
    if (!html) return "";
    
    let cleanHtml = html;
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      cleanHtml = bodyMatch[1];
    }
    
    cleanHtml = cleanHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    cleanHtml = cleanHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    
    let markdown = cleanHtml
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, (_, p1) => `\n## ${p1.replace(/<[^>]+>/g, "")}\n`)
      .replace(/<p[^>]*>(.*?)<\/p>/gi, (_, p1) => `\n${p1.replace(/<[^>]+>/g, "")}\n`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
      .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
      .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
      .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
      .replace(/<li[^>]*>(.*?)<\/li>/gi, "* $1\n")
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, "> $1\n");
    
    markdown = markdown.replace(/<[^>]+>/g, "");
    markdown = markdown.replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
    
    return markdown.trim();
  }

  async searchInBook(libraryId: string, bookId: number, query: string) {
    const chapters = await this.getChapters(libraryId, bookId);
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (const chapter of chapters) {
      const content = await this.getChapterContent(libraryId, bookId, chapter.path);
      const markdownContent = this.htmlToMarkdown(content);
      const lowerMarkdown = markdownContent.toLowerCase();

      let index = -1;
      while ((index = lowerMarkdown.indexOf(lowerQuery, index + 1)) !== -1) {
        const snippetWindow = 200;
        const start = Math.max(0, index - snippetWindow);
        const end = Math.min(markdownContent.length, index + query.length + snippetWindow);
        
        results.push({
          chapterTitle: chapter.title,
          chapterPath: chapter.path,
          markdownOffset: index,
          snippet: markdownContent.substring(start, end)
        });
        
        if (results.length >= 50) break; // Limit results
      }
      if (results.length >= 50) break;
    }
    return results;
  }

  async renderChapterPage(libraryId: string, bookId: number, chapterPath: string, pageNumber = 1, width = 800, height = 1000) {
    const buffer = await this.getEpubBuffer(libraryId, bookId);
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(buffer)));
    const entries = await reader.getEntries();

    const controller = new AbortController();
    const server = Deno.serve({
      port: 0,
      signal: controller.signal,
      onListen: () => {},
    }, async (req) => {
      const url = new URL(req.url);
      const filePath = decodeURIComponent(url.pathname.slice(1));
      const entry = entries.find(e => this._normalizePath(e.filename) === this._normalizePath(filePath));
      
      if (entry && ("getData" in entry)) {
        const content = await entry.getData(new Uint8ArrayWriter());
        let contentType = "application/octet-stream";
        if (filePath.endsWith(".html") || filePath.endsWith(".htm")) contentType = "text/html";
        else if (filePath.endsWith(".css")) contentType = "text/css";
        else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) contentType = "image/jpeg";
        else if (filePath.endsWith(".png")) contentType = "image/png";
        else if (filePath.endsWith(".gif")) contentType = "image/gif";
        else if (filePath.endsWith(".svg")) contentType = "image/svg+xml";

        return new Response(content, {
          headers: { "Content-Type": contentType }
        });
      }
      return new Response("Not found", { status: 404 });
    });

    try {
      const { port } = server.addr;
      const browser = await launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
        headless: true,
      });

      try {
        const page = await browser.newPage();
        await page.setViewportSize({ width, height });
        
        const url = `http://localhost:${port}/${chapterPath}`;
        log(`Rendering page ${pageNumber} of ${url}`);
        
        await page.goto(url, { waitUntil: "networkidle0" });
        
        const totalPages = await page.evaluate((h) => {
          return Math.ceil((globalThis as any).document.documentElement.scrollHeight / h) || 1;
        }, { args: [height] });

        if (pageNumber > 1) {
          await page.evaluate(({ n, h }) => {
            (globalThis as any).window.scrollTo(0, (n - 1) * h);
          }, { args: [{ n: pageNumber, h: height }] });
          
          // Wait a bit for scroll and any lazy loading
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const screenshot = await page.screenshot();
        
        return {
          buffer: screenshot,
          totalPages
        };
      } finally {
        await browser.close();
      }
    } finally {
      controller.abort();
      await server.finished;
    }
  }
}
