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
} = require(path.join(root, "vscode/out/serverBinary.js"));

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

console.log("server binary checks passed");
