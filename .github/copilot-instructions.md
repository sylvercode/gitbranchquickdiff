# GitBranchQuickDiff Development Guide

## Project Overview

VS Code extension that replaces the default diff gutter with comparisons against a configurable git reference (branch, tag, or commit). Uses the **proposed QuickDiffProvider API** (`enabledApiProposals: ["quickDiffProvider"]` in package.json) which requires `--enable-proposed-apis` flag during development.

## Architecture

### Core Components

- **[extension.ts](../src/extension.ts)**: Minimal entry point - delegates to `gitbranchquickdiff.ts`
- **[gitbranchquickdiff.ts](../src/gitbranchquickdiff.ts)**: Main controller implementing `CustomQuickDiffProvider` class
  - Registers provider per repository with `vscode.window.registerQuickDiffProvider()`
  - Provider re-registers on HEAD changes (checkout) and config changes
  - Returns `undefined` when disabled to fall back to VS Code default behavior
  - Manages tree view lifecycle and refresh
- **[changesTreeView.ts](../src/changesTreeView.ts)**: Tree view provider for displaying changed files
  - `ChangesTreeDataProvider`: Main tree provider showing all changes (diff + worktree)
    - Displays files changed between ref and HEAD (committed changes)
    - Includes working tree changes (staged, unstaged, untracked)
    - Merges and deduplicates changes by URI
  - `ChangesDecorationProvider`: File decoration provider for explorer and tab headers
    - Only decorates files with diff changes (ref vs HEAD) with `⁺` badge
    - Does not decorate worktree-only changes
  - `ChangedFile`: Tree item with smart status display:
    - Diff changes: `M⁺` (with superscript plus)
    - Diff + worktree: `M⁺, M` (comma-separated)
    - Worktree only: `M` (no superscript)
  - Shared utility functions: `getStatusText()`, `getStatusColor()`, `getStatusTooltip()`
  - Status indicators: M (Modified), A (Added), D (Deleted), R (Renamed), U (Untracked), I (Ignored)
  - Git-style colored icons using theme colors
- **[gitApi.ts](../src/gitApi.ts)**: Wrapper for VS Code's built-in Git extension API
- **[vscode-variables.ts](../src/vscode-variables.ts)**: Variable substitution system supporting:
  - Standard VS Code variables (`${workspaceFolder}`, `${file}`, etc.)
  - Git-specific variables: `${git:lastTag}`, `${git:lastTag:RegEx}`, `${git:track}`, `${git:push}`

### Key Patterns

1. **Provider Lifecycle**: Providers are disposed and re-registered (not updated in-place) when:
   - Repository HEAD changes (branch checkout)
   - Configuration changes (`gitbranchquickdiff.ref` or `gitbranchquickdiff.enabled`)
   - Tree view is refreshed (not re-registered) on these events
   - FileDecorationProvider registered once per repository (never re-registered)

2. **Git API Integration**: Wait for Git extension state `'initialized'` before registering providers:
   ```typescript
   if (git.state === 'initialized') {
       registerProvider(context, git);
   } else {
       const disposable = git.onDidChangeState((state: string) => { ... });
   }
   ```

3. **Configuration Scope**: All settings are workspace-scoped (third param `false` in `update()` calls)

4. **Change Tracking**: Tree view shows union of:
   - Diff changes: `repository.diffBetween(ref, 'HEAD')`
   - Index changes: `repository.state.indexChanges` (staged)
   - Working tree changes: `repository.state.workingTreeChanges` (unstaged)
   - Merge changes: `repository.state.mergeChanges`
   - Deduplication by URI with worktree status tracking

5. **Decoration Strategy**: 
   - Only files with diff changes (ref vs HEAD) get decorations in explorer/tabs
   - Worktree-only changes appear in tree view but not decorated in explorer
   - Prevents decoration conflicts with built-in Git extension

## Development Workflow

### Build & Watch
```bash
npm run watch          # TypeScript watch mode (background task)
npm run compile        # One-time build
```

### Debugging
Press **F5** to launch Extension Development Host with:
- Proposed APIs enabled (see [.vscode/launch.json](../.vscode/launch.json))
- Pre-launch build task runs automatically
- Example env var: `MYREF` (used in `${env:MYREF}` variable substitution)

### Commands Available
- `Use GitBranchQuickDiff` / `Deactivate GitBranchQuickDiff`: Toggle extension
- `Set quick diff ref`: Change comparison reference
- `Revert quick diff ref to user setting`: Reset workspace override
- `Refresh`: Refresh the changes tree view
- `Open Changes`: Open diff view for a changed file

## File Organization

- **Type definitions**: `git.d.ts`, `vscode.proposed.quickDiffProvider.d.ts` (proposed API types)
- **UI Components**: `changesTreeView.ts` (tree view for changed files)
- **Compilation**: `tsconfig.json` targets ES2024, strict mode enabled, outputs to `out/`
- **Linting**: ESLint with TypeScript parser (see `.eslintrc.json`)

## Critical Notes

- **Proposed API**: Requires VS Code 1.107.1+ and explicit enabling in both package.json and launch args
- **Variable Substitution**: The ref setting supports complex patterns like `${git:lastTag:^v[0-9].*}` for regex-filtered tags
- **Repository Scoping**: Provider pattern matching uses `${repository.rootUri.fsPath}/**` to scope to specific repos
- **Git URI Generation**: Uses `git.toGitUri(uri, ref)` to create virtual URIs for historical file versions

## Configuration Schema

```typescript
gitbranchquickdiff.enabled: boolean (default: true)
gitbranchquickdiff.ref: string (default: "main")
```

The `ref` value undergoes variable substitution before use, enabling dynamic references based on workspace state.
