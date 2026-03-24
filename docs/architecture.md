# GitBranchQuickDiff Architecture

## Core Components

- **[extension.ts](../src/extension.ts)**: Minimal entry point - delegates to `gitbranchquickdiff.ts`
- **[gitbranchquickdiff.ts](../src/gitbranchquickdiff.ts)**: Main controller implementing `CustomQuickDiffProvider` class
  - Registers one QuickDiffProvider per repository with `vscode.window.registerQuickDiffProvider()`
  - Provider **re-registers** (dispose + recreate) on HEAD changes (checkout) and config changes
  - Returns `undefined` when disabled to fall back to VS Code default behavior
  - **Multi-Repo Tree Architecture**: Creates a single `MultiRepoTreeDataProvider` that orchestrates per-repo `ChangesTreeDataProvider` instances
  - **Tree View Title Management**: Dynamically updates title based on repo count and state
    - Single repo active: `Quick Diff (main)` or `Quick Diff (branch-name)`
    - Multiple repos: `Quick Diff`
    - Deactivated: `Quick Diff (deactivated)`
    - Updates on HEAD changes, config changes, and initial registration
  - Stores global references: `currentMultiRepoProvider`, `firstRepository`, `gitAPI` for command access
  - Initializes display mode from saved configuration on startup
  - **Per-repo settings**: `ref` and `recentRefs` are stored per-repository; `enabled`, `displayMode`, `defaultAction`, `submoduleDisplay` are global
  - **Dynamic repository handling**: Listens for `onDidOpenRepository` / `onDidCloseRepository` to add/remove repos at runtime
  - **Workspace state migration**: Automatically migrates old single-repo workspace state (string `ref`, array `recentRefs`) to per-repo maps on first access
