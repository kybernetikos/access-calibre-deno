
import { TextLineStream } from "jsr:@std/streams@^1.0.17/text-line-stream";
import { log, error } from "./logger.ts";

export type McpRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
};

export type McpResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: any;
};

export type McpNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: any;
};

export class McpServer {
  private handlers: Map<string, (params: any) => Promise<any>> = new Map();
  private name: string;
  private version: string;

  constructor(info: { name: string; version: string }, options?: any) {
    this.name = info.name;
    this.version = info.version;
  }

  setRequestHandler(schema: { method: string } | string, handler: (params: any) => Promise<any>) {
    const method = typeof schema === "string" ? schema : schema.method;
    this.handlers.set(method, handler);
  }

  async start() {
    const lineStream = Deno.stdin.readable
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream());

    for await (const line of lineStream) {
      if (!line.trim()) continue;
      try {
        log(`Received message: ${line}`);
        const message = JSON.parse(line);
        if (message.method && message.id !== undefined) {
          // Request
          if (message.method === "initialize") {
            this.sendResponse(message.id, {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: {},
                prompts: {}
              },
              serverInfo: {
                name: this.name,
                version: this.version
              }
            });
            continue;
          }

          const handler = this.handlers.get(message.method);
          if (handler) {
            try {
              const result = await handler(message);
              this.sendResponse(message.id, result);
            } catch (err: any) {
              if (err instanceof McpError) {
                error(`MCP Error handling method ${message.method}`, { code: err.code, message: err.message });
                this.sendError(message.id, err.code, err.message);
              } else {
                error(`Unexpected error handling method ${message.method}`, err);
                this.sendError(message.id, ErrorCode.InternalError, err.message);
              }
            }
          } else {
            this.sendError(message.id, -32601, `Method not found: ${message.method}`);
          }
        } else if (message.method) {
          // Notification
          if (message.method === "notifications/initialized") {
             // Ignore
          }
        }
      } catch (e) {
        error(`Failed to parse or handle message: ${line}`, e);
      }
    }
  }

  private sendResponse(id: string | number, result: any) {
    const response: McpResponse = {
      jsonrpc: "2.0",
      id,
      result
    };
    this.sendMessage(response);
  }

  private sendError(id: string | number, code: number, message: string) {
    const response: McpResponse = {
      jsonrpc: "2.0",
      id,
      error: { code, message }
    };
    this.sendMessage(response);
  }

  private sendMessage(message: any) {
    const json = JSON.stringify(message);
    log(`Sending message: ${json}`);
    Deno.stdout.writeSync(new TextEncoder().encode(json + "\n"));
  }
}

// Schemas to mimic the SDK
export const ListToolsRequestSchema = { method: "tools/list" };
export const CallToolRequestSchema = { method: "tools/call" };
export const ListPromptsRequestSchema = { method: "prompts/list" };
export const GetPromptRequestSchema = { method: "prompts/get" };

export enum ErrorCode {
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
}

export class McpError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
