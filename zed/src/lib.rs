use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use zed_extension_api::process::Command as HostCommand;
use zed_extension_api::{
    self as zed, Architecture, Command, Extension, LanguageServerId,
    LanguageServerInstallationStatus, Os, Worktree, current_platform,
    set_language_server_installation_status,
};

const LSP_GIT: &str = "https://github.com/snovalang/snova-lsp.git";
const SNOVAC_GIT: &str = "https://github.com/snovalang/snovac.git";

struct SnovalangExtension {
    /// Absolute path of a server this session already resolved.
    cached: Option<String>,
}

fn installed_name(os: Os) -> &'static str {
    if os == Os::Windows {
        "snova-lsp.exe"
    } else {
        "snova-lsp"
    }
}

fn alias_name(os: Os) -> &'static str {
    if os == Os::Windows {
        "snovalang-lsp.exe"
    } else {
        "snovalang-lsp"
    }
}

fn bundled_names(os: Os) -> Vec<&'static str> {
    match os {
        Os::Mac => vec!["snova-lsp-darwin", "snova-lsp"],
        Os::Windows => vec!["snova-lsp.exe"],
        Os::Linux => vec!["snova-lsp"],
    }
}

/// The server reads stdio. It has no required arguments.
fn server_arguments() -> Vec<String> {
    Vec::new()
}

fn home_dir() -> Option<PathBuf> {
    // The extension runs as WebAssembly, so cfg(windows) is the host of the
    // compiler, not the editor. The host environment is what Zed exposes.
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn is_checkout(dir: &Path) -> bool {
    dir.join("Makefile").is_file() && dir.join("src").join("lsp_transport.c").is_file()
}

/// Host path without the `\\?\` prefix that `fs::canonicalize` adds on Windows.
fn host_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}

/// Collapse `.` and `..` so a path never stays in the `/../...` form.
/// A Windows prefix is kept: pushing `\` after `C:` would replace the prefix.
fn normalize_lexical(path: &Path) -> PathBuf {
    let mut prefix: Option<std::ffi::OsString> = None;
    let mut absolute = false;
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Prefix(value) => prefix = Some(value.as_os_str().to_os_string()),
            Component::RootDir => absolute = true,
            Component::CurDir => {}
            Component::ParentDir => {
                parts.pop();
            }
            Component::Normal(part) => parts.push(part.to_os_string()),
        }
    }
    let mut out = PathBuf::new();
    if let Some(prefix) = prefix {
        let mut text = prefix;
        if absolute {
            text.push(std::path::MAIN_SEPARATOR.to_string());
        }
        out.push(text);
    } else if absolute {
        out.push(std::path::MAIN_SEPARATOR.to_string());
    }
    for part in parts {
        out.push(part);
    }
    out
}

/// Absolute path with symlinks and `..` resolved. Relative inputs are based on
/// the extension working directory. Returns nothing when the result would
/// still be relative.
fn canonical_path(path: &Path) -> Option<String> {
    if let Ok(real) = fs::canonicalize(path) {
        let text = host_path(&real);
        if Path::new(&text).is_absolute() {
            return Some(text);
        }
    }
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().ok()?.join(path)
    };
    let normalized = normalize_lexical(&absolute);
    if !normalized.is_absolute() {
        return None;
    }
    let text = host_path(&normalized);
    if text.contains("/../") || text.contains("\\..\\") || text.starts_with("../") {
        return None;
    }
    Some(text)
}

fn absolute_dir(path: &Path) -> PathBuf {
    if let Some(text) = canonical_path(path) {
        return PathBuf::from(text);
    }
    if path.is_absolute() {
        return normalize_lexical(path);
    }
    path.to_path_buf()
}

fn read_header(path: &Path) -> Option<Vec<u8>> {
    let mut file = fs::File::open(path).ok()?;
    let mut buf = vec![0u8; 256];
    let n = file.read(&mut buf).ok()?;
    if n < 4 {
        return None;
    }
    buf.truncate(n);
    Some(buf)
}