- **[changesTreeView.ts](../src/changesTreeView.ts)**: Tree view provider for displaying changed files
  - `ExtendedStatus` enum: Extends Git Status with `RESTORED` status (28 values total: 0-27)
    - `RESTORED`: Files in git state (staged/unstaged/merge) that match ref content
  - `toExtendedStatus()`: Conversion function from git.Status to ExtendedStatus
  - `DisplayMode` enum: Defines view modes (`List` or `Tree`)
  - `MessageItem`: Tree item for displaying informational messages (e.g., activation prompt when disabled, no repos found)
  - `RepositoryNode`: Tree item representing a git repository in multi-repo mode
    - Label: repo folder name, Description: ref value
    - Icon: `$(repo)` for top-level, `$(repo-submodule)` for submodules
    - `contextValue`: `'repository'` (used for context menu `when` clauses)
    - Stores references to its `ChangesTreeDataProvider` and `git.Repository`
    - `updateDescription(ref)`: Updates displayed ref
    - `isSubmodule` setter: Toggles between repo/submodule icon
  - `MultiRepoTreeDataProvider`: Top-level tree data provider orchestrating all repos
    - Holds `Map<Repository, { node, provider, listenerDisposable, decorationDisposable }>`
    - **Single-repo optimization**: When only 1 repo exists, skips `RepositoryNode` level (preserves single-repo UX)
    - **Multi-repo mode**: Returns `RepositoryNode[]` at top level, each delegating to its `ChangesTreeDataProvider`
    - **Submodule support**: `_submoduleDisplay` mode (`standalone` or `integrated`)
      - `standalone`: All repos at top level regardless of submodule relationships
      - `integrated`: Submodule repos nested under parent `RepositoryNode`
      - `_rebuildSubmoduleMap()`: Detects parent→child relationships via `repository.state.submodules`
    - `addRepository()` / `removeRepository()`: Dynamic repo management with decoration provider lifecycle
    - `getProviderForUri(uri)`: Finds which repo's provider owns a given file URI
    - `refresh()` / `refreshRepo(repo)`: Refresh all or one repo
    - `setDisplayMode()` / `setSubmoduleDisplay()`: Global mode changes across all providers
    - **0-repos case**: Returns `MessageItem` when no repositories are found
  - `ChangesTreeDataProvider`: Per-repo tree provider showing all changes (diff + worktree)
    - **Deactivation Behavior**: When `gitbranchquickdiff.enabled` is false:
      - Returns `MessageItem` with activation prompt instead of file list
      - Message: "Quick Diff is deactivated. Click here to enable it."
      - Clicking message executes `gitbranchquickdiff.activate` command
    - Displays files changed between ref and HEAD via `repository.diffBetween(ref, 'HEAD')`
    - Includes working tree changes: `indexChanges` (staged), `workingTreeChanges` (unstaged), `mergeChanges`
    - Uses `repository.diffWith(ref)` to detect RESTORED files (working tree matches ref but differs from HEAD)
    - Merges and deduplicates changes by URI with separate status tracking (indexStatus, workingTreeStatus, mergeStatus)
    - **Performance: Separate Smart Caches**:
      - `_cachedDiffBetween`: Caches `diffBetween(ref, 'HEAD')` results, invalidates only when ref or HEAD commit changes
      - `_cachedDiffWith`: Caches `diffWith(ref)` results, invalidates only when ref or working tree state changes (indexCount, workingTreeCount, mergeCount)
      - No timer-based expiry - purely state-based invalidation for optimal performance
      - Explicit refresh clears both caches
      - Debounced refresh (100ms) batches rapid changes
    - **RESTORED Detection**: File in git state but not in diffWith(ref), excluding newly added files
    - **Display Modes**: 
      - **List Mode**: Flat list sorted by full path, root files first
      - **Tree Mode**: Hierarchical directory structure with `explorer.compactFolders` support
    - `setDisplayMode()`: Switch between list/tree modes (triggers refresh)
    - `buildTree()`: Constructs directory hierarchy with folder compacting logic
    - Tracks `_currentDirectoryNodes` for tree operations
  - `DirectoryNode`: Tree item representing folders in tree mode
    - Shows file count in description
    - Has `resourceUri` set to directory path
    - Collapsible state with folder icon
    - **Inline Actions**: 
      - `Open Changes` command with `multi-diff-editor-label-icon` icon opens all files in directory in multi-file diff view
      - `Restore` command with `discard` icon restores all files in directory to ref state
  - `ChangesDecorationProvider`: File decoration provider for explorer and tab headers
    - **Registered per-repo** independently (URIs are unique across repos, so no conflicts)
    - Only decorates files with diff changes (ref vs HEAD) with `⁺` superscript badge
    - Does not decorate worktree-only changes (avoids conflicts with built-in Git extension)
    - Updates decorations via `setChanges()` when tree refreshes
    - **Color Priority**: Uses git status color first (index → workingTree → merge → ref status)
    - Decoration update happens **after** ChangedFile creation to reuse color logic
    - Disposed when repository is removed from `MultiRepoTreeDataProvider`
  - `ChangedFile`: Tree item with smart status display and configurable click behavior:
    - Diff changes: `M⁺` (with superscript plus)
    - Diff + worktree: `M⁺, M` (comma-separated, shows all git statuses)
    - Worktree only: `M` (no superscript)
    - **Color Priority**: Calculated during creation - git status first (index → workingTree → merge), fallback to ref status
    - **Display Context**: Directory shown only in list mode, hidden in tree mode
    - Accepts `displayMode` parameter to conditionally format description
    - **Click Behavior**: Reads `gitbranchquickdiff.defaultAction` setting in constructor to set command
      - `openChanges` (default): Clicking opens diff view
      - `openFile`: Clicking opens file directly
      - Setting is read on-demand, no refresh needed when changed
    - **Inline Actions**: Multiple icon commands conditionally shown:
      - `openChange` with `compare-changes` icon: Opens diff (hidden if default action)
      - `openFile` with `go-to-file` icon: Opens file directly (hidden if default action)
      - `restoreFile` with `discard` icon: Restores file to ref state with confirmation
  - Shared utility functions: `getStatusText()`, `getStatusColor()`, `getStatusTooltip()`
  - Status indicators: M (Modified), A (Added), D (Deleted), R (Renamed), C (Copied), T (Type Changed), U (Untracked), I (Ignored), O (Restored), AA (Both Added), DD (Both Deleted), UU (Both Modified)
  - Git-style colored icons using theme colors
  - `openChange()`: Helper function to open diff view or historical file content for deleted files
- **[gitApi.ts](../src/gitApi.ts)**: Wrapper for VS Code's built-in Git extension API
  - `getGitAPI()`: Gets Git extension API, waits for activation if needed
  - `getGitRepository()`: Gets repository for a workspace URI
