import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { serverLaunch, SOURCE_LANGUAGE_ID } = require(path.join(root, "vscode/out/lspContract.js"));
const { bundledServerFileName, headerMatchesHost, serverHost } = require(path.join(root, "vscode/out/serverBinary.js"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function frame(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"), body]);
}

function readMessages(child) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const messages = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after ${messages.length} messages`));
    }, 4000);
    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;
        const header = buffer.subarray(0, headerEnd).toString("utf8");
        const match = /content-length:\s*(\d+)/i.exec(header);
        if (!match) {
          clearTimeout(timer);
          reject(new Error(`missing Content-Length in ${header}`));
          return;
        }
        const length = Number(match[1]);
        const start = headerEnd + 4;
        if (buffer.length < start + length) return;
        messages.push(JSON.parse(buffer.subarray(start, start + length).toString("utf8")));
        buffer = buffer.subarray(start + length);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`server exited ${code}`));
      else resolve(messages);
    });
  });
}

const sample = "package demo\n\nfunc hello(): int {\n    return 1\n}\n";
const changed = `${sample}// edited\n`;
const uri = "file:///tmp/demo/main.snl";

function requests(idBase) {
  return [
    {
      jsonrpc: "2.0",
      id: idBase,
      method: "initialize",
      params: {
        processId: process.pid,
        rootUri: "file:///tmp/demo",
        capabilities: {},
        workspaceFolders: [{ uri: "file:///tmp/demo", name: "demo" }],
      },
    },
    { jsonrpc: "2.0", method: "initialized", params: {} },
    {
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: { textDocument: { uri, languageId: SOURCE_LANGUAGE_ID, version: 1, text: sample } },
    },
    {
      jsonrpc: "2.0",
      method: "textDocument/didChange",
      params: {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: changed }],
      },
    },
    {
      jsonrpc: "2.0",
      id: idBase + 1,
      method: "textDocument/completion",
      params: { textDocument: { uri }, position: { line: 3, character: 4 } },
    },
    {
      jsonrpc: "2.0",
      id: idBase + 2,
      method: "textDocument/hover",
      params: { textDocument: { uri }, position: { line: 2, character: 5 } },
    },
    {
      jsonrpc: "2.0",
      id: idBase + 3,
      method: "textDocument/definition",
      params: { textDocument: { uri }, position: { line: 2, character: 5 } },
    },
    {
      jsonrpc: "2.0",
      id: idBase + 4,
      method: "textDocument/references",
      params: { textDocument: { uri }, position: { line: 2, character: 5 }, context: { includeDeclaration: true } },
    },
    {
      jsonrpc: "2.0",
      id: idBase + 5,
      method: "textDocument/documentSymbol",
      params: { textDocument: { uri } },
    },
    {
      jsonrpc: "2.0",
      id: idBase + 6,
      method: "textDocument/signatureHelp",
      params: { textDocument: { uri }, position: { line: 3, character: 4 } },
    },
    {
      jsonrpc: "2.0",
      id: idBase + 7,
      method: "textDocument/codeAction",
      params: {
        textDocument: { uri },
        range: { start: { line: 2, character: 5 }, end: { line: 2, character: 10 } },
        context: { diagnostics: [] },
      },
    },
    { jsonrpc: "2.0", id: idBase + 8, method: "shutdown", params: null },
    { jsonrpc: "2.0", method: "exit" },
  ];
}