fn read_u16(header: &[u8], offset: usize, little: bool) -> Option<u16> {
    let bytes = header.get(offset..offset + 2)?;
    Some(if little {
        u16::from_le_bytes([bytes[0], bytes[1]])
    } else {
        u16::from_be_bytes([bytes[0], bytes[1]])
    })
}

fn read_u32(header: &[u8], offset: usize, little: bool) -> Option<u32> {
    let bytes = header.get(offset..offset + 4)?;
    Some(if little {
        u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
    } else {
        u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
    })
}

fn arch_name(arch: Architecture) -> &'static str {
    match arch {
        Architecture::Aarch64 => "arm64",
        Architecture::X8664 => "x64",
        Architecture::X86 => "ia32",
    }
}

fn cpu_matches(arch: Architecture, cpu: &str) -> bool {
    arch_name(arch) == cpu
}

fn macho_cpu(cputype: u32) -> Option<&'static str> {
    let base = cputype & 0xff;
    let abi64 = cputype & 0x0100_0000 != 0;
    if base == 7 {
        return Some(if abi64 { "x64" } else { "ia32" });
    }
    if base == 12 && abi64 {
        return Some("arm64");
    }
    None
}

/// CPUs named by the header. None means the header is too short to tell.
fn header_cpus(header: &[u8]) -> Option<Vec<&'static str>> {
    if header.len() < 4 {
        return None;
    }
    if header[0] == 0x7f && header[1] == b'E' && header[2] == b'L' && header[3] == b'F' {
        if header.len() < 20 || (header[5] != 1 && header[5] != 2) {
            return None;
        }
        let machine = read_u16(header, 18, header[5] == 1)?;
        if machine == 0 {
            return None;
        }
        let cpu = match machine {
            3 => "ia32",
            62 => "x64",
            183 => "arm64",
            _ => return Some(Vec::new()),
        };
        return Some(vec![cpu]);
    }
    if header[0] == b'M' && header[1] == b'Z' {
        if header.len() < 0x40 {
            return None;
        }
        let lfanew = read_u32(header, 0x3c, true)? as usize;
        if lfanew == 0 || lfanew + 6 > header.len() {
            return None;
        }
        if header[lfanew..lfanew + 4] != [b'P', b'E', 0, 0] {
            return None;
        }
        let machine = read_u16(header, lfanew + 4, true)?;
        let cpu = match machine {
            0x14c => "ia32",
            0x8664 => "x64",
            0xaa64 => "arm64",
            _ => return Some(Vec::new()),
        };
        return Some(vec![cpu]);
    }
    let magic = read_u32(header, 0, false)?;
    if magic == 0xcafebabe || magic == 0xcafebabf {
        let count = read_u32(header, 4, false)?;
        if count == 0 {
            return None;
        }
        let mut found = Vec::new();
        for i in 0..count.min(16) {
            let cputype = read_u32(header, 8 + (i as usize) * 20, false)?;
            if let Some(cpu) = macho_cpu(cputype) {
                if !found.contains(&cpu) {
                    found.push(cpu);
                }
            }
        }
        return if found.is_empty() { None } else { Some(found) };
    }
    let little = magic == 0xcefaedfe || magic == 0xcffaedfe;
    let big = magic == 0xfeedface || magic == 0xfeedfacf;
    if !little && !big {
        return None;
    }
    let cputype = read_u32(header, 4, little)?;
    macho_cpu(cputype).map(|cpu| vec![cpu])
}

fn os_kind_matches(os: Os, header: &[u8]) -> bool {
    if header.len() < 4 {
        return false;
    }
    let elf = header[0] == 0x7f && header[1] == b'E' && header[2] == b'L' && header[3] == b'F';
    let pe = header[0] == b'M' && header[1] == b'Z';
    let magic = read_u32(header, 0, false).unwrap_or(0);
    let macho = matches!(
        magic,
        0xfeedface
            | 0xcefaedfe
            | 0xfeedfacf
            | 0xcffaedfe
            | 0xcafebabe
            | 0xbebafeca
            | 0xcafebabf
            | 0xbfbafeca
    );
    match os {
        Os::Mac => macho,
        Os::Windows => pe,
        Os::Linux => elf,
    }
}

