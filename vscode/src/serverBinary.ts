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

export type ServerArch = "x64" | "arm64" | "ia32" | "unknown";

type CpuArch = "x64" | "arm64" | "ia32";

/** Bytes needed to see an ELF machine, a Mach-O slice, or a PE COFF machine. */
export const SERVER_HEADER_BYTES = 256;

export function serverArch(arch: string): ServerArch {
  switch (arch) {
    case "x64":
    case "arm64":
    case "ia32":
      return arch;
    default:
      return "unknown";
  }
}

function osKindMatches(host: ServerHost, kind: ExecutableKind): boolean {
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

function readU16(header: Uint8Array, offset: number, little: boolean): number | null {
  if (offset + 2 > header.length) return null;
  const b0 = header[offset];
  const b1 = header[offset + 1];
  return little ? b0 | (b1 << 8) : (b0 << 8) | b1;
}

function readU32(header: Uint8Array, offset: number, little: boolean): number | null {
  if (offset + 4 > header.length) return null;
  const b0 = header[offset];
  const b1 = header[offset + 1];
  const b2 = header[offset + 2];
  const b3 = header[offset + 3];
  return little
    ? (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0
    : ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

function elfCpu(machine: number): CpuArch | null {
  switch (machine) {
    case 3:
      return "ia32";
    case 62:
      return "x64";
    case 183:
      return "arm64";
    default:
      return null;
  }
}

function elfCpus(header: Uint8Array): CpuArch[] | null {
  if (header.length < 20) return null;
  const data = header[5];
  if (data !== 1 && data !== 2) return null;
  const machine = readU16(header, 18, data === 1);
  if (machine === null || machine === 0) return null;
  const cpu = elfCpu(machine);
  return cpu ? [cpu] : [];
}

function peCpus(header: Uint8Array): CpuArch[] | null {
  if (header.length < 0x40) return null;
  const lfanew = readU32(header, 0x3c, true);
  if (lfanew === null || lfanew <= 0 || lfanew + 6 > header.length) return null;
  if (
    header[lfanew] !== 0x50 ||
    header[lfanew + 1] !== 0x45 ||
    header[lfanew + 2] !== 0 ||
    header[lfanew + 3] !== 0
  ) {
    return null;
  }
  const machine = readU16(header, lfanew + 4, true);
  if (machine === null || machine === 0) return null;
  switch (machine) {
    case 0x14c:
      return ["ia32"];
    case 0x8664:
      return ["x64"];
    case 0xaa64:
      return ["arm64"];
    default:
      return [];
  }
}

function machoCpu(cputype: number): CpuArch | null {
  const base = cputype & 0xff;
  const abi64 = (cputype & 0x01000000) !== 0;
  if (base === 7) return abi64 ? "x64" : "ia32";
  if (base === 12 && abi64) return "arm64";
  return null;
}

function machoCpus(header: Uint8Array): CpuArch[] | null {
  const magic = readU32(header, 0, false);
  if (magic === null) return null;
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    const count = readU32(header, 4, false);
    if (count === null || count === 0) return null;
    const found: CpuArch[] = [];
    const n = Math.min(count, 16);
    for (let i = 0; i < n; i++) {
      const cputype = readU32(header, 8 + i * 20, false);
      if (cputype === null) break;
      const cpu = machoCpu(cputype);
      if (cpu && found.indexOf(cpu) === -1) found.push(cpu);
    }
    return found.length > 0 ? found : null;
  }
  const little = magic === 0xcefaedfe || magic === 0xcffaedfe;
  const big = magic === 0xfeedface || magic === 0xfeedfacf;
  if (!little && !big) return null;
  const cputype = readU32(header, 4, little);
  if (cputype === null) return null;
  const cpu = machoCpu(cputype);
  return cpu ? [cpu] : null;
}

/** CPUs this header can run. Null means the header is too short to tell. */
function headerCpus(header: Uint8Array): CpuArch[] | null {
  const kind = executableKind(header);
  switch (kind) {
    case "elf":
      return elfCpus(header);
    case "pe":
      return peCpus(header);
    case "macho":
      return machoCpus(header);
    case "unknown":
      return null;
    default: {
      const unknown: never = kind;
      throw new Error(`Unhandled executable kind: ${String(unknown)}`);
    }
  }
}

/**
 * True when the executable can run on this host.
 * A short header is matched by OS family only. A longer header must also
 * name this CPU, so a macOS host never selects ELF or PE and an arm64 host
 * never selects an x64-only ELF.
 */
export function headerMatchesHost(host: ServerHost, header: Uint8Array, arch: string = "unknown"): boolean {
  if (!osKindMatches(host, executableKind(header))) return false;
  const wanted = serverArch(arch);
  if (wanted === "unknown") return true;
  const cpus = headerCpus(header);
  if (cpus === null) return true;
  return cpus.indexOf(wanted) !== -1;
}

/** First candidate whose header can run on this host. A macOS host never selects ELF or PE. */
export function chooseServerBinary(
  host: ServerHost,
  candidates: ServerCandidate[],
  arch: string = "unknown",
): string | null {
  for (const candidate of candidates) {
    if (candidate.header && headerMatchesHost(host, candidate.header, arch)) {
      return candidate.path;
    }
  }
  return null;
}
