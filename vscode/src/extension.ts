import * as path from "path";
import * as os from "os";
import * as fs from "fs";
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
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  Trace,
} from "vscode-languageclient/node";
import type * as lsp from "vscode-languageclient";
import { documentSelector, MANIFEST_FILENAMES, serverLaunch } from "./lspContract";
import { canonicalPath, ensureServerBinary } from "./serverInstall";

let client: LanguageClient | undefined;
let bootQueue: Promise<void> = Promise.resolve();
let bootGeneration = 0;

function exe(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
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
    if (MANIFEST_FILENAMES.some((name) => fs.existsSync(path.join(dir, name)))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/** The `{ path, project }` argument the server's code lenses carry. */
interface PathArgs {
  path?: string;
  project?: string | null;
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
    [],
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

function report(log: OutputChannel, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  log.show(true);
  window.showErrorMessage(`Snovalang: ${message}`);
}

/**
 * One stdio snova-lsp for this window. Startup is not awaited: the client
 * queues LSP requests until initialize finishes, and the server process is
 * spawned only after a Snovalang file activates the extension.
 * Full-document sync and every language feature come from the server's
 * initialize result. The client does not register its own diagnostics.
 */
function createClient(serverPath: string, log: OutputChannel): LanguageClient {
  const command = canonicalPath(serverPath);
  if (!command) {
    throw new Error(`snova-lsp path is not absolute: ${serverPath}`);
  }
  const traceServer = workspace.getConfiguration("snova").get<string>("trace.server", "off");
  const logFile = traceServer !== "off" ? path.join(os.tmpdir(), "snova-lsp.log") : undefined;
  const launch = serverLaunch(logFile);

  const serverOptions: ServerOptions = {
    command,
    args: launch.args,
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: documentSelector(),
    progressOnInitialization: true,
    outputChannel: log,
  };

  const next = new LanguageClient(
    "snovaLanguageServer",
    "Snovalang Language Server",
    serverOptions,
    clientOptions,
  );

  const traceMap: Record<string, Trace> = {
    off: Trace.Off,
    messages: Trace.Messages,
    verbose: Trace.Verbose,
  };
  next.setTrace(traceMap[traceServer] ?? Trace.Off);
  return next;
}

async function ensureServer(context: ExtensionContext, log: OutputChannel, force: boolean): Promise<string> {
  const config = workspace.getConfiguration("snova");
  return ensureServerBinary({
    extensionPath: context.extensionPath,
    workspaceRoots: (workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    configuredPath: config.get<string>("lsp.serverPath", "snova-lsp"),
    autoInstall: config.get<boolean>("lsp.autoInstall", true),
    force,
    log,
    onBuild: (work) =>
      window.withProgress(
        { location: ProgressLocation.Notification, title: "Snovalang", cancellable: false },
        (progress) => work((message) => progress.report({ message })),
      ),
  });
}

function boot(context: ExtensionContext, log: OutputChannel, force: boolean): Promise<boolean> {
  const generation = ++bootGeneration;
  const run = bootQueue.then(async () => {
    if (generation !== bootGeneration) return false;
    let serverPath: string;
    try {
      serverPath = await ensureServer(context, log, force);
    } catch (err) {
      if (generation === bootGeneration) report(log, err);
      return false;
    }
    if (generation !== bootGeneration) return false;
    if (client) {
      const previous = client;
      client = undefined;
      try {
        await previous.stop();
      } catch {
        // The process may already have exited.
      }
    }
    if (generation !== bootGeneration) return false;
    let next: LanguageClient;
    try {
      next = createClient(serverPath, log);
    } catch (err) {
      if (generation === bootGeneration) report(log, err);
      return false;
    }
    client = next;
    try {
      await next.start();
    } catch (err) {
      if (generation !== bootGeneration || client !== next) return false;
      client = undefined;
      try {
        await next.stop();
      } catch {
        // The process may already have exited.
      }
      report(log, err);
      return false;
    }
    return true;
  });
  bootQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function activate(context: ExtensionContext): void {
  const log = window.createOutputChannel("Snovalang");
  context.subscriptions.push(log);

  const register = (id: string, fn: (...args: any[]) => unknown) =>
    context.subscriptions.push(commands.registerCommand(id, fn));

  register("snova.restartServer", async () => {
    const ok = await boot(context, log, false);
    if (ok) window.showInformationMessage("Snovalang Language Server restarted.");
  });

  register("snova.installServer", async () => {
    const ok = await boot(context, log, true);
    if (ok) window.showInformationMessage("Snovalang language server is ready.");
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
        (l) => new Location(toUri(l.uri), new Range(toPos(l.range.start), toPos(l.range.end))),
      );
      return commands.executeCommand("editor.action.showReferences", toUri(uri), toPos(position), locs);
    },
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
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("snova.lsp") || event.affectsConfiguration("snova.trace")) {
        window
          .showInformationMessage("Restart the Snovalang server to apply the new settings?", "Restart")
          .then((pick) => pick && commands.executeCommand("snova.restartServer"));
      }
    }),
  );

  void boot(context, log, false);
}

export function deactivate(): Thenable<void> | undefined {
  const current = client;
  client = undefined;
  return current?.stop();
}
