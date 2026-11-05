import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  documentedInstallDir,
  installedBinaryName,
  LSP_REPOSITORY,
  serverSearchPaths,
  SNOVAC_REPOSITORY,
} from "./lspContract";
import {
  chooseServerBinary,
  headerMatchesHost,
  SERVER_HEADER_BYTES,
  serverArch,
  serverHost,
  type ServerCandidate,
  type ServerHost,
} from "./serverBinary";

export interface ServerLog {
  appendLine(line: string): void;
  append(text: string): void;
}

export interface EnsureServerOptions {
  extensionPath: string;
  workspaceRoots: string[];
  configuredPath: string;
  autoInstall: boolean;
  force: boolean;
  log: ServerLog;
  onBuild: (work: (progress: (message: string) => void) => Promise<string>) => PromiseLike<string>;
}

export const HOST_MISS =
  "Snovalang could not find a snova-lsp binary for this system. Looked for the server shipped with the extension, ~/.local/bin/snova-lsp from make install, and ~/.snova/bin/snova-lsp. On macOS the extension starts a universal Mach-O binary and does not launch the Linux or Windows binary.";

export function canonicalPath(file: string): string | undefined {
  if (!file) return undefined;
  const resolved = path.resolve(file);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    if (!path.isAbsolute(resolved)) return undefined;
    if (resolved.includes(`${path.sep}..${path.sep}`) || resolved.startsWith(`..${path.sep}`)) return undefined;
    return resolved;
  }
}

function existingFile(file: string): string | undefined {
  if (!file) return undefined;
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined;
  } catch {
    return undefined;
  }
  return canonicalPath(file);
}

export function readHeader(filePath: string): Uint8Array | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(SERVER_HEADER_BYTES);
    const read = fs.readSync(fd, header, 0, SERVER_HEADER_BYTES, 0);
    return read >= 4 ? header.subarray(0, read) : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

function commandOnPath(name: string): string | undefined {
  const pathEnv = process.env.PATH || "";
  const sep = path.delimiter;
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    const base = path.join(dir, name);
    const tries = name.toLowerCase().endsWith(".exe") ? [base] : exts.map((ext) => base + ext.toLowerCase());
    if (process.platform !== "win32") tries.unshift(base);
    for (const candidate of tries) {
      const found = existingFile(candidate);
      if (found) return found;
    }
  }
  return undefined;
}

function ancestorRoots(start: string): string[] {
  const roots: string[] = [];
  let dir = start;
  for (let i = 0; i < 6 && dir; i++) {
    roots.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return roots;
}

function isLspCheckout(dir: string): boolean {
  return fs.existsSync(path.join(dir, "Makefile")) && fs.existsSync(path.join(dir, "src", "lsp_transport.c"));
}

function findLspCheckout(extraRoots: string[]): string | undefined {
  const seen = new Set<string>();
  for (const root of extraRoots) {
    if (!root) continue;
    for (const dir of ancestorRoots(root)) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      if (isLspCheckout(dir)) return canonicalPath(dir) ?? path.resolve(dir);
      const sibling = path.resolve(dir, "snova-lsp");
      if (isLspCheckout(sibling)) return canonicalPath(sibling) ?? sibling;
    }
  }
  return undefined;
}

function builtBinary(dir: string, host: ServerHost): string | undefined {
  const name = installedBinaryName(host);
  const names = [path.join(dir, "tools", "bin", name), path.join(dir, "build", name)];
  for (const candidate of names) {
    const found = existingFile(candidate);
    if (found) return found;
  }
  return undefined;
}

