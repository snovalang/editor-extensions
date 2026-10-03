import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { workspace, window, commands, ExtensionContext, Terminal } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  Trace,
} from "vscode-languageclient/node";

let client: LanguageClient;
let snovaTerminal: Terminal | undefined;

function resolveServerBinary(extensionPath: string, configuredPath: string): string {
  if (configuredPath && configuredPath !== "snova-lsp") {
    return configuredPath;
  }

  const binaryName = process.platform === "win32" ? "snova-lsp.exe" : "snova-lsp";
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  const bundled = path.join(extensionPath, "server", binaryName);

  const candidates = [
    // 1. Binary shipped inside this VSIX (includes the Windows tmpfile fix)
    bundled,
    // 2. System/User .snova directory
    path.join(home, ".snova", "bin", binaryName),
    // 3. Standalone snova-lsp install directory
    path.join(localAppData, "snova-lsp", "bin", binaryName),
    // 4. Zed tools/bin directory if installed
    path.join(localAppData, "Zed", "tools", "bin", binaryName),
    // 5. Local workspace tools/bin
    path.join(workspace.workspaceFolders?.[0]?.uri.fsPath || "", "tools", "bin", binaryName),
    // 6. Bare name to resolve via PATH
    binaryName,
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return binaryName;
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