- **[vscode-variables.ts](../src/vscode-variables.ts)**: Variable substitution system supporting:
  - Standard VS Code variables (`${workspaceFolder}`, `${file}`, `${lineNumber}`, `${selectedText}`, etc.)
  - Environment variables: `${env:VAR_NAME}`
  - Config variables: `${config:setting.name}`
  - Git-specific variables:
    - `${git:lastTag}`: Last reachable tag from current HEAD
    - `${git:lastTag:pattern}`: Last tag matching glob pattern (e.g., `${git:lastTag:v*}` or `${git:lastTag:release-*}`)
    - `${git:track}`: Tracking branch (`remote/branch`)
    - `${git:push}`: Push target branch
  - **Performance: Tag Lookup Optimization**:
    - Uses `git describe --tags --abbrev=0 --match <pattern>` via Node.js `child_process` for native git performance
    - 100-1000x faster than previous `getRefs()` + `getMergeBase()` loop approach
    - Configurable cache TTL via `gitbranchquickdiff.tagCacheTTL` setting (in minutes, default 1)
    - Cache key includes: repository path, pattern, HEAD commit
    - Cache invalidates on HEAD changes or explicit refresh (via `clearTagCache()`)
    - Set TTL to 0 for no time-based expiry (cache only clears on HEAD changes/refresh)
    - 5 second timeout prevents hanging on slow repositories

## Key Patterns

### 1. Provider Lifecycle & Re-registration

Providers are disposed and re-registered (not updated in-place) when:
- Repository HEAD changes (branch checkout) - detected via `repository.state.onDidChange`
- Configuration changes (`gitbranchquickdiff.ref`, `gitbranchquickdiff.enabled`, `gitbranchquickdiff.displayMode`, `gitbranchquickdiff.defaultAction`, `gitbranchquickdiff.submoduleDisplay`)
- **QuickDiffProvider**: Disposed and re-registered with updated label on changes
- **Tree View**: Refreshed via `MultiRepoTreeDataProvider.refresh()` (not re-registered)
- **FileDecorationProvider**: Registered once per repository, disposed when repo removed; updates via `setChanges()`

### 2. Git API Integration

Wait for Git extension state `'initialized'` before registering providers:
```typescript
if (git.state === 'initialized') {
    registerProvider(context, git);
} else {
    const disposable = git.onDidChangeState((state: string) => { ... });
}
```

### 3. Workspace State Pattern

Settings stored in global workspace state (not configuration):
- **Per-repo settings** (stored as `Record<string, T>` keyed by `repo.rootUri.fsPath`):
  - `gitbranchquickdiff.refs`: Per-repo ref map (`Record<string, string>`)
  - `gitbranchquickdiff.recentRefs`: Per-repo recent refs map (`Record<string, string[]>`)
- **Global settings** (single value):
  - `gitbranchquickdiff.enabled`, `gitbranchquickdiff.displayMode`, `gitbranchquickdiff.defaultAction`, `gitbranchquickdiff.submoduleDisplay`
- Configuration settings serve as fallback defaults when workspace state is `undefined`
- Commands write to workspace state, not configuration
- **Configuration Change Handling**: When a configuration setting changes, the corresponding workspace state override is automatically cleared
- Helper functions: `getRawRef(context, repository)`, `getCurrentRef(context, repository)`, `getCurrentEnabled(context)`, `getCurrentDisplayMode(context)`, `getCurrentDefaultAction(context)`, `getCurrentSubmoduleDisplay(context)`
- **Migration**: `migrateWorkspaceState()` converts old single-string `ref` and single-array `recentRefs` to per-repo maps

### 4. Change Tracking Strategy

Tree view shows union of multiple sources:
- **Diff changes** (ref vs HEAD): `repository.diffBetween(ref, 'HEAD')` - committed differences
- **Diff with working tree** (ref vs working tree): `repository.diffWith(ref)` - used for RESTORED detection
- **Worktree changes**: Union of `indexChanges`, `workingTreeChanges`, `mergeChanges` - uncommitted work
- Deduplication by URI string (`uri.toString()`) with separate status tracking (indexStatus, workingTreeStatus, mergeStatus)
- Track `isInDiff` flag to distinguish diff changes from worktree-only changes
- **RESTORED Detection**: File appears in git state but not in diffWith(ref) and is not a newly added file
- **Performance Optimization**:
  - Separate caches for `diffBetween()` and `diffWith()` with independent invalidation
  - `diffBetween` cache: Only invalidates when ref or HEAD commit changes
  - `diffWith` cache: Only invalidates when ref or working tree state changes (index/worktree/merge counts)
  - No timer-based cache expiry - purely reactive to actual state changes
  - Significantly reduces redundant git operations in large monorepos

