# GitBranchQuickDiff Development Guide

VS Code extension that replaces the default diff gutter with comparisons against a configurable git reference (branch, tag, or commit). Uses the **proposed QuickDiffProvider API** (`enabledApiProposals: ["quickDiffProvider"]`). Supports multiple repositories with per-repo refs and optional submodule nesting.

For detailed architecture, component specs, key patterns, and command reference, see [docs/architecture.md](../docs/architecture.md).

## File Map

| File | Role |
|------|------|
| `src/extension.ts` | Entry point — delegates to `gitbranchquickdiff.ts` |
| `src/gitbranchquickdiff.ts` | Main controller: QuickDiffProvider registration, commands, multi-repo orchestration |
| `src/changesTreeView.ts` | Tree view, file decorations, `ChangedFile`/`DirectoryNode`/`RepositoryNode` items |
| `src/gitApi.ts` | Wrapper for VS Code built-in Git extension API |
| `src/vscode-variables.ts` | Variable substitution (`${git:lastTag}`, `${env:…}`, `${config:…}`, etc.) |
| `src/git.d.ts` | Git extension API types (external — **do not modify**) |
| `src/vscode.proposed.quickDiffProvider.d.ts` | Proposed API types for QuickDiffProvider |

## Build & Debug

```bash
npm run watch    # TypeScript watch mode
npm run compile  # One-time build
```

**F5** launches Extension Development Host with proposed APIs enabled. Console logs use `[GitBranchQuickDiff]` prefix.

## Configuration

```
gitbranchquickdiff.ref              string   "main"         — comparison ref (supports variable substitution)
gitbranchquickdiff.enabled          boolean  true
gitbranchquickdiff.displayMode      "list" | "tree"         — default "list"
gitbranchquickdiff.defaultAction    "openChanges" | "openFile" — default "openChanges"
gitbranchquickdiff.tagCacheTTL      number   1              — minutes; 0 = no time expiry
gitbranchquickdiff.submoduleDisplay "standalone" | "integrated" — default "standalone"
```

Settings are persisted in **workspace state** (not configuration). Configuration values serve as fallback defaults. When a config setting changes, the workspace state override is cleared.

Per-repo settings (`ref`, `recentRefs`) are stored as `Record<string, T>` keyed by `repo.rootUri.fsPath`. Global settings (`enabled`, `displayMode`, `defaultAction`, `submoduleDisplay`) are single values.

## Critical Gotchas

- **`git.Status` enum**: `INDEX_MODIFIED = 0` — always use `!== undefined`, never truthy checks
- **ExtendedStatus**: 28 values (0–27); add new cases to `getStatusText()`, `getStatusColor()`, `getStatusTooltip()`
- **`git.d.ts`**: External type file — never modify; use `toExtendedStatus()` conversion
- **Proposed API**: Requires `--enable-proposed-apis` flag and VS Code 1.107.1+
- **Provider re-registration**: QuickDiffProviders are disposed + recreated (not updated in-place) on HEAD/config changes
- **Decorations**: Only diff changes (ref vs HEAD) get `⁺` badge — worktree-only changes are **not** decorated (avoids conflicts with built-in Git extension)
- **Git URIs**: `git.toGitUri(uri, ref)` for historical file content in diffs
- **Deactivation**: When disabled, QuickDiffProvider returns `undefined` (falls back to VS Code default); tree shows activation prompt; all commands except "activate" are hidden
- **Cache invalidation**: Purely reactive (no polling) — `diffBetween` cache invalidates on ref/HEAD change, `diffWith` cache on working tree state change

## Common Development Patterns

### Adding a New Variable
1. Add pattern matching in `vscode-variables.ts` `processVariables()`
2. Handle errors gracefully (fallback to empty string)

### Modifying Tree View Display
1. Update `ChangedFile` constructor for label/description/icon changes
2. Modify `getStatusText()`, `getStatusColor()`, `getStatusTooltip()` for shared logic
3. Consider display mode context (list shows full path, tree doesn't)

### Changing When Providers Re-register
1. Add event listener in `registerProvider()`
2. Call `reregisterQuickDiffProvider(repository)` helper

### Adding a New Per-Repo Setting
1. Add workspace state key constant and `Record<string, T>` storage pattern
2. Add helper function with `(context, repository)` signature
3. Update `migrateWorkspaceState()` if migrating from old format
4. Update `clearWorkspaceCache()` to clear the new key

### Handling New Git Status Types
1. Add case to `getStatusText()`, `getStatusColor()`, `getStatusTooltip()`
2. Consider if it should appear in decorations
3. Test with staged, unstaged, and merged change scenarios
