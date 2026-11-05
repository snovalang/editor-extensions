#!/usr/bin/env node
// Stand-in snova-lsp for hosts that cannot execute the committed binary.
// Speaks the same stdio framing and advertises the capabilities src/main.c returns.
import { createWriteStream } from "node:fs";

const logPath = process.argv.includes("--log") ? process.argv[process.argv.indexOf("--log") + 1] : "";
const log = logPath ? createWriteStream(logPath, { flags: "a" }) : null;
if (log) log.write("snova-lsp started\n");

const CAPABILITIES = {
  textDocumentSync: 1,
  hoverProvider: true,
  signatureHelpProvider: true,
  definitionProvider: true,
  referencesProvider: true,
  implementationProvider: true,
  semanticTokensProvider: {
    legend: {
      tokenTypes: [
        "namespace", "type", "class", "enum", "interface", "struct", "typeParameter",
        "parameter", "variable", "property", "enumMember", "event", "function", "method",
        "macro", "keyword", "modifier", "comment", "string", "number", "regexp",
        "operator", "decorator",
      ],
      tokenModifiers: [],
    },
    full: true,
    range: false,
  },
  documentSymbolProvider: true,
  codeActionProvider: true,
  completionProvider: { resolveProvider: false, triggerCharacters: [".", ":", "@"] },
};

function write(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const match = /content-length:\s*(\d+)/i.exec(header);
    if (!match) {
      process.exit(1);
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const raw = buffer.subarray(start, start + length).toString("utf8");
    buffer = buffer.subarray(start + length);
    handle(JSON.parse(raw));
  }
});

function handle(message) {
  const method = message.method || "";
  if (method === "initialize") {
    if (message.params && message.params.initializationOptions) {
      process.stderr.write("fake snova-lsp: unexpected initializationOptions\n");
      process.exit(2);
    }
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: { capabilities: CAPABILITIES, serverInfo: { name: "snova-lsp", version: "fake" } },
    });
    return;
  }
  if (method === "initialized" || method === "exit") {
    if (method === "exit") process.exit(0);
    return;
  }
  if (method === "textDocument/didOpen") {
    const doc = message.params.textDocument;
    if (doc.languageId !== "snova" && doc.languageId !== "snova-manifest") {
      process.stderr.write(`fake snova-lsp: unexpected languageId ${doc.languageId}\n`);
      process.exit(2);
    }
    write({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: doc.uri, version: doc.version, diagnostics: [] },
    });
    return;
  }
  if (method === "textDocument/didChange") {
    const change = message.params.contentChanges.at(-1);
    if (!change || typeof change.text !== "string" || Object.prototype.hasOwnProperty.call(change, "range")) {
      process.stderr.write("fake snova-lsp: didChange must be a full document\n");
      process.exit(2);
    }
    return;
  }
  if (message.id === undefined) return;
  if (method === "textDocument/completion") {
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: { isIncomplete: false, items: [{ label: "hello", kind: 3 }] },
    });
    return;
  }
  if (method === "textDocument/hover") {
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: { contents: { kind: "markdown", value: "```snova\nfunc hello(): int\n```" } },
    });
    return;
  }
  if (method === "shutdown") {
    write({ jsonrpc: "2.0", id: message.id, result: null });
    return;
  }
  write({ jsonrpc: "2.0", id: message.id, result: method === "textDocument/definition" ? null : [] });
}

process.stdin.on("end", () => process.exit(0));
