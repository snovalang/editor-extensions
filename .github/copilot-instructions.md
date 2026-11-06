# GitHub Copilot instructions

Use Conventional Commits for commit subjects so release automation can choose a semantic version:

- `fix:` and other change types produce a patch release.
- `feat:` produces a minor release.
- Add `!` before the colon or a `BREAKING CHANGE:` footer for a major release.

Do not create release tags manually. The master release workflow assigns the version and publishes the editor packages.
