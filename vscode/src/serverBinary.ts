export type ServerHost = "darwin" | "linux" | "win32";

export type ExecutableKind = "macho" | "elf" | "pe" | "unknown";

export interface ServerCandidate {
  path: string;
  header: Uint8Array | null;
}

export function serverHost(platform: string): ServerHost {
  if (platform === "darwin" || platform === "win32") return platform;
  return "linux";
}

export function bundledServerFileName(host: ServerHost): string {
  switch (host) {
    case "darwin":
      return "snova-lsp-darwin";
    case "win32":
      return "snova-lsp.exe";
    case "linux":
      return "snova-lsp";
    default: {
      const unknown: never = host;
      throw new Error(`Unhandled server host: ${String(unknown)}`);
    }
  }
}

export function executableKind(header: Uint8Array): ExecutableKind {
  if (header.length < 4) return "unknown";
  if (header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46) {
    return "elf";
  }
  if (header[0] === 0x4d && header[1] === 0x5a) return "pe";

  const magic = ((header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3]) >>> 0;
  switch (magic) {
    case 0xfeedface:
    case 0xcefaedfe:
    case 0xfeedfacf:
    case 0xcffaedfe:
    case 0xcafebabe:
    case 0xbebafeca:
    case 0xcafebabf:
    case 0xbfbafeca:
      return "macho";
    default:
      return "unknown";
  }
}

export function headerMatchesHost(host: ServerHost, header: Uint8Array): boolean {
  const kind = executableKind(header);
  switch (host) {
    case "darwin":
      return kind === "macho";
    case "win32":
      return kind === "pe";
    case "linux":
      return kind === "elf";
    default: {
      const unknown: never = host;
      throw new Error(`Unhandled server host: ${String(unknown)}`);
    }
  }
}

/** First candidate whose header can run on this host. A macOS host never selects ELF or PE. */
export function chooseServerBinary(host: ServerHost, candidates: ServerCandidate[]): string | null {
  for (const candidate of candidates) {
    if (candidate.header && headerMatchesHost(host, candidate.header)) {
      return candidate.path;
    }
  }
  return null;
}
