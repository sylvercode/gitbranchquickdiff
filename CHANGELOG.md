# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Multi-repository support**: Extension now works with multiple git repositories in a single workspace
  - Each repository appears as a collapsible `RepositoryNode` with its ref displayed in the description
  - Single-repo workspaces preserve the previous flat UX (no extra repository node)
  - Per-repo ref and recent refs stored independently
  - Dynamic handling of repositories added/removed at runtime
- **Submodule display modes**: New `gitbranchquickdiff.submoduleDisplay` setting
  - `standalone` (default): All repos shown at top level
  - `integrated`: Submodule repos nested under their parent repository
  - Toggle via "Toggle Submodule Display" command in the view menu
- **Repository-scoped commands**: `Set quick diff ref`, `Refresh`, and `Open All Changes` can target individual repos
  - Inline icons on repository nodes for quick access
  - Repository picker shown when multiple repos exist
- **Per-repo file decorations**: Each repository has its own decoration provider for independent badge/color display
- **Workspace state migration**: Old single-repo workspace state automatically migrated to per-repo format

## [Pre-released]

- New Quick Diff view in SCM panel.
- File coloration in Explorer View, SCM changes view and Editor Tabs.
- Gutter diff inline editor view source selector
- Badges in Explorer View, SCM changes view and Editor Tabs.
- Internationalization
- Use workspace cache for current ref

## [0.1.1] - 2023-04-17

### Changed

- Enabled setting is now `on` by default.
- Rename `Use default quick diff ref` to `Revert quick diff ref to user setting`.

### Fixed

- Extension activation not working if repository is open before GitBranchQuickDiff.
- Use of VSCode default behavior not working.

## [0.1.0] - 2023-04-16

- Initial release.
