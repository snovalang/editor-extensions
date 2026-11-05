import * as path from "path";
import { bundledServerFileName, type ServerHost } from "./serverBinary";

/**
 * Client contract for https://github.com/snovalang/snova-lsp.
 *
 * The production server reads stdin and writes stdout. The only argument it
 * documents is `--log <file>`. `make install` (PREFIX=$HOME/.local) writes
 * ~/.local/bin/snova-lsp and a snovalang-lsp symlink. Initialize advertises
 * full-document sync and does not register workspace file watchers; the
 * server indexes .snl and .sns itself.
 */

export const LSP_REPOSITORY = "https://github.com/snovalang/snova-lsp.git";
export const SNOVAC_REPOSITORY = "https://github.com/snovalang/snovac.git";

export const SOURCE_LANGUAGE_ID = "snova";
export const MANIFEST_LANGUAGE_ID = "snova-manifest";

/** Basenames lsp_is_manifest_file accepts, including legacy manifest names. */
export const MANIFEST_FILENAMES = [
  "mod.sns",
  "snova.sns",
  "snova.mod",
  "snova.toml",
  "Snovalang.toml",
] as const;

export interface DocumentSelectorItem {
  scheme: string;
  language: string;
}

export function documentSelector(): DocumentSelectorItem[] {
  return [
    { scheme: "file", language: SOURCE_LANGUAGE_ID },
    { scheme: "file", language: MANIFEST_LANGUAGE_ID },
  ];
}

export interface ServerLaunch {
  args: string[];
}

/** Arguments passed to the snova-lsp process. Stdio is the transport, not a flag. */
export function serverLaunch(logFile?: string): ServerLaunch {
  if (logFile && logFile.length > 0) {
    return { args: ["--log", logFile] };
  }
  return { args: [] };
}

export function installedBinaryName(host: ServerHost): string {
  return host === "win32" ? "snova-lsp.exe" : "snova-lsp";
}

export function installedAliasName(host: ServerHost): string {
  return host === "win32" ? "snovalang-lsp.exe" : "snovalang-lsp";
}

/** Directory created by `make install` with the default PREFIX. */
export function documentedInstallDir(home: string): string {
  return path.join(home, ".local", "bin");
}

export interface ServerSearchInput {
  extensionPath: string;
  home: string;
  localAppData: string;
  workspaceRoots: string[];
  host: ServerHost;
}

/**
 * Binary locations in the order the extension tries them.
 * The copy shipped with the extension wins. `make install` is next.
 * PATH is appended by the caller after this list.
 */
export function serverSearchPaths(input: ServerSearchInput): string[] {
  const installed = installedBinaryName(input.host);
  const alias = installedAliasName(input.host);
  const bundled = path.join(input.extensionPath, "server", bundledServerFileName(input.host));
  const plain = path.join(input.extensionPath, "server", installed);
  const paths = [bundled];
  if (plain !== bundled) paths.push(plain);
  paths.push(
    path.join(documentedInstallDir(input.home), installed),
    path.join(documentedInstallDir(input.home), alias),
    path.join(input.home, ".snova", "bin", installed),
  );
  if (input.localAppData) {
    paths.push(
      path.join(input.localAppData, "snova-lsp", "bin", installed),
      path.join(input.localAppData, "Zed", "tools", "bin", installed),
    );
  }
  for (const root of input.workspaceRoots) {
    if (!root) continue;
    paths.push(
      path.join(root, "tools", "bin", installed),
      path.join(root, "build", installed),
      path.join(root, "snova-lsp", "tools", "bin", installed),
      path.join(root, "snova-lsp", "build", installed),
    );
  }
  return paths;
}
