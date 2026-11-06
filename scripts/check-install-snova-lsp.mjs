import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = path.join(root, "scripts/install-snova-lsp.sh");
const linuxBin = path.join(root, "vscode/server/snova-lsp");
const windowsBin = path.join(root, "vscode/server/snova-lsp.exe");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function run(env, expectStatus) {
  const result = spawnSync("sh", [installer], { env: { ...process.env, ...env }, encoding: "utf8" });
  if (result.status !== expectStatus) {
    fail(`install-snova-lsp.sh exited ${result.status}, want ${expectStatus}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

const home = mkdtempSync(path.join(tmpdir(), "snova-install-"));
const prefix = path.join(home, ".local");
try {
  run(
    {
      HOME: home,
      PREFIX: prefix,
      SNOVA_LSP_BIN: linuxBin,
      SNOVA_LSP_NO_BUILD: "1",
    },
    0,
  );
  const installed = path.join(prefix, "bin/snova-lsp");
  assert(existsSync(installed), "installer writes ~/.local/bin/snova-lsp");
  assert((lstatSync(installed).mode & 0o111) !== 0, "installed snova-lsp is executable");
  const link = path.join(prefix, "bin/snovalang-lsp");
  assert(lstatSync(link).isSymbolicLink(), "make install alias snovalang-lsp");
  assert(readlinkSync(link) === "snova-lsp", "alias points at snova-lsp");
  run(
    {
      HOME: home,
      PREFIX: prefix,
      SNOVA_LSP_BIN: linuxBin,
      SNOVA_LSP_NO_BUILD: "1",
    },
    0,
  );

  const wrong = mkdtempSync(path.join(tmpdir(), "snova-wrong-"));
  const rejected = run(
    {
      HOME: wrong,
      PREFIX: path.join(wrong, ".local"),
      SNOVA_LSP_BIN: windowsBin,
      SNOVA_LSP_NO_BUILD: "1",
    },
    1,
  );
  assert(rejected.stderr.includes("does not match"), "wrong-host binary is refused");
  assert(!existsSync(path.join(wrong, ".local/bin/snova-lsp")), "refused binary is not installed");
  rmSync(wrong, { recursive: true, force: true });

  const bundleHome = mkdtempSync(path.join(tmpdir(), "snova-bundle-"));
  const bundle = path.join(bundleHome, "bundle");
  mkdirSync(bundle, { recursive: true });
  copyFileSync(linuxBin, path.join(bundle, "snova-lsp"));
  chmodSync(path.join(bundle, "snova-lsp"), 0o755);
  const bundlePrefix = path.join(bundleHome, "prefix");
  run(
    {
      HOME: bundleHome,
      PREFIX: bundlePrefix,
      SNOVA_LSP_BUNDLE_DIR: bundle,
      SNOVA_LSP_NO_BUILD: "1",
    },
    0,
  );
  assert(existsSync(path.join(bundlePrefix, "bin/snova-lsp")), "bundle directory installs the host binary");
  rmSync(bundleHome, { recursive: true, force: true });
} finally {
  rmSync(home, { recursive: true, force: true });
}

function runScript(script, env) {
  const result = spawnSync("sh", [path.join(root, script)], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`${script} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

const editorHome = mkdtempSync(path.join(tmpdir(), "snova-editor-"));
try {
  const binDir = path.join(editorHome, "bin");
  mkdirSync(binDir, { recursive: true });
  const codeLog = path.join(editorHome, "code-args");
  const code = path.join(binDir, "code");
  writeFileSync(code, `#!/bin/sh\nprintf '%s\\n' "$@" > "${codeLog}"\nexit 0\n`);
  chmodSync(code, 0o755);

  const vsixDir = mkdtempSync(path.join(tmpdir(), "snova-vsix-"));
  const vsix = path.join(vsixDir, "snovalang.vsix");
  const packed = spawnSync(
    "python3",
    [
      "-c",
      "import sys, zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.write(sys.argv[2], 'extension/server/snova-lsp'); z.close()",
      vsix,
      linuxBin,
    ],
    { encoding: "utf8" },
  );
  if (packed.status !== 0) fail(packed.stderr || "could not build a test vsix");

  runScript("install-vscode.sh", {
    HOME: editorHome,
    PATH: `${binDir}:${process.env.PATH}`,
    SNOVA_VSCODE_VSIX_URL: `file://${vsix}`,
    VSCODE_CLI: code,
  });
  assert(existsSync(path.join(editorHome, ".local/bin/snova-lsp")), "install-vscode.sh copies snova-lsp");
  assert(readFileSync(codeLog, "utf8").includes("--install-extension"), "install-vscode.sh still installs the VSIX");
  rmSync(vsixDir, { recursive: true, force: true });

  const zedHome = path.join(editorHome, "zed-home");
  mkdirSync(zedHome, { recursive: true });
  const archiveDir = mkdtempSync(path.join(tmpdir(), "snova-zed-"));
  const payload = path.join(archiveDir, "snovalang");
  mkdirSync(path.join(payload, "server"), { recursive: true });
  mkdirSync(path.join(payload, "grammars"), { recursive: true });
  mkdirSync(path.join(payload, "languages/snovalang"), { recursive: true });
  mkdirSync(path.join(payload, "languages/snovalang_manifest"), { recursive: true });
  writeFileSync(path.join(payload, "extension.toml"), 'id = "snovalang"\n');
  writeFileSync(path.join(payload, "extension.wasm"), "wasm");
  writeFileSync(path.join(payload, "grammars/snovalang.wasm"), "wasm");
  writeFileSync(path.join(payload, "grammars/snovalang_manifest.wasm"), "wasm");
  writeFileSync(path.join(payload, "languages/snovalang/config.toml"), 'name = "Snovalang"\n');
  writeFileSync(path.join(payload, "languages/snovalang_manifest/config.toml"), 'name = "Snovalang Manifest"\n');
  copyFileSync(linuxBin, path.join(payload, "server/snova-lsp"));
  chmodSync(path.join(payload, "server/snova-lsp"), 0o755);
  const archive = path.join(archiveDir, "snovalang-zed.tar.gz");
  const tar = spawnSync("tar", ["-czf", archive, "-C", archiveDir, "snovalang"], { encoding: "utf8" });
  if (tar.status !== 0) fail(tar.stderr || "could not build a test zed archive");

  runScript("install-zed.sh", {
    HOME: zedHome,
    XDG_DATA_HOME: path.join(zedHome, "data"),
    SNOVA_ZED_URL: `file://${archive}`,
  });
  const installedExt = path.join(zedHome, "data/zed/extensions/installed/snovalang");
  assert(existsSync(path.join(installedExt, "extension.toml")), "install-zed.sh installs the extension");
  assert(existsSync(path.join(installedExt, "server/snova-lsp")), "install-zed.sh keeps the server in the extension");
  assert(existsSync(path.join(zedHome, ".local/bin/snova-lsp")), "install-zed.sh copies snova-lsp to ~/.local/bin");
  rmSync(archiveDir, { recursive: true, force: true });
} finally {
  rmSync(editorHome, { recursive: true, force: true });
}

console.log("install checks passed");