function runCmd(command: string, args: string[], cwd: string, log: ServerLog): Promise<void> {
  return new Promise((resolve, reject) => {
    log.appendLine(`$ ${command} ${args.join(" ")}`);
    const child = spawn(command, args, { cwd, env: process.env, windowsHide: true });
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => log.append(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      err += text;
      log.append(text);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}\n${err.trim().slice(-1600)}`));
    });
  });
}

async function runMake(dir: string, log: ServerLog): Promise<void> {
  const commands = process.platform === "win32" ? ["make", "mingw32-make"] : ["make"];
  let last: Error | undefined;
  for (const command of commands) {
    try {
      await runCmd(command, ["-C", dir, "all"], dir, log);
      return;
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error));
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      if (!missing) throw last;
    }
  }
  throw last ?? new Error("make was not found. Install GNU make and a C11 compiler (clang or gcc).");
}

async function ensureSnovac(checkout: string, log: ServerLog): Promise<string> {
  const sibling = path.join(path.dirname(checkout), "snovac");
  if (fs.existsSync(path.join(sibling, "Makefile"))) return sibling;
  log.appendLine(`Cloning snovac next to ${checkout}`);
  await runCmd("git", ["clone", "--depth", "1", SNOVAC_REPOSITORY, sibling], path.dirname(checkout), log);
  return sibling;
}

async function cloneLsp(log: ServerLog): Promise<string> {
  const root = path.join(os.homedir(), ".cache", "snova", "src");
  fs.mkdirSync(root, { recursive: true });
  const dir = path.join(root, "snova-lsp");
  if (!isLspCheckout(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    try {
      await runCmd("git", ["clone", "--depth", "1", LSP_REPOSITORY, "snova-lsp"], root, log);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not clone ${LSP_REPOSITORY}. Install git, or place snova-lsp in ~/.local/bin. ${message}`,
      );
    }
  }
  return canonicalPath(dir) ?? dir;
}

function headerOk(file: string, host: ServerHost, arch: string): boolean {
  const header = readHeader(file);
  return !!header && headerMatchesHost(host, header, arch);
}

function publishBinary(built: string, host: ServerHost, arch: string): string {
  const destDir = documentedInstallDir(os.homedir());
  fs.mkdirSync(destDir, { recursive: true });
  const destName = installedBinaryName(host);
  const dest = path.join(destDir, destName);
  fs.copyFileSync(built, dest);
  if (process.platform !== "win32") {
    fs.chmodSync(dest, 0o755);
    const link = path.join(destDir, "snovalang-lsp");
    try {
      fs.unlinkSync(link);
    } catch {
      // The symlink is created below.
    }
    try {
      fs.symlinkSync(destName, link);
    } catch {
      // A directory that is not writable for links still has the real binary.
    }
  }
  const found = existingFile(dest);
  if (!found || !headerOk(found, host, arch)) {
    throw new Error(HOST_MISS);
  }
  return found;
}