### 5. Decoration Strategy

Prevents conflicts with built-in Git extension:
- Each repo has its own `ChangesDecorationProvider`, registered independently
- Only files with diff changes (ref vs HEAD) get `⁺` badge decorations in explorer/tabs
- Worktree-only changes appear in tree view but **not decorated** in explorer
- Uses `Map<string, ChangeInfo>` keyed by `uri.toString()` for decoration tracking
- Fires `onDidChangeFileDecorations` only for changed URIs (optimization)
- **Color Priority**: Git status (index → workingTree → merge) takes precedence over ref status
- Decoration update happens **after** ChangedFile creation to reuse the same color calculation logic
- No conflicts between repos since file URIs are unique across repos

### 6. Status Enum Handling

- **Critical**: git.Status enum has INDEX_MODIFIED=0, requiring explicit `!== undefined` checks (not truthy evaluation)
- ExtendedStatus enum in changesTreeView.ts extends Status with RESTORED value
- Never modify external git.d.ts file - use conversion function `toExtendedStatus()`
- All 28 status values (0-27) must be handled in getStatusText/Color/Tooltip functions

### 7. Multi-Repo Provider Architecture

- One `MultiRepoTreeDataProvider` manages all repos, one `ChangesTreeDataProvider` per repo
- One `QuickDiffProvider` per repository, scoped via pattern matching: `{ pattern: '${repository.rootUri.fsPath}/**' }`
- QuickDiffProviders stored in local `Map<git.Repository, { provider, disposable }>` for lifecycle management
- **Single-repo optimization**: When only 1 repo, `MultiRepoTreeDataProvider.getChildren()` delegates directly (no `RepositoryNode` level)
- **Multi-repo mode**: Each repo appears as a `RepositoryNode` with its ref in description
- Commands that operate on a specific repo accept optional `RepositoryNode` parameter; if not provided, show repo picker
- `pickRepository()` helper shows QuickPick when multiple repos exist, skips for single repo
- Global references: `currentMultiRepoProvider`, `firstRepository`, `gitAPI`

### 8. Submodule Display

- `submoduleDisplay` setting: `"standalone"` (default) or `"integrated"`
- **Standalone**: All repos (including submodules) shown at top level
- **Integrated**: Submodule repos nested under their parent `RepositoryNode`
- Detection: `_rebuildSubmoduleMap()` uses `repository.state.submodules` to find parent→child relationships
- Submodule nodes use `$(repo-submodule)` icon to distinguish from top-level repos
- Toggle via `toggleSubmoduleDisplay` command

### 9. Git URI Generation

Use `git.toGitUri(uri, ref)` to create virtual URIs for historical file versions in diffs.

### 10. Multi-File Diff Views

Use `vscode.changes` command to open multiple files in a unified diff view:
- Format: `vscode.commands.executeCommand('vscode.changes', title, changes)`
- Changes array: `[URI, URI, URI][]` where each tuple is `[label, left (old), right (new)]`
- Used by "Open All Changes" command (all files) and "Open Changes" on directories (directory files)
- When invoked from `RepositoryNode`, only shows that repo's changes
- Skip deleted files to avoid errors in multi-file view

### 11. Restore Functionality