fn header_matches(os: Os, arch: Architecture, header: &[u8]) -> bool {
    if !os_kind_matches(os, header) {
        return false;
    }
    match header_cpus(header) {
        None => true,
        Some(cpus) => cpus.iter().any(|cpu| cpu_matches(arch, cpu)),
    }
}

/// A path the editor can spawn. WASI exposes some files as `/file`, which is
/// not a path on the user's machine when the working directory is `/`.
fn is_spawnable(path: &str) -> bool {
    if path.contains("/../")
        || path.contains("\\..\\")
        || path.starts_with("../")
        || path.starts_with("..\\")
    {
        return false;
    }
    let bytes = path.as_bytes();
    if bytes.get(1) == Some(&b':') || path.starts_with(r"\\") {
        return true;
    }
    match std::env::current_dir() {
        Ok(cwd) => {
            let cwd = host_path(&cwd);
            !cwd.is_empty() && cwd != "/" && (path.starts_with('/') || path.starts_with(&cwd))
        }
        Err(_) => false,
    }
}

fn spawnable_path(path: &Path) -> Option<String> {
    if let Some(text) = canonical_path(path) {
        if is_spawnable(&text) {
            return Some(text);
        }
    }
    if path.is_absolute() || path.components().any(|component| matches!(component, Component::ParentDir))
    {
        return None;
    }
    Some(path.to_string_lossy().into_owned())
}

fn usable_binary(path: &Path, os: Os, arch: Architecture) -> Option<String> {
    let header = read_header(path)?;
    if !header_matches(os, arch, &header) {
        return None;
    }
    spawnable_path(path)
}

fn candidate_paths(os: Os, worktree: &Worktree) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut bundled = Vec::new();
    for name in bundled_names(os) {
        bundled.push(PathBuf::from("server").join(name));
        bundled.push(PathBuf::from("..").join("vscode").join("server").join(name));
    }
    let installed = installed_name(os);
    let alias = alias_name(os);
    if let Some(home) = home_dir() {
        paths.push(home.join(".local").join("bin").join(installed));
        paths.push(home.join(".local").join("bin").join(alias));
        paths.push(home.join(".snova").join("bin").join(installed));
        if os != Os::Windows {
            paths.push(
                home.join(".config")
                    .join("zed")
                    .join("tools")
                    .join("bin")
                    .join(installed),
            );
        }
    }
    if os == Os::Windows {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let local = PathBuf::from(local);
            paths.push(local.join("snova-lsp").join("bin").join(installed));
            paths.push(local.join("Zed").join("tools").join("bin").join(installed));
        }
    }
    paths.extend(bundled);
    let root = absolute_dir(&PathBuf::from(worktree.root_path()));
    let mut ancestor = root;
    for _ in 0..6 {
        paths.push(ancestor.join("tools").join("bin").join(installed));
        paths.push(ancestor.join("build").join(installed));
        paths.push(
            ancestor
                .join("snova-lsp")
                .join("tools")
                .join("bin")
                .join(installed),
        );
        paths.push(ancestor.join("snova-lsp").join("build").join(installed));
        if !ancestor.pop() {
            break;
        }
    }
    paths
}

fn built_binary(dir: &Path, name: &str) -> Option<PathBuf> {
    let tools = dir.join("tools").join("bin").join(name);
    if tools.is_file() {
        return Some(tools);
    }
    let build = dir.join("build").join(name);
    if build.is_file() {
        return Some(build);
    }
    None
}