async function ensureUserPath(dir: string, log: ServerLog): Promise<void> {
  if (process.platform === "win32") {
    const literal = dir.replace(/'/g, "''");
    const script = [
      `$dir = '${literal}'`,
      "$userPath = [Environment]::GetEnvironmentVariable('PATH','User')",
      "$entries = @()",
      "if ($userPath) { $entries = @($userPath -split ';' | Where-Object { $_ }) }",
      "if ($entries -notcontains $dir) {",
      "  [Environment]::SetEnvironmentVariable('PATH', (($entries + $dir) -join ';'), 'User')",
      "}",
    ].join("; ");
    await runCmd("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], os.homedir(), log);
    return;
  }
  const rc = ["profile", "bashrc", "zshrc"]
    .map((name) => path.join(os.homedir(), "." + name))
    .find((file) => fs.existsSync(file));
  if (!rc) return;
  const text = fs.readFileSync(rc, "utf8");
  const line = `export PATH="$PATH:${dir}"`;
  if (text.includes(dir)) return;
  fs.appendFileSync(rc, `\n${line}\n`);
  log.appendLine(`Added ${dir} to PATH in ${rc}`);
}

async function makeInstall(log: ServerLog, host: ServerHost, arch: string, roots: string[]): Promise<string> {
  const checkout = findLspCheckout(roots) ?? (await cloneLsp(log));
  log.appendLine(`Building ${checkout}`);
  const snovac = await ensureSnovac(checkout, log);
  const prefix = path.join(os.homedir(), ".local");
  if (process.platform === "win32") {
    await runMake(checkout, log);
    const built = builtBinary(checkout, host);
    if (!built) throw new Error("The build finished without producing snova-lsp.");
    const dest = publishBinary(built, host, arch);
    try {
      await ensureUserPath(path.dirname(dest), log);
    } catch (error) {
      log.appendLine(`PATH was not updated: ${error instanceof Error ? error.message : String(error)}`);
    }
    log.appendLine(`Installed ${dest}`);
    return dest;
  }
  await runCmd(
    "make",
    ["-C", checkout, "install", `PREFIX=${prefix}`, `SNOVAC_DIR=${snovac}`],
    path.dirname(checkout),
    log,
  );
  const dest = existingFile(path.join(prefix, "bin", "snova-lsp"));
  if (!dest || !headerOk(dest, host, arch)) {
    throw new Error(`make install did not write a snova-lsp binary for this system to ${path.join(prefix, "bin")}`);
  }
  try {
    await ensureUserPath(path.dirname(dest), log);
  } catch (error) {
    log.appendLine(`PATH was not updated: ${error instanceof Error ? error.message : String(error)}`);
  }
  log.appendLine(`Installed ${dest}`);
  return dest;
}

function searchList(options: EnsureServerOptions, host: ServerHost): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const start of [options.extensionPath, ...options.workspaceRoots]) {
    for (const dir of ancestorRoots(start)) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      roots.push(dir);
    }
  }
  return serverSearchPaths({
    extensionPath: options.extensionPath,
    home: os.homedir(),
    localAppData: process.env.LOCALAPPDATA || "",
    workspaceRoots: roots,
    host,
  });
}

function resolveCompatible(options: EnsureServerOptions, host: ServerHost, arch: string): string | null {
  const listed = searchList(options, host);
  for (const name of [installedBinaryName(host), host === "win32" ? "snovalang-lsp.exe" : "snovalang-lsp"]) {
    const onPath = commandOnPath(name);
    if (onPath) listed.push(onPath);
  }
  const candidates: ServerCandidate[] = listed.map((filePath) => ({
    path: filePath,
    header: readHeader(filePath),
  }));
  const chosen = chooseServerBinary(host, candidates, arch);
  if (!chosen) return null;
  return existingFile(chosen) ?? null;
}

function explicitServer(configuredPath: string, host: ServerHost, arch: string): string {
  const found = existingFile(configuredPath);
  if (!found) {
    throw new Error(`snova.lsp.serverPath does not exist: ${configuredPath}`);
  }
  if (!headerOk(found, host, arch)) {
    throw new Error(
      `snova.lsp.serverPath is not an executable for this system: ${configuredPath}. On macOS the extension starts a universal Mach-O binary and does not launch the Linux ELF or the Windows executable.`,
    );
  }
  return found;
}

/**
 * Absolute path of a snova-lsp this host can execute.
 * A compatible binary already on disk is returned without compiling.
 * Otherwise the server is cloned from snovalang/snova-lsp and installed with
 * `make install` into ~/.local/bin.
 */
export async function ensureServerBinary(options: EnsureServerOptions): Promise<string> {
  const host = serverHost(process.platform);
  const arch = serverArch(process.arch);
  const configured = options.configuredPath.trim();
  const explicit = configured.length > 0 && configured !== "snova-lsp";
  if (explicit) {
    return explicitServer(configured, host, arch);
  }

  if (!options.force) {
    const found = resolveCompatible(options, host, arch);
    if (found) return found;
    if (!options.autoInstall) throw new Error(HOST_MISS);
  }

  const roots = [options.extensionPath, ...options.workspaceRoots];
  try {
    return await options.onBuild((progress) => {
      progress("Installing snova-lsp");
      return makeInstall(options.log, host, arch, roots);
    });
  } catch (error) {
    const found = resolveCompatible(options, host, arch);
    if (found) {
      const message = error instanceof Error ? error.message : String(error);
      options.log.appendLine(`Could not install snova-lsp (${message}). Using ${found}.`);
      return found;
    }
    throw error;
  }
}
