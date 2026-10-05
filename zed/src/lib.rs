use std::fs;
use std::path::{Component, Path, PathBuf};

use zed_extension_api::process::Command as HostCommand;
use zed_extension_api::{
    self as zed, Architecture, Command, DownloadedFileType, Extension, GithubReleaseOptions,
    LanguageServerId, LanguageServerInstallationStatus, Os, Worktree, current_platform,
    download_file, latest_github_release, make_file_executable,
    set_language_server_installation_status,
};

const LSP_REPO: &str = "supernovalang/snova-lsp";

struct SnovalangExtension {
    /// Absolute path of a server this session already resolved.
    cached: Option<String>,
}

fn binary_name(os: Os) -> &'static str {
    if os == Os::Windows {
        "snova-lsp.exe"
    } else {
        "snova-lsp"
    }
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

fn existing_file(path: PathBuf) -> Option<String> {
    if path.is_file() {
        canonical_path(&path)
    } else {
        None
    }
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

fn built_binary(dir: &Path, name: &str) -> Option<String> {
    let dir = absolute_dir(dir);
    existing_file(dir.join("tools").join("bin").join(name))
        .or_else(|| existing_file(dir.join("build").join(name)))
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

fn ensure_snovac(checkout: &Path) -> zed::Result<()> {
    let Some(parent) = checkout.parent() else {
        return Ok(());
    };
    let sibling = parent.join("snovac");
    if sibling.join("Makefile").is_file() {
        return Ok(());
    }
    let status = HostCommand::new("git")
        .args([
            "clone",
            "--depth",
            "1",
            "https://github.com/snovalang/snovac.git",
            &sibling.to_string_lossy(),
        ])
        .output()?;
    if status.status != Some(0) {
        return Err(format!(
            "could not clone snovac: {}",
            String::from_utf8_lossy(&status.stderr)
        ));
    }
    Ok(())
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

fn asset_name(os: Os, arch: Architecture) -> String {
    let os_name = match os {
        Os::Mac => "macos",
        Os::Linux => "linux",
        Os::Windows => "windows",
    };
    let arch_name = match arch {
        Architecture::Aarch64 => "aarch64",
        Architecture::X8664 => "x86_64",
        Architecture::X86 => "x86",
    };
    format!("snova-lsp-{os_name}-{arch_name}.zip")
}

fn download_release(language_server_id: &LanguageServerId, name: &str) -> zed::Result<String> {
    set_language_server_installation_status(
        language_server_id,
        &LanguageServerInstallationStatus::Downloading,
    );
    let (os, arch) = current_platform();
    let wanted = asset_name(os, arch);
    let release = latest_github_release(
        LSP_REPO,
        GithubReleaseOptions {
            require_assets: true,
            pre_release: false,
        },
    )?;
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == wanted)
        .ok_or_else(|| format!("{wanted} is not attached to release {}", release.version))?;
    let dest = format!("snova-lsp-{}", release.version);
    let binary = Path::new(&dest).join(name);
    if !binary.is_file() {
        download_file(&asset.download_url, &dest, DownloadedFileType::Zip)?;
        make_file_executable(&binary.to_string_lossy())?;
    }
    set_language_server_installation_status(
        language_server_id,
        &LanguageServerInstallationStatus::None,
    );
    // The archive is extracted inside the extension work directory. A host
    // canonical path is used when the runtime can see one. Otherwise the
    // path stays relative to that directory and must not contain `..`.
    if let Some(path) = canonical_path(&binary) {
        if is_host_path(&path) {
            return Ok(path);
        }
    }
    if binary.components().any(|component| matches!(component, Component::ParentDir)) {
        return Err("downloaded snova-lsp path is not canonical".to_string());
    }
    Ok(binary.to_string_lossy().into_owned())
}

/// A path the editor can spawn. WASI exposes downloads as `/file`, which is
/// not a path on the user's machine.
fn is_host_path(path: &str) -> bool {
    if path.contains("/../") || path.contains("\\..\\") {
        return false;
    }
    let bytes = path.as_bytes();
    if bytes.get(1) == Some(&b':') || path.starts_with(r"\\") {
        return true;
    }
    if let Ok(cwd) = std::env::current_dir() {
        let cwd = host_path(&cwd);
        if cwd != "/" && path.starts_with(&cwd) {
            return true;
        }
    }
    false
}

impl SnovalangExtension {
    fn existing_binary(&self, worktree: &Worktree, name: &str) -> Option<String> {
        if let Some(cached) = &self.cached {
            if let Some(path) = canonical_path(Path::new(cached)) {
                return Some(path);
            }
        }
        if let Some(on_path) = worktree.which(name) {
            if let Some(path) = canonical_path(Path::new(&on_path)) {
                return Some(path);
            }
        }

        let (os, _) = current_platform();
        let root = absolute_dir(&PathBuf::from(worktree.root_path()));
        if let Some(path) = built_binary(&root, name) {
            return Some(path);
        }
        let mut candidates = Vec::new();
        if let Some(home) = home_dir() {
            candidates.push(home.join(".snova").join("bin").join(name));
        }
        if os == Os::Windows {
            if let Some(local) = std::env::var_os("LOCALAPPDATA") {
                let local = PathBuf::from(local);
                candidates.push(local.join("snova-lsp").join("bin").join(name));
                candidates.push(local.join("Zed").join("tools").join("bin").join(name));
            }
        } else if let Some(home) = home_dir() {
            candidates.push(
                home.join(".config")
                    .join("zed")
                    .join("tools")
                    .join("bin")
                    .join(name),
            );
        }

        let mut ancestor = root.as_path();
        for _ in 0..4 {
            if let Some(parent) = ancestor.parent() {
                candidates.push(
                    parent
                        .join("snova-lsp")
                        .join("tools")
                        .join("bin")
                        .join(name),
                );
                candidates.push(parent.join("snova-lsp").join("build").join(name));
                ancestor = parent;
            } else {
                break;
            }
        }

        candidates.into_iter().find_map(existing_file)
    }

    fn install(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
        name: &str,
    ) -> zed::Result<String> {
        let root = absolute_dir(&PathBuf::from(worktree.root_path()));
        if let Some(checkout) = find_checkout(&root) {
            set_language_server_installation_status(
                language_server_id,
                &LanguageServerInstallationStatus::Downloading,
            );
            let (os, _) = current_platform();
            ensure_snovac(&checkout)?;
            if let Err(err) = run_make(&checkout, os) {
                set_language_server_installation_status(
                    language_server_id,
                    &LanguageServerInstallationStatus::Failed(err.clone()),
                );
                // A local build can fail when make is absent. A published
                // release is the other way to get a binary.
                if let Ok(path) = download_release(language_server_id, name) {
                    return Ok(path);
                }
                return Err(format!(
                    "{err}\nInstall GNU make and a C11 compiler, or run snova-lsp/install.ps1 (Windows) or install.sh."
                ));
            }
            set_language_server_installation_status(
                language_server_id,
                &LanguageServerInstallationStatus::None,
            );
            if let Some(path) = built_binary(&checkout, name) {
                return Ok(path);
            }
            return Err("make finished without producing snova-lsp".to_string());
        }
        download_release(language_server_id, name).map_err(|err| {
            format!(
                "{err}\nsnova-lsp was not found. Run install.ps1 or install.sh from the snova-lsp repository."
            )
        })
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

        let (os, _) = current_platform();
        let name = binary_name(os);
        let command = match self.existing_binary(worktree, name) {
            Some(path) => path,
            None => self.install(language_server_id, worktree, name)?,
        };
        if command.contains("/../")
            || command.contains("\\..\\")
            || command.starts_with("../")
            || command.starts_with("..\\")
            || Path::new(&command)
                .components()
                .any(|component| matches!(component, Component::ParentDir))
        {
            return Err(format!("snova-lsp path is not canonical: {command}"));
        }
        self.cached = Some(command.clone());

        Ok(Command {
            command,
            args: vec!["--stdio".to_string()],
            env: Vec::new(),
        })
    }
}

zed::register_extension!(SnovalangExtension);