fn find_checkout(root: &Path) -> Option<PathBuf> {
    let mut dir = absolute_dir(root);
    for _ in 0..6 {
        if is_checkout(&dir) {
            return Some(absolute_dir(&dir));
        }
        let sibling = absolute_dir(&dir.join("snova-lsp"));
        if is_checkout(&sibling) {
            return Some(sibling);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

fn host_ok(status: &zed::process::Output, what: &str) -> zed::Result<()> {
    if status.status == Some(0) {
        return Ok(());
    }
    Err(format!(
        "{what} failed: {}",
        String::from_utf8_lossy(&status.stderr)
    ))
}

fn ensure_snovac(checkout: &Path) -> zed::Result<PathBuf> {
    let parent = checkout
        .parent()
        .ok_or_else(|| "snova-lsp checkout has no parent".to_string())?;
    let sibling = parent.join("snovac");
    if sibling.join("Makefile").is_file() {
        return Ok(sibling);
    }
    let status = HostCommand::new("git")
        .args([
            "clone",
            "--depth",
            "1",
            SNOVAC_GIT,
            &sibling.to_string_lossy(),
        ])
        .output()?;
    host_ok(&status, "git clone snovac")?;
    Ok(sibling)
}

fn run_make(checkout: &Path, os: Os) -> zed::Result<()> {
    let output = HostCommand::new("make")
        .args(["-C", &checkout.to_string_lossy(), "all"])
        .output()?;
    if output.status == Some(0) {
        return Ok(());
    }
    if os == Os::Windows {
        let fallback = HostCommand::new("mingw32-make")
            .args(["-C", &checkout.to_string_lossy(), "all"])
            .output()?;
        if fallback.status == Some(0) {
            return Ok(());
        }
        return Err(format!(
            "make failed:\n{}\n{}",
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&fallback.stderr)
        ));
    }
    Err(format!(
        "make failed:\n{}",
        String::from_utf8_lossy(&output.stderr)
    ))
}

fn cached_checkout() -> zed::Result<PathBuf> {
    let home = home_dir().ok_or_else(|| "HOME is not set".to_string())?;
    let root = home.join(".cache").join("snova").join("src");
    let mkdir = HostCommand::new("mkdir")
        .args(["-p", &root.to_string_lossy()])
        .output()?;
    host_ok(&mkdir, "mkdir")?;
    let checkout = root.join("snova-lsp");
    if !is_checkout(&checkout) {
        if checkout.exists() {
            let _ = HostCommand::new("rm")
                .args(["-rf", &checkout.to_string_lossy()])
                .output();
        }
        let status = HostCommand::new("git")
            .args([
                "clone",
                "--depth",
                "1",
                LSP_GIT,
                &checkout.to_string_lossy(),
            ])
            .output()?;
        host_ok(&status, "git clone snova-lsp")?;
    }
    Ok(checkout)
}

fn install_built(built: &Path, os: Os, arch: Architecture) -> zed::Result<String> {
    let home = home_dir().ok_or_else(|| "HOME is not set".to_string())?;
    let dest_dir = home.join(".local").join("bin");
    let mkdir = HostCommand::new("mkdir")
        .args(["-p", &dest_dir.to_string_lossy()])
        .output()?;
    host_ok(&mkdir, "mkdir")?;
    let dest_name = installed_name(os);
    let dest = dest_dir.join(dest_name);
    let from = built.to_string_lossy().into_owned();
    let to = dest.to_string_lossy().into_owned();
    let copied = HostCommand::new("cp").args([from, to]).output()?;
    host_ok(&copied, "cp")?;
    if os != Os::Windows {
        let _ = HostCommand::new("chmod")
            .args(["755", &dest.to_string_lossy()])
            .output();
        let link = dest_dir.join(alias_name(os));
        let _ = HostCommand::new("ln")
            .args(["-sfn", dest_name, &link.to_string_lossy()])
            .output();
    }
    usable_binary(&dest, os, arch)
        .ok_or_else(|| format!("installed snova-lsp is not executable: {}", dest.display()))
}

fn make_install(checkout: &Path, os: Os, arch: Architecture) -> zed::Result<String> {
    let snovac = ensure_snovac(checkout)?;
    let home = home_dir().ok_or_else(|| "HOME is not set".to_string())?;
    let prefix = home.join(".local");
    if os == Os::Windows {
        run_make(checkout, os)?;
        let built = built_binary(checkout, installed_name(os))
            .ok_or_else(|| "make finished without producing snova-lsp".to_string())?;
        return install_built(&built, os, arch);
    }
    let status = HostCommand::new("make")
        .args([
            "-C",
            &checkout.to_string_lossy(),
            "install",
            &format!("PREFIX={}", prefix.display()),
            &format!("SNOVAC_DIR={}", snovac.display()),
        ])
        .output()?;
    if status.status != Some(0) {
        return Err(format!(
            "make install failed:\n{}",
            String::from_utf8_lossy(&status.stderr)
        ));
    }
    let dest = prefix.join("bin").join("snova-lsp");
    usable_binary(&dest, os, arch).ok_or_else(|| {
        format!(
            "make install did not write a snova-lsp binary to {}",
            dest.display()
        )
    })
}

impl SnovalangExtension {
    fn find_existing(&self, worktree: &Worktree, os: Os, arch: Architecture) -> Option<String> {
        if let Some(cached) = &self.cached {
            if let Some(path) = usable_binary(Path::new(cached), os, arch) {
                return Some(path);
            }
        }
        for path in candidate_paths(os, worktree) {
            if let Some(found) = usable_binary(&path, os, arch) {
                return Some(found);
            }
        }
        let names = if os == Os::Windows {
            vec!["snova-lsp.exe", "snovalang-lsp.exe"]
        } else {
            vec!["snova-lsp", "snovalang-lsp"]
        };
        for name in names {
            if let Some(on_path) = worktree.which(&name) {
                let path = PathBuf::from(&on_path);
                if let Some(header) = read_header(&path) {
                    if !header_matches(os, arch, &header) {
                        continue;
                    }
                }
                if let Some(found) = spawnable_path(&path) {
                    return Some(found);
                }
                if !on_path.contains("/../") && !on_path.contains("\\..\\") {
                    return Some(on_path);
                }
            }
        }
        None
    }

    fn install(
        &self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
        os: Os,
        arch: Architecture,
    ) -> zed::Result<String> {
        set_language_server_installation_status(
            language_server_id,
            &LanguageServerInstallationStatus::Downloading,
        );
        let root = absolute_dir(&PathBuf::from(worktree.root_path()));
        let checkout = match find_checkout(&root) {
            Some(dir) => dir,
            None => match cached_checkout() {
                Ok(dir) => dir,
                Err(err) => {
                    set_language_server_installation_status(
                        language_server_id,
                        &LanguageServerInstallationStatus::Failed(err.clone()),
                    );
                    return Err(err);
                }
            },
        };
        match make_install(&checkout, os, arch) {
            Ok(path) => {
                set_language_server_installation_status(
                    language_server_id,
                    &LanguageServerInstallationStatus::None,
                );
                Ok(path)
            }
            Err(err) => {
                let message = format!(
                    "{err}\nBuild snova-lsp with `make install` (PREFIX=$HOME/.local) from {LSP_GIT}."
                );
                set_language_server_installation_status(
                    language_server_id,
                    &LanguageServerInstallationStatus::Failed(message.clone()),
                );
                Err(message)
            }
        }
    }
}

impl Extension for SnovalangExtension {
    fn new() -> Self {
        Self { cached: None }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> zed::Result<Command> {
        if language_server_id.as_ref() != "snova_lsp" {
            return Err(format!(
                "unknown Snovalang language server: {language_server_id}"
            ));
        }

        let (os, arch) = current_platform();
        let command = match self.find_existing(worktree, os, arch) {
            Some(path) => path,
            None => self.install(language_server_id, worktree, os, arch)?,
        };
        if command.contains("/../")
            || command.contains("\\..\\")
            || command.starts_with("../")
            || command.starts_with("..\\")
        {
            return Err(format!("snova-lsp path is not canonical: {command}"));
        }
        self.cached = Some(command.clone());

        Ok(Command {
            command,
            args: server_arguments(),
            env: Vec::new(),
        })
    }
}

zed::register_extension!(SnovalangExtension);
