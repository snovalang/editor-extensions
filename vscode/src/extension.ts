import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { spawn } from "child_process";
import {
  workspace,
  window,
  commands,
  tasks,
  ExtensionContext,
  Location,
  OutputChannel,
  Position,
  ProcessExecution,
  ProgressLocation,
  Range,
  Task,
  TaskScope,
  Uri,
} from "vscode";
import {
  bundledServerFileName,
  chooseServerBinary,
  headerMatchesHost,
  serverHost,
  type ServerCandidate,
  type ServerHost,
} from "./serverBinary";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  Trace,
} from "vscode-languageclient/node";
import type * as lsp from "vscode-languageclient";

let client: LanguageClient | undefined;

const MANIFESTS = ["mod.sns", "snova.sns", "snova.mod", "snova.toml", "Snovalang.toml"];

/** The `{ path, project }` argument the server's code lenses carry. */
interface PathArgs {
  path?: string;
  project?: string | null;
}

function exe(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

const LSP_REPO = "https://github.com/supernovalang/snova-lsp.git";
const SNOVAC_REPO = "https://github.com/snovalang/snovac.git";

const HOST_MISS =
  "Snovalang could not find a language server for this operating system. On macOS the extension starts server/snova-lsp-darwin and does not launch the Linux or Windows binary.";

/** Absolute path with `..` and symlinks resolved. Never returns a relative path. */
function canonical(file: string): string | undefined {
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
  return canonical(file);
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

function nearbyBinaries(roots: string[]): string[] {
  const binaryName = exe("snova-lsp");
  const found: string[] = [];
  for (const root of roots) {
    if (!root) continue;
    let dir = root;
    for (let i = 0; i < 6; i++) {
      found.push(
        path.join(dir, "tools", "bin", binaryName),
        path.join(dir, "build", binaryName),
        path.join(dir, "snova-lsp", "tools", "bin", binaryName),
        path.join(dir, "snova-lsp", "build", binaryName)
      );
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return found;
}

function readHeader(filePath: string): Buffer | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(4);
    const read = fs.readSync(fd, header, 0, 4, 0);
    return read === 4 ? header : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

function candidatePaths(extensionPath: string, host: ServerHost, roots: string[]): string[] {
  const installedName = host === "win32" ? "snova-lsp.exe" : "snova-lsp";
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  return [
    path.join(extensionPath, "server", bundledServerFileName(host)),
    path.join(home, ".snova", "bin", installedName),
    path.join(localAppData, "snova-lsp", "bin", installedName),
    path.join(localAppData, "Zed", "tools", "bin", installedName),
    path.join(workspaceRoot, "tools", "bin", installedName),
    ...nearbyBinaries(roots.length ? roots : [workspaceRoot]),
  ];
}

/** First absolute binary whose header can run on this host. macOS never selects ELF or PE. */
function resolveCompatible(extensionPath: string, roots: string[]): string | null {
  const host = serverHost(process.platform);
  const listed = candidatePaths(extensionPath, host, roots);
  const onPath = commandOnPath(host === "win32" ? "snova-lsp.exe" : "snova-lsp");
  if (onPath) listed.push(onPath);
  const candidates: ServerCandidate[] = listed.map((filePath) => ({
    path: filePath,
    header: readHeader(filePath),
  }));
  const chosen = chooseServerBinary(host, candidates);
  if (!chosen) return null;
  return existingFile(chosen) ?? null;
}

function explicitServer(configuredPath: string): string {
  const host = serverHost(process.platform);
  const found = existingFile(configuredPath);
  if (!found) {
    throw new Error(`snova.lsp.serverPath does not exist: ${configuredPath}`);
  }
  const header = readHeader(found);
  if (!header || !headerMatchesHost(host, header)) {
    throw new Error(
      `snova.lsp.serverPath is not an executable for this operating system: ${configuredPath}. On macOS the extension starts a universal Mach-O binary and does not launch the Linux ELF or the Windows executable.`
    );
  }
  return found;
}

function isLspCheckout(dir: string): boolean {
  return fs.existsSync(path.join(dir, "Makefile")) && fs.existsSync(path.join(dir, "src", "lsp_transport.c"));
}

function findLspCheckout(extraRoots: string[]): string | undefined {
  const roots = [...extraRoots];
  for (const folder of workspace.workspaceFolders ?? []) roots.push(folder.uri.fsPath);
  const seen = new Set<string>();
  for (const root of roots) {
    if (!root) continue;
    let dir = root;
    for (let i = 0; i < 6; i++) {
      if (seen.has(dir)) break;
      seen.add(dir);
      if (isLspCheckout(dir)) return canonical(dir) ?? path.resolve(dir);
      const sibling = path.resolve(dir, "snova-lsp");
      if (isLspCheckout(sibling)) return canonical(sibling) ?? sibling;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return undefined;
}

function builtBinary(dir: string): string | undefined {
  const names = [
    path.join(dir, "tools", "bin", exe("snova-lsp")),
    path.join(dir, "build", exe("snova-lsp")),
    path.join(dir, "tools", "bin", "snova-lsp"),
    path.join(dir, "build", "snova-lsp"),
  ];
  for (const name of names) {
    const found = existingFile(name);
    if (found) return found;
  }
  return undefined;
}

function runCmd(command: string, args: string[], cwd: string, log: OutputChannel): Promise<void> {
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

async function runMake(dir: string, log: OutputChannel): Promise<void> {
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

async function ensureSnovac(checkout: string, log: OutputChannel): Promise<void> {
  const sibling = path.join(path.dirname(checkout), "snovac");
  if (fs.existsSync(path.join(sibling, "Makefile"))) return;
  log.appendLine(`Cloning snovac next to ${checkout}`);
  await runCmd("git", ["clone", "--depth", "1", SNOVAC_REPO, sibling], path.dirname(checkout), log);
}

async function cloneAndBuild(log: OutputChannel): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "snova-lsp-"));
  await runCmd("git", ["clone", "--depth", "1", LSP_REPO, "snova-lsp"], tmp, log);
  await runCmd("git", ["clone", "--depth", "1", SNOVAC_REPO, "snovac"], tmp, log);
  const dir = path.join(tmp, "snova-lsp");
  await runMake(dir, log);
  const built = builtBinary(dir);
  if (!built) throw new Error("The build finished without producing snova-lsp.");
  return built;
}

function installBinary(built: string): string {
  const destDir = path.join(os.homedir(), ".snova", "bin");
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, exe("snova-lsp"));
  fs.copyFileSync(built, dest);
  if (process.platform !== "win32") fs.chmodSync(dest, 0o755);
  return canonical(dest) ?? dest;
}

async function ensureUserPath(dir: string, log: OutputChannel): Promise<void> {
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
  const rc = ["zshrc", "bashrc", "profile"].map((name) => path.join(os.homedir(), "." + name)).find((file) => fs.existsSync(file));
  if (!rc) return;
  const text = fs.readFileSync(rc, "utf8");
  if (text.includes(dir)) return;
  fs.appendFileSync(rc, `\nexport PATH="$PATH:${dir}"\n`);
  log.appendLine(`Added ${dir} to PATH in ${rc}`);
}

/**
 * Returns a server binary this host can execute. The bundled executable wins.
 * A custom `snova.lsp.serverPath` is used only when its header matches the host.
 * `snova.lsp.autoInstall` builds into ~/.snova/bin when nothing compatible is present.
 */
async function ensureServer(context: ExtensionContext, log: OutputChannel, force: boolean): Promise<string> {
  const config = workspace.getConfiguration("snova");
  const configured = config.get<string>("lsp.serverPath", "snova-lsp");
  const roots = [context.extensionPath, ...(workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath)];
  const explicit = !!configured && configured !== "snova-lsp";

  if (explicit) {
    return explicitServer(configured);
  }

  const host = serverHost(process.platform);
  const bundledPath = path.join(context.extensionPath, "server", bundledServerFileName(host));
  const bundledHeader = readHeader(bundledPath);
  const bundled =
    bundledHeader && headerMatchesHost(host, bundledHeader) ? existingFile(bundledPath) : undefined;
  if (bundled) {
    if (force) log.appendLine(`Using bundled language server ${bundled}`);
    return bundled;
  }

  if (!force) {
    const found = resolveCompatible(context.extensionPath, roots);
    if (found) return found;
    if (!config.get<boolean>("lsp.autoInstall", true)) {
      throw new Error(HOST_MISS);
    }
  }

  return window.withProgress(
    { location: ProgressLocation.Notification, title: "Snovalang", cancellable: false },
    async (progress) => {
      const checkout = findLspCheckout(roots);
      let built: string | undefined;
      if (checkout) {
        progress.report({ message: "Building the language server from the local checkout..." });
        log.appendLine(`Building ${checkout}`);
        await ensureSnovac(checkout, log);
        await runMake(checkout, log);
        built = builtBinary(checkout);
      } else {
        progress.report({ message: "Downloading and building the language server..." });
        built = await cloneAndBuild(log);
      }
      if (!built) throw new Error("The build finished without producing snova-lsp.");
      const dest = installBinary(built);
      const installedHeader = readHeader(dest);
      if (!installedHeader || !headerMatchesHost(host, installedHeader)) {
        throw new Error(HOST_MISS);
      }
      try {
        await ensureUserPath(path.dirname(dest), log);
      } catch (error) {
        log.appendLine(`PATH was not updated: ${error instanceof Error ? error.message : String(error)}`);
      }
      log.appendLine(`Installed ${dest}`);
      return dest;
    }
  );
}

function compilerPath(): string {
  const configured = workspace.getConfiguration("snova").get<string>("compilerPath", "snl");
  if (configured && configured !== "snl") {
    return configured;
  }
  const installed = path.join(os.homedir(), ".snova", "bin", exe("snl"));
  return fs.existsSync(installed) ? installed : "snl";
}

/** The directory of the nearest project manifest above `file`, if any. */
function findProject(file: string): string | undefined {
  let dir = path.dirname(file);
  for (;;) {
    if (MANIFESTS.some((m) => fs.existsSync(path.join(dir, m)))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/** Lens arguments, or the active editor's file when run from the palette. */
function targetOf(args: PathArgs | undefined): { file?: string; project?: string } {
  let file = args?.path;
  if (!file) {
    const doc = window.activeTextEditor?.document;
    if (doc && doc.uri.scheme === "file") {
      file = doc.fileName;
    }
  }
  let project = args?.project ?? undefined;
  if (!project && file) {
    project = findProject(file);
  }
  if (!project && !file) {
    project = workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
  return { file, project };
}

/** Runs `snl <args>` as a task in `cwd`; no shell, so paths need no quoting. */
function runSnl(name: string, args: string[], cwd: string | undefined): Thenable<unknown> {
  const folder = cwd ? workspace.getWorkspaceFolder(Uri.file(cwd)) : undefined;
  const task = new Task(
    { type: "snova", command: args[0] },
    folder ?? TaskScope.Workspace,
    name,
    "snova",
    new ProcessExecution(compilerPath(), args, cwd ? { cwd } : undefined),
    []
  );
  return tasks.executeTask(task);
}

function requireFile(file: string | undefined, what: string): file is string {
  if (!file) {
    window.showErrorMessage(`Open a Snovalang file to ${what}.`);
    return false;
  }
  return true;
}

function startClient(serverPath: string): LanguageClient {
  const command = canonical(serverPath);
  if (!command) {
    throw new Error(`snova-lsp path is not absolute: ${serverPath}`);
  }
  const config = workspace.getConfiguration("snova");
  const traceServer = config.get<string>("trace.server", "off");

  const args: string[] = ["--stdio"];
  if (traceServer !== "off") {
    args.push("--log", path.join(os.tmpdir(), "snova-lsp.log"));
  }

  const serverOptions: ServerOptions = {
    command,
    args,
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "snova" },
      { scheme: "file", language: "snova-manifest" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher(
        "**/{*.snl,*.sns,mod.sns,snova.mod,snova.sns,snova.toml,Snovalang.toml}"
      ),
    },
    initializationOptions: {
      debug: config.get<boolean>("lsp.debug", false),
      deepCompletion: config.get<boolean>("completion.deep", true),
      usePlaceholders: config.get<boolean>("completion.usePlaceholders", true),
      completeUnimported: config.get<boolean>("completion.completeUnimported", true),
      completionBudget: config.get<number>("completion.budget", 200),
      referenceLenses: config.get<boolean>("codeLens.references", true),
    },
  };

  const c = new LanguageClient(
    "snovaLanguageServer",
    "Snovalang Language Server",
    serverOptions,
    clientOptions
  );

  const traceMap: Record<string, Trace> = {
    off: Trace.Off,
    messages: Trace.Messages,
    verbose: Trace.Verbose,
  };
  c.setTrace(traceMap[traceServer] ?? Trace.Off);
  c.start();
  return c;
}

export async function activate(context: ExtensionContext) {
  const log = window.createOutputChannel("Snovalang");
  context.subscriptions.push(log);

  const boot = async (force: boolean) => startClient(await ensureServer(context, log, force));
  const report = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    log.show(true);
    window.showErrorMessage(`Snovalang: ${message}`);
  };

  try {
    client = await boot(false);
  } catch (err) {
    report(err);
  }

  const register = (id: string, fn: (...args: any[]) => unknown) =>
    context.subscriptions.push(commands.registerCommand(id, fn));

  register("snova.restartServer", async () => {
    if (client) {
      await client.stop();
    }
    try {
      client = await boot(false);
      window.showInformationMessage("Snovalang Language Server restarted.");
    } catch (err) {
      report(err);
    }
  });

  register("snova.installServer", async () => {
    if (client) await client.stop();
    client = undefined;
    try {
      client = await boot(true);
      window.showInformationMessage("Snovalang language server installed.");
    } catch (err) {
      report(err);
    }
  });

  register("snova.run", (args?: PathArgs) => {
    const { file, project } = targetOf(args);
    if (!requireFile(file, "run")) return;
    return runSnl(`run ${path.basename(file)}`, ["run", file], project ?? path.dirname(file));
  });

  register("snova.check", (args?: PathArgs) => {
    const { file, project } = targetOf(args);
    if (project) {
      return runSnl("check project", ["check", "--project", project], project);
    }
    if (!requireFile(file, "check")) return;
    return runSnl(`check ${path.basename(file)}`, ["check", file], path.dirname(file));
  });

  register("snova.tidy", (args?: PathArgs) => {
    const { project } = targetOf(args);
    if (!project) {
      window.showErrorMessage("No mod.sns found for this file.");
      return;
    }
    return runSnl("tidy", ["tidy", "--project", project], project);
  });

  register("snova.get", (args?: PathArgs & { url?: string }) => {
    const { project } = targetOf(args);
    if (!project) {
      window.showErrorMessage("No mod.sns found for this file.");
      return;
    }
    const argv = ["get"];
    if (args?.url) argv.push(args.url);
    argv.push(`--project=${project}`);
    return runSnl("get", argv, project);
  });

  register(
    "snova.showReferences",
    (uri: string, position: lsp.Position, locations: lsp.Location[]) => {
      const conv = client?.protocol2CodeConverter;
      const toUri = (u: string) => (conv ? conv.asUri(u) : Uri.parse(u));
      const toPos = (p: lsp.Position) => new Position(p.line, p.character);
      const locs = (locations ?? []).map(
        (l) => new Location(toUri(l.uri), new Range(toPos(l.range.start), toPos(l.range.end)))
      );
      return commands.executeCommand("editor.action.showReferences", toUri(uri), toPos(position), locs);
    }
  );

  register("snova.runFile", () => commands.executeCommand("snova.run"));
  register("snova.checkFile", () => {
    const { file } = targetOf(undefined);
    if (!requireFile(file, "check")) return;
    return runSnl(`check ${path.basename(file)}`, ["check", file], path.dirname(file));
  });
  register("snova.checkProject", () => commands.executeCommand("snova.check"));
  register("snova.tidyProject", () => commands.executeCommand("snova.tidy"));
  register("snova.getDependencies", async () => {
    const url = await window.showInputBox({
      prompt: "Repository to add (leave empty to fetch the dependencies already in mod.sns)",
      placeHolder: "https://github.com/user/repo",
    });
    if (url === undefined) return;
    return commands.executeCommand("snova.get", { url: url.trim() || undefined });
  });

  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("snova.lsp") || e.affectsConfiguration("snova.completion") ||
          e.affectsConfiguration("snova.codeLens") || e.affectsConfiguration("snova.trace")) {
        window
          .showInformationMessage("Restart the Snovalang server to apply the new settings?", "Restart")
          .then((pick) => pick && commands.executeCommand("snova.restartServer"));
      }
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
