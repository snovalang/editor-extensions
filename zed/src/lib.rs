use zed_extension_api::{self as zed, Command, Extension, LanguageServerId, Worktree};

struct SnovalangExtension;

impl Extension for SnovalangExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> zed::Result<Command> {
        if language_server_id.as_ref() != "snova_lsp" {
            return Err(format!("unknown Snovalang language server: {language_server_id}"));
        }

        let command = worktree
            .which("snova-lsp")
            .ok_or_else(|| {
                "snova-lsp was not found on PATH. Install snova-lsp and restart Zed."
                    .to_string()
            })?;

        Ok(Command {
            command,
            args: Vec::new(),
            env: Vec::new(),
        })
    }
}

zed::register_extension!(SnovalangExtension);
