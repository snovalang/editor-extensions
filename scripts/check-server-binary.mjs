import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {
  bundledServerFileName,
  chooseServerBinary,
  executableKind,
  headerMatchesHost,
  SERVER_HEADER_BYTES,
} = require(path.join(root, "vscode/out/serverBinary.js"));
const { documentSelector, serverLaunch, serverSearchPaths } = require(path.join(root, "vscode/out/lspContract.js"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const elf = Uint8Array.of(0x7f, 0x45, 0x4c, 0x46);
const pe = Uint8Array.of(0x4d, 0x5a, 0x90, 0x00);
const machoLe64 = Uint8Array.of(0xcf, 0xfa, 0xed, 0xfe);
const machoFat = Uint8Array.of(0xca, 0xfe, 0xba, 0xbe);

assert(bundledServerFileName("darwin") === "snova-lsp-darwin", "darwin bundle name");
assert(bundledServerFileName("linux") === "snova-lsp", "linux bundle name");
assert(bundledServerFileName("win32") === "snova-lsp.exe", "windows bundle name");

assert(executableKind(elf) === "elf", "elf magic");
assert(executableKind(pe) === "pe", "pe magic");
assert(executableKind(machoLe64) === "macho", "mach-o le64 magic");
assert(executableKind(machoFat) === "macho", "mach-o fat magic");

assert(headerMatchesHost("darwin", machoFat), "darwin accepts fat mach-o");
assert(headerMatchesHost("darwin", machoLe64), "darwin accepts thin mach-o");
assert(!headerMatchesHost("darwin", elf), "darwin rejects elf");
assert(!headerMatchesHost("darwin", pe), "darwin rejects pe");
assert(headerMatchesHost("linux", elf) && !headerMatchesHost("linux", machoFat), "linux accepts only elf");
assert(headerMatchesHost("win32", pe) && !headerMatchesHost("win32", elf), "windows accepts only pe");

assert(
  chooseServerBinary("darwin", [
    { path: "server/snova-lsp", header: elf },
    { path: "server/snova-lsp.exe", header: pe },
  ]) === null,
  "darwin must not spawn elf or exe",
);
assert(
  chooseServerBinary("darwin", [
    { path: "server/snova-lsp", header: elf },
    { path: "server/snova-lsp-darwin", header: machoFat },
  ]) === "server/snova-lsp-darwin",
  "darwin selects the mach-o bundle",
);

const shipped = [
  ["snova-lsp-darwin", "macho"],
  ["snova-lsp", "elf"],
  ["snova-lsp.exe", "pe"],
];
for (const [name, kind] of shipped) {
  const header = readFileSync(path.join(root, "vscode/server", name)).subarray(0, 4);
  assert(executableKind(header) === kind, `${name} header is ${executableKind(header)}, expected ${kind}`);
}

const linuxHeader = readFileSync(path.join(root, "vscode/server/snova-lsp")).subarray(0, SERVER_HEADER_BYTES);
const windowsHeader = readFileSync(path.join(root, "vscode/server/snova-lsp.exe")).subarray(0, SERVER_HEADER_BYTES);
const darwinHeader = readFileSync(path.join(root, "vscode/server/snova-lsp-darwin")).subarray(0, SERVER_HEADER_BYTES);
assert(headerMatchesHost("linux", linuxHeader, "x64"), "shipped elf is linux x64");
assert(!headerMatchesHost("linux", linuxHeader, "arm64"), "shipped elf is not arm64");
assert(!headerMatchesHost("darwin", linuxHeader, "x64"), "darwin rejects the shipped elf");
assert(headerMatchesHost("win32", windowsHeader, "x64"), "shipped exe is windows x64");
assert(!headerMatchesHost("win32", windowsHeader, "arm64"), "shipped exe is not arm64");
assert(headerMatchesHost("darwin", darwinHeader, "arm64"), "universal macho runs on arm64");
assert(headerMatchesHost("darwin", darwinHeader, "x64"), "universal macho runs on x64");
assert(!headerMatchesHost("linux", darwinHeader, "x64"), "linux rejects the universal macho");

const linuxPaths = serverSearchPaths({
  extensionPath: "/ext",
  home: "/home/u",
  localAppData: "",
  workspaceRoots: ["/work"],
  host: "linux",
});
assert(linuxPaths[0] === "/ext/server/snova-lsp", "bundled linux binary is first");
assert(linuxPaths[1] === "/home/u/.local/bin/snova-lsp", "make install directory is second");
assert(linuxPaths[2] === "/home/u/.local/bin/snovalang-lsp", "make install alias is third");
assert(linuxPaths[3] === "/home/u/.snova/bin/snova-lsp", "legacy install directory stays available");
assert(linuxPaths.includes("/work/build/snova-lsp"), "workspace build output is searched");

const darwinPaths = serverSearchPaths({
  extensionPath: "/ext",
  home: "/Users/u",
  localAppData: "",
  workspaceRoots: [],
  host: "darwin",
});
assert(darwinPaths[0] === "/ext/server/snova-lsp-darwin", "darwin bundle name is first");
assert(darwinPaths[1] === "/ext/server/snova-lsp", "plain name is the make install fallback");

assert(JSON.stringify(serverLaunch().args) === "[]", "stdio needs no arguments");
assert(
  JSON.stringify(serverLaunch("/tmp/snova-lsp.log").args) === JSON.stringify(["--log", "/tmp/snova-lsp.log"]),
  "trace uses the documented --log flag",
);
assert(!serverLaunch("/tmp/snova-lsp.log").args.includes("--stdio"), "stdio is the transport, not a flag");
const selector = documentSelector();
assert(selector.length === 2, "two document selectors");
assert(selector[0].language === "snova" && selector[0].scheme === "file", "source language id");
assert(selector[1].language === "snova-manifest" && selector[1].scheme === "file", "manifest language id");

console.log("server binary checks passed");