Files can be restored to ref state:
- **Added files**: Deleted (they don't exist in ref)
- **Renamed files**: New file deleted, old file restored at original path
- **Modified/deleted files**: Content restored from ref using `repository.show(ref, path)`
- Confirmation dialog shows before restore (with file count for directories)
- No automatic staging after restore

## Commands Reference

- `Use GitBranchQuickDiff` / `Deactivate GitBranchQuickDiff`: Toggle extension (workspace setting)
  - Located in view title menu ("..." overflow)
  - Conditionally shown based on `config.gitbranchquickdiff.enabled`
  - When deactivated, only "activate" command is visible; all other commands are hidden
- `Set quick diff ref`: Change comparison reference
  - Icon: `$(target)` (target icon)
  - Located in view title navigation bar (header) and repository node inline actions
  - In multi-repo mode: shows repo picker first (or invoked directly from `RepositoryNode`)
  - Shows QuickPick with recent refs and supports custom input
  - Hidden when extension is deactivated
- `Revert quick diff ref to user setting`: Reset workspace override to `undefined`
  - In multi-repo mode: shows repo picker first
- `Refresh`: Manually refresh the changes tree view
  - Icon: `$(refresh)` (refresh icon)
  - Located in view title navigation bar (header) and repository node inline actions
  - Clears all caches (tag cache and tree view caches) to force fresh git lookups
  - Can target a specific repo when invoked from `RepositoryNode`
  - Hidden when extension is deactivated
- `Open All Changes`: Open all changed files in multi-file diff view
  - Icon: `$(multi-diff-editor-label-icon)`
  - Located in view title navigation bar (header) and repository node inline actions
  - When invoked from `RepositoryNode`, only shows that repo's changes
  - When invoked from view title, collects changes from all repos
  - Uses `vscode.changes` command to show all changes in a single multi-file diff view
  - Skips deleted files to avoid errors
  - Hidden when extension is deactivated
- `Open Changes` (on files): Open diff view for a changed file (inline icon: compare-changes)
  - Hidden when extension is deactivated
- `Open Changes` (on directories): Open all files in directory in multi-file diff view (inline icon: multi-diff-editor-label-icon)
  - Only shown in tree mode on directory items
  - Recursively collects all files in the directory and subdirectories
  - Uses `vscode.changes` command with format `[URI, URI, URI][]` as `[label, left, right][]`
  - Skips deleted files in multi-file view
  - Hidden when extension is deactivated
- `Open File`: Open file directly without diff (inline icon: go-to-file)
  - Hidden when extension is deactivated
- `View as List` / `View as Tree`: Toggle between list and tree display modes (shown in view menu with checkmarks)
  - Updates all per-repo providers' display mode (global setting)
  - Hidden when extension is deactivated
- `Open File by Default` / `Open Changes by Default`: Set default click action (in view title ... menu, conditionally shown)
  - Hidden when extension is deactivated
- `Toggle Submodule Display`: Switch between standalone and integrated submodule display
  - Located in view title menu ("..." overflow)
  - Hidden when extension is deactivated
- `Restore File`: Restore a single file to ref state (inline icon: discard)
  - Shows confirmation dialog before restore
  - Deletes added files, restores renamed files to original path, restores content for modified files
  - Hidden when extension is deactivated
- `Restore Directory`: Restore all files in a directory to ref state (inline icon: discard)
  - Shows confirmation dialog with file count before restore
  - Applies same restore logic as single file to all files in directory
  - Hidden when extension is deactivated

## Configuration Schema

```typescript
gitbranchquickdiff.ref: string (default: "main")
gitbranchquickdiff.enabled: boolean (default: true)
gitbranchquickdiff.displayMode: "list" | "tree" (default: "list")
gitbranchquickdiff.defaultAction: "openChanges" | "openFile" (default: "openChanges")
gitbranchquickdiff.tagCacheTTL: number (default: 1) // Cache duration in minutes for ${git:lastTag} lookups. 0 = no time-based expiry
gitbranchquickdiff.submoduleDisplay: "standalone" | "integrated" (default: "standalone") // How submodule repos are displayed
```

**Configuration vs Workspace State:**
- Global settings (`enabled`, `displayMode`, `defaultAction`, `submoduleDisplay`) have defaults in configuration
- Per-repo settings (`ref`, `recentRefs`) are stored as `Record<string, T>` maps keyed by `repo.rootUri.fsPath`
- Actual values are stored in **workspace state** (configuration values are fallback defaults when state is `undefined`)
- Commands write to workspace state, not configuration
- **Configuration Change Handling**: When a configuration setting changes, the corresponding workspace state override is automatically cleared to let the new config value take effect
- **Migration**: Old single-value workspace state keys are automatically migrated to per-repo maps

The `ref` value undergoes variable substitution before use, enabling dynamic references based on workspace state.