function assertSession(messages, label) {
  const init = messages.find((message) => message.id === 1 || message.id === 100);
  assert(init && init.result && init.result.serverInfo.name === "snova-lsp", `${label} initialize`);
  const caps = init.result.capabilities;
  assert(caps.textDocumentSync === 1, `${label} full sync`);
  assert(caps.hoverProvider === true, `${label} hover`);
  assert(caps.definitionProvider === true, `${label} definition`);
  assert(caps.referencesProvider === true, `${label} references`);
  assert(caps.documentSymbolProvider === true, `${label} symbols`);
  assert(caps.signatureHelpProvider === true, `${label} signature`);
  assert(caps.implementationProvider === true, `${label} implementation`);
  assert(caps.codeActionProvider === true, `${label} code action`);
  assert(caps.completionProvider.resolveProvider === false, `${label} completion resolve`);
  assert(
    JSON.stringify(caps.completionProvider.triggerCharacters) === JSON.stringify([".", ":", "@"]),
    `${label} completion triggers`,
  );
  assert(caps.semanticTokensProvider.full === true && caps.semanticTokensProvider.range === false, `${label} tokens`);
  const completion = messages.find((message) => message.id === init.id + 1);
  assert(completion && Array.isArray(completion.result.items), `${label} completion items`);
  const hover = messages.find((message) => message.id === init.id + 2);
  assert(hover && hover.result && hover.result.contents, `${label} hover result`);
  const definition = messages.find((message) => message.id === init.id + 3);
  assert(definition && Object.prototype.hasOwnProperty.call(definition, "result"), `${label} definition result`);
  assert(messages.some((message) => message.method === "textDocument/publishDiagnostics"), `${label} diagnostics`);
}

function runSession(command, args, idBase) {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
  const done = readMessages(child);
  for (const message of requests(idBase)) child.stdin.write(frame(message));
  child.stdin.end();
  return done.then((messages) => {
    assertSession(messages, command);
    return messages;
  });
}

const extension = readFileSync(path.join(root, "vscode/out/extension.js"), "utf8");
assert(!extension.includes("--stdio"), "extension does not pass --stdio");
assert(!extension.includes("createFileSystemWatcher"), "extension does not watch files the server ignores");
assert(!extension.includes("deepCompletion"), "extension does not send unused completion options");
assert(extension.includes("progressOnInitialization"), "server startup reports progress without blocking activation");
assert(extension.includes(SOURCE_LANGUAGE_ID), "extension selects the snova language");

const zed = readFileSync(path.join(root, "zed/src/lib.rs"), "utf8");
const installs = [
  "scripts/install-snova-lsp.sh",
  "scripts/install-snova-lsp.ps1",
  "install_ide.sh",
  "install_ide.ps1",
].map((file) => readFileSync(path.join(root, file), "utf8")).join("\n");
for (const source of [zed, installs, extension]) {
  assert(!source.includes("supernovalang/snova-lsp"), "clients use snovalang/snova-lsp");
}
assert(zed.includes("https://github.com/snovalang/snova-lsp.git"), "zed clones snovalang/snova-lsp");
assert(zed.includes("fn server_arguments() -> Vec<String> {\n    Vec::new()\n}"), "zed passes no extra arguments");
assert(installs.includes("https://github.com/snovalang/snova-lsp.git"), "installer clones snovalang/snova-lsp");
assert(installs.includes(".local"), "installer uses the make install prefix");

const host = serverHost(process.platform);
const bundledName = bundledServerFileName(host);
const bundled = path.join(root, "vscode/server", bundledName);
const header = readFileSync(bundled).subarray(0, 256);
const runnable = headerMatchesHost(host, header, process.arch);

const fake = path.join(root, "scripts/fake-snova-lsp.mjs");
await runSession(process.execPath, [fake], 1);
console.log("lsp session: fake server scripts/fake-snova-lsp.mjs");

if (runnable) {
  const dir = mkdtempSync(path.join(tmpdir(), "snova-lsp-"));
  const logFile = path.join(dir, "snova-lsp.log");
  await runSession(bundled, serverLaunch(logFile).args, 100);
  assert(existsSync(logFile), "snova-lsp --log creates the log file");
  console.log(`lsp session: local binary ${bundled}`);
} else {
  console.log(`lsp session: skipped ${bundled} (header does not match ${process.platform}/${process.arch})`);
}
