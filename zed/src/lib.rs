use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use zed_extension_api::{self as zed, Command, Extension, LanguageServerId, Worktree};

const LSP_ID: &str = "snova_lsp";
const RELEASE_REPOSITORY: &str = "snovalang/editor-extensions";

struct SnovalangExtension {
    cached_binary: Option<String>,
    last_release_check: Option<Instant>,
}

impl SnovalangExtension {
    fn binary_for_host(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> zed::Result<String> {
        if self
            .last_release_check
            .is_some_and(|checked| checked.elapsed() < Duration::from_secs(6 * 60 * 60))
        {
            if let Some(path) = &self.cached_binary {
                if Path::new(path).is_file() {
                    return Ok(path.clone());
                }
            }
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        match self.download_latest_binary(language_server_id) {
            Ok(path) => {
                self.cached_binary = Some(path.clone());
                zed::set_language_server_installation_status(
                    language_server_id,
                    &zed::LanguageServerInstallationStatus::None,
                );
                Ok(path)
            }
            Err(download_error) => {
                // Keep offline and PATH based installs usable when GitHub is
                // unavailable or the user has denied the download capability.
                if let Some(path) = worktree.which("snova-lsp") {
                    self.cached_binary = Some(path.clone());
                    zed::set_language_server_installation_status(
                        language_server_id,
                        &zed::LanguageServerInstallationStatus::None,
                    );
                    return Ok(path);
                }
                zed::set_language_server_installation_status(
                    language_server_id,
                    &zed::LanguageServerInstallationStatus::Failed(download_error.clone()),
                );
                Err(format!(
                    "Could not download the latest snova-lsp ({download_error}). Install snova-lsp on PATH or grant this extension access to GitHub release downloads."
                ))
            }
        }
    }

    fn download_latest_binary(
        &mut self,
        language_server_id: &LanguageServerId,
    ) -> zed::Result<String> {
        let (os, architecture) = zed::current_platform();
        let (asset_name, file_name) = match (os, architecture) {
            (zed::Os::Windows, zed::Architecture::X8664) => {
                ("snova-lsp-windows-x86_64.exe", "snova-lsp.exe")
            }
            (zed::Os::Linux, zed::Architecture::X8664) => {
                ("snova-lsp-linux-x86_64", "snova-lsp")
            }
            (zed::Os::Mac, zed::Architecture::X8664 | zed::Architecture::Aarch64) => {
                ("snova-lsp-macos-universal", "snova-lsp")
            }
            _ => {
                return Err(format!(
                    "snova-lsp release binaries are not available for {os:?} {architecture:?}"
                ));
            }
        };

        let release = zed::latest_github_release(
            RELEASE_REPOSITORY,
            zed::GithubReleaseOptions {
                require_assets: true,
                pre_release: false,
            },
        )?;
        self.last_release_check = Some(Instant::now());
        let asset = release
            .assets
            .iter()
            .find(|asset| asset.name == asset_name)
            .ok_or_else(|| format!("release {} has no {asset_name} asset", release.version))?;

        let version = safe_component(&release.version);
        let relative_dir = format!("snova-lsp/{version}");
        let relative_binary = format!("{relative_dir}/{file_name}");
        let work_dir = std::env::current_dir()
            .map_err(|error| format!("could not locate Zed extension work directory: {error}"))?;
        let binary = work_dir.join(&relative_binary);

        if !binary.is_file() {
            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );
            zed::download_file(
                &asset.download_url,
                &relative_binary,
                zed::DownloadedFileType::Uncompressed,
            )?;
        }
        zed::make_file_executable(&relative_binary)?;
        if !binary.is_file() {
            return Err(format!("downloaded server is missing at {}", binary.display()));
        }

        Ok(binary.to_string_lossy().into_owned())
    }
}

impl Extension for SnovalangExtension {
    fn new() -> Self {
        Self {
            cached_binary: None,
            last_release_check: None,
        }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> zed::Result<Command> {
        if language_server_id.as_ref() != LSP_ID {
            return Err(format!("unknown Snovalang language server: {language_server_id}"));
        }

        let command = self.binary_for_host(language_server_id, worktree)?;
        // snova-lsp writes protocol traffic to stdio. Its trace belongs in
        // the worktree so a failed initialize is diagnosable without a shell.
        let log_path = PathBuf::from(worktree.root_path()).join(".snova-lsp.log");

        Ok(Command {
            command,
            args: vec!["--log".to_string(), log_path.to_string_lossy().into_owned()],
            env: Vec::new(),
        })
    }
}

fn safe_component(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

zed::register_extension!(SnovalangExtension);
