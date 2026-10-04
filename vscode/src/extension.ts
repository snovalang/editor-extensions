import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { workspace, window, commands, ExtensionContext, Terminal } from "vscode";
import {
  bundledServerFileName,
  chooseServerBinary,
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

let client: LanguageClient | undefined;
let snovaTerminal: Terminal | undefined;

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

function candidatePaths(extensionPath: string, host: ServerHost): string[] {
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
    installedName,
  ];
}

function resolveServerBinary(extensionPath: string, configuredPath: string): string | null {
  if (configuredPath && configuredPath !== "snova-lsp") {
    return configuredPath;
  }

  const host = serverHost(process.platform);
  const candidates: ServerCandidate[] = candidatePaths(extensionPath, host).map((filePath) => ({
    path: filePath,
    header: readHeader(filePath),
  }));
  return chooseServerBinary(host, candidates);
}

function getTerminal(): Terminal {
  if (!snovaTerminal || snovaTerminal.exitStatus !== undefined) {
    snovaTerminal = window.createTerminal("Snovalang");
  }
  return snovaTerminal;
}

export function activate(context: ExtensionContext) {
  const config = workspace.getConfiguration("snova");
  const configuredServerPath = config.get<string>("lsp.serverPath", "snova-lsp");
  const serverPath = resolveServerBinary(context.extensionPath, configuredServerPath);
  if (!serverPath) {
    window.showErrorMessage(
      "Snovalang could not find a language server for this operating system. On macOS the extension starts server/snova-lsp-darwin and does not launch the Linux or Windows binary.",
    );
    return;
  }
  const traceServer = config.get<string>("trace.server", "off");

  const logArgs: string[] = [];
  if (traceServer !== "off") {
    const logPath = path.join(os.tmpdir(), "snova-lsp.log");
    logArgs.push("--log", logPath);
  }

  const serverOptions: ServerOptions = {
    command: serverPath,
    args: ["--stdio", ...logArgs],
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "snova" },
      { scheme: "file", language: "snova-manifest" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher(
        "**/{*.snl,*.sns,mod.sns,snova.mod,snova.sns,snova.toml}"
      ),
    },
  };

  client = new LanguageClient(
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
  client.setTrace(traceMap[traceServer] ?? Trace.Off);

  client.start();

  // Register Developer Experience commands
  context.subscriptions.push(
    commands.registerCommand("snova.restartServer", async () => {
      if (client) {
        window.showInformationMessage("Restarting Snovalang Language Server...");
        await client.stop();
        client.start();
        window.showInformationMessage("Snovalang Language Server restarted successfully.");
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand("snova.runFile", () => {
      const editor = window.activeTextEditor;
      if (!editor) {
        window.showErrorMessage("No active Snovalang file open to run.");
        return;
      }
      const filePath = editor.document.fileName;
      const term = getTerminal();
      term.show();
      term.sendText(`snl run "${filePath}"`);
    })
  );

  context.subscriptions.push(
    commands.registerCommand("snova.checkProject", () => {
      const term = getTerminal();
      term.show();
      term.sendText("snl check --project .");
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
