# GitBranchQuickDiff Development Guide

## Project Overview

VS Code extension that replaces the default diff gutter with comparisons against a configurable git reference (branch, tag, or commit). Uses the **proposed QuickDiffProvider API** (`enabledApiProposals: ["quickDiffProvider"]` in package.json) which requires `--enable-proposed-apis` flag during development.

**Key Capability**: Show diff gutters comparing current file state to any git ref (not just HEAD), with a custom tree view showing all changes and file decorations in the explorer.

## Architecture

### Core Components

- **[extension.ts](../src/extension.ts)**: Minimal entry point - delegates to `gitbranchquickdiff.ts`
- **[gitbranchquickdiff.ts](../src/gitbranchquickdiff.ts)**: Main controller implementing `CustomQuickDiffProvider` class
  - Registers provider per repository with `vscode.window.registerQuickDiffProvider()`
  - Provider **re-registers** (dispose + recreate) on HEAD changes (checkout) and config changes
  - Returns `undefined` when disabled to fall back to VS Code default behavior
  - **Single Tree View Architecture**: Creates one tree view for the first repository only
  - **Tree View Title Management**: Dynamically updates title to show current ref or deactivation state
    - Active: `Quick Diff (main)` or `Quick Diff (branch-name)`
    - Deactivated: `Quick Diff (deactivated)`
    - Updates on HEAD changes, config changes, and initial registration
  - Stores global references: `currentTreeDataProvider`, `firstRepository`, `gitAPI` for command access
  - Initializes display mode from saved configuration on startup
  - All settings are **global** (not per-repository)
- **[changesTreeView.ts](../src/changesTreeView.ts)**: Tree view provider for displaying changed files
  - `ExtendedStatus` enum: Extends Git Status with `RESTORED` status (28 values total: 0-27)
    - `RESTORED`: Files in git state (staged/unstaged/merge) that match ref content
  - `toExtendedStatus()`: Conversion function from git.Status to ExtendedStatus
  - `DisplayMode` enum: Defines view modes (`List` or `Tree`)
  - `MessageItem`: Tree item for displaying informational messages (e.g., activation prompt when disabled)
  - `ChangesTreeDataProvider`: Main tree provider showing all changes (diff + worktree)
    - **Deactivation Behavior**: When `gitbranchquickdiff.enabled` is false:
      - Returns `MessageItem` with activation prompt instead of file list
      - Message: "Quick Diff is deactivated. Use the activate command to enable it."
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
    - **Critical**: Passes decoration provider to tree view for registration
  - `DirectoryNode`: Tree item representing folders in tree mode
    - Shows file count in description
    - Has `resourceUri` set to directory path
    - Collapsible state with folder icon
    - **Inline Actions**: 
      - `Open Changes` command with `request-changes` icon opens all files in directory in multi-file diff view
      - `Restore` command with `discard` icon restores all files in directory to ref state
  - `ChangesDecorationProvider`: File decoration provider for explorer and tab headers
    - **Registered once globally** (never re-registered, unlike QuickDiffProvider)
    - Only decorates files with diff changes (ref vs HEAD) with `⁺` superscript badge
    - Does not decorate worktree-only changes (avoids conflicts with built-in Git extension)
    - Updates decorations via `setChanges()` when tree refreshes
    - **Color Priority**: Uses git status color first (index → workingTree → merge → ref status)
    - Decoration update happens **after** ChangedFile creation to reuse color logic
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

### Key Patterns

1. **Provider Lifecycle & Re-registration**: Providers are disposed and re-registered (not updated in-place) when:
   - Repository HEAD changes (branch checkout) - detected via `repository.state.onDidChange`
   - Configuration changes (`gitbranchquickdiff.ref`, `gitbranchquickdiff.enabled`, `gitbranchquickdiff.displayMode`, `gitbranchquickdiff.defaultAction`)
   - **QuickDiffProvider**: Disposed and re-registered with updated label on changes
   - **Tree View**: Refreshed via `_onDidChangeTreeData.fire()` (not re-registered)
   - **FileDecorationProvider**: Registered once per repository, never re-registered; updates via `setChanges()`

2. **Git API Integration**: Wait for Git extension state `'initialized'` before registering providers:
   ```typescript
   if (git.state === 'initialized') {
       registerProvider(context, git);
   } else {
       const disposable = git.onDidChangeState((state: string) => { ... });
   }
   ```

3. **Workspace State Pattern**: All user-modified settings are stored in global workspace state (not configuration):
   - Keys: `gitbranchquickdiff.ref`, `gitbranchquickdiff.enabled`, `gitbranchquickdiff.displayMode`, `gitbranchquickdiff.defaultAction` (simple strings, no repository path)
   - Settings: `enabled`, `ref`, `displayMode`, `defaultAction`
   - Configuration settings serve as fallback defaults when workspace state is `undefined`
   - Commands write to workspace state, not configuration
   - **Configuration Change Handling**: When a configuration setting changes, the corresponding workspace state override is automatically cleared
   - Global helper functions `getCurrentRef()`, `getCurrentEnabled()`, `getCurrentDisplayMode()`, `getCurrentDefaultAction()` check workspace state first, then fall back to configuration
   - All settings are **global across the workspace** (single tree view shows first repository)

4. **Change Tracking Strategy**: Tree view shows union of multiple sources:
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

5. **Decoration Strategy** (prevents conflicts with built-in Git extension):
   - Only files with diff changes (ref vs HEAD) get `⁺` badge decorations in explorer/tabs
   - Worktree-only changes appear in tree view but **not decorated** in explorer
   - Uses `Map<string, ChangeInfo>` keyed by `uri.toString()` for decoration tracking
   - Fires `onDidChangeFileDecorations` only for changed URIs (optimization)
   - **Color Priority**: Git status (index → workingTree → merge) takes precedence over ref status
   - Decoration update happens **after** ChangedFile creation to reuse the same color calculation logic

6. **Status Enum Handling**: 
   - **Critical**: git.Status enum has INDEX_MODIFIED=0, requiring explicit `!== undefined` checks (not truthy evaluation)
   - ExtendedStatus enum in changesTreeView.ts extends Status with RESTORED value
   - Never modify external git.d.ts file - use conversion function `toExtendedStatus()`
   - All 28 status values (0-27) must be handled in getStatusText/Color/Tooltip functions

7. **Provider Registration Pattern**: One QuickDiffProvider per repository, but single tree view:
   - Pattern matching: `{ pattern: '${repository.rootUri.fsPath}/**' }` scopes to specific repo
   - QuickDiffProviders stored in local `Map<git.Repository, { provider, disposable }>` for lifecycle management
   - **Single tree view** created for first repository only, stored in `currentTreeDataProvider`
   - Global references: `firstRepository` (the one shown in tree view), `gitAPI` (for querying all repositories)
   - Commands query `gitAPI.repositories` directly to find which repository a file belongs to

8. **Git URI Generation**: Use `git.toGitUri(uri, ref)` to create virtual URIs for historical file versions in diffs.

9. **Multi-File Diff Views**: Use `vscode.changes` command to open multiple files in a unified diff view:
   - Format: `vscode.commands.executeCommand('vscode.changes', title, changes)`
   - Changes array: `[URI, URI, URI][]` where each tuple is `[label, left (old), right (new)]`
   - Used by "Open All Changes" command (all files) and "Open Changes" on directories (directory files)
   - Skip deleted files to avoid errors in multi-file view

10. **Restore Functionality**: Files can be restored to ref state:
    - **Added files**: Deleted (they don't exist in ref)
    - **Renamed files**: New file deleted, old file restored at original path
    - **Modified/deleted files**: Content restored from ref using `repository.show(ref, path)`
    - Confirmation dialog shows before restore (with file count for directories)
    - No automatic staging after restore

## Development Workflow

### Build & Watch
```bash
npm run watch          # TypeScript watch mode (background task)
npm run compile        # One-time build
```

Or use VS Code tasks:
- **Default Build Task** (Ctrl+Shift+B): Runs `npm run watch` in background with `$tsc-watch` problem matcher

### Debugging
Press **F5** to launch Extension Development Host with:
- Proposed APIs enabled via `--enable-proposed-apis sylvercode.gitbranchquickdiff` (see [.vscode/launch.json](../.vscode/launch.json))
- Pre-launch build task runs automatically
- Example env var in launch config: `MYREF` (used in `${env:MYREF}` variable substitution)

**Console Logging**: Extension logs with `[GitBranchQuickDiff]` prefix for filtering:
- Provider registration/re-registration events
- HEAD change detection
- Configuration change detection
- File decoration updates

### Commands Available
- `Use GitBranchQuickDiff` / `Deactivate GitBranchQuickDiff`: Toggle extension (workspace setting)
  - Located in view title menu ("..." overflow)
  - Conditionally shown based on `config.gitbranchquickdiff.enabled`
  - When deactivated, only "activate" command is visible; all other commands are hidden
- `Set quick diff ref`: Change comparison reference (shows input box with current value)
  - Icon: `$(target)` (target icon)
  - Located in view title navigation bar (header)
  - Hidden when extension is deactivated
- `Revert quick diff ref to user setting`: Reset workspace override to `undefined`
- `Refresh`: Manually refresh the changes tree view
  - Icon: `$(refresh)` (refresh icon)
  - Located in view title navigation bar (header)
  - Clears all caches (tag cache and tree view caches) to force fresh git lookups
  - Hidden when extension is deactivated
- `Open All Changes`: Open all changed files in multi-file diff view
  - Icon: `$(files)` (files icon)
  - Located in view title navigation bar (header)
  - Uses `vscode.changes` command to show all changes in a single multi-file diff view
  - Skips deleted files to avoid errors
  - Hidden when extension is deactivated
- `Open Changes` (on files): Open diff view for a changed file (inline icon: compare-changes)
  - Hidden when extension is deactivated
- `Open Changes` (on directories): Open all files in directory in multi-file diff view (inline icon: request-changes)
  - Only shown in tree mode on directory items
  - Recursively collects all files in the directory and subdirectories
  - Uses `vscode.changes` command with format `[URI, URI, URI][]` as `[label, left, right][]`
  - Skips deleted files in multi-file view
  - Hidden when extension is deactivated
- `Open File`: Open file directly without diff (inline icon: go-to-file)
  - Hidden when extension is deactivated
- `View as List` / `View as Tree`: Toggle between list and tree display modes (shown in view menu with checkmarks)
  - Hidden when extension is deactivated
- `Open File by Default` / `Open Changes by Default`: Set default click action (in view title ... menu, conditionally shown)
  - Hidden when extension is deactivated
- `Restore File`: Restore a single file to ref state (inline icon: discard)
  - Shows confirmation dialog before restore
  - Deletes added files, restores renamed files to original path, restores content for modified files
  - Hidden when extension is deactivated
- `Restore Directory`: Restore all files in a directory to ref state (inline icon: discard)
  - Shows confirmation dialog with file count before restore
  - Applies same restore logic as single file to all files in directory
  - Hidden when extension is deactivated

### Testing Variable Substitution
Set `gitbranchquickdiff.ref` to test variable patterns:
- `${git:lastTag}` - last reachable tag
- `${git:lastTag:^v[0-9].*}` - last semver tag starting with 'v'
- `${git:track}` - tracking branch
- `${env:MYREF}` - environment variable from launch config

## File Organization

- **Type definitions**:
  - `git.d.ts`: Git extension API types (from VS Code git extension)
  - `vscode.proposed.quickDiffProvider.d.ts`: Proposed API types for QuickDiffProvider
- **UI Components**: `changesTreeView.ts` (tree view + decorations for SCM viewlet)
- **Compilation**: `tsconfig.json` targets ES2024, strict mode enabled, outputs to `out/`
- **Linting**: ESLint with `@typescript-eslint/parser` (see `.eslintrc.json`)
  - Naming conventions, semicolons, curly braces, strict equality
  - Ignores: `out/`, `dist/`, `**/*.d.ts`

## Critical Notes

- **Proposed API**: Requires VS Code 1.107.1+ and explicit enabling in:
  - `package.json`: `"enabledApiProposals": ["quickDiffProvider"]`
  - `launch.json`: `--enable-proposed-apis sylvercode.gitbranchquickdiff` argument
  - Won't work in production without API finalization or insider builds
- **Variable Substitution**: The ref setting supports glob patterns like `${git:lastTag:v*}` for pattern-filtered tags (uses `git describe --match`). Variables are processed recursively if `recursive` flag is set.
- **Repository Scoping**: Provider pattern matching uses `${repository.rootUri.fsPath}/**` to scope to specific repos in multi-root workspaces.
- **Git URI Virtual File System**: `git.toGitUri(uri, ref)` returns special URIs (scheme: `git`) that VS Code's git extension resolves to historical file content.
- **HEAD State Watching**: `repository.state.onDidChange` fires on many events; use it to detect branch switches and refresh providers.
- **Performance Optimizations**:
  - Tree view debounces rapid changes (100ms) via event emitter pattern
  - Decoration provider only fires events for changed URIs to minimize redraws
  - Separate caches for `diffBetween()` and `diffWith()` with smart state-based invalidation
  - Tag lookups use native `git describe` (100-1000x faster than API loops)
  - Configurable tag cache TTL prevents redundant git operations
  - All cache invalidation is reactive (no polling) - triggers only on actual state changes
- **Deactivation State**: When `gitbranchquickdiff.enabled` is false:
  - QuickDiffProvider returns `undefined` (falls back to VS Code default)
  - Tree view shows activation message with clickable command
  - All commands except "activate" are hidden from view menus
  - View title displays "Quick Diff (deactivated)"

## Configuration Schema

```typescript
gitbranchquickdiff.ref: string (default: "main")
gitbranchquickdiff.enabled: boolean (default: true)
gitbranchquickdiff.displayMode: "list" | "tree" (default: "list")
gitbranchquickdiff.defaultAction: "openChanges" | "openFile" (default: "openChanges")
gitbranchquickdiff.tagCacheTTL: number (default: 1) // Cache duration in minutes for ${git:lastTag} lookups. 0 = no time-based expiry
```

**Configuration vs Workspace State:**
- All settings (`enabled`, `ref`, `displayMode`, `defaultAction`) have defaults in configuration
- Actual values are stored in **global workspace state** (keys: `gitbranchquickdiff.ref`, `gitbranchquickdiff.enabled`, etc. - no repository path suffix)
- Commands write to workspace state, not configuration
- Configuration values are used only as fallbacks when workspace state is undefined
- **Configuration Change Handling**: When user changes a configuration setting, the corresponding workspace state override is automatically cleared to let the new config value take effect
- This allows workspace-level customization that overrides configuration settings

The `ref` value undergoes variable substitution before use, enabling dynamic references based on workspace state.
The `enabled` value is persisted in global workspace state.
The `displayMode` value is persisted in global workspace state to remember user's preferred view mode.
The `defaultAction` value is persisted in global workspace state to control what happens when clicking a file in the tree view.

## Common Development Patterns

### Adding a New Variable
1. Add pattern matching in `vscode-variables.ts` `processVariables()`
2. Use `str.replace()` or `str.matchAll()` for complex patterns
3. Test with git repository operations (e.g., `repository.getRefs()`)
4. Handle errors gracefully (fallback to empty string)

### Modifying Tree View Display
1. Update `ChangedFile` constructor to change label/description/icon
2. Modify `getStatusText()`, `getStatusColor()`, or `getStatusTooltip()` for shared logic
3. Refresh tree via `treeDataProvider.refresh()` to see changes
4. Consider display mode context when showing directory paths (list shows full path, tree doesn't)

### Display Mode Implementation
1. **List Mode**: Flat list with full paths, sorted by path with root files first
2. **Tree Mode**: Hierarchical structure using `DirectoryNode` items
3. **Switching Modes**: Updates `_displayMode` in provider and calls `refresh()`
4. **Folder Compacting**: Respects `explorer.compactFolders` setting in tree mode
5. **Sorting**: Directories always before files, both sorted alphabetically

### Changing When Providers Re-register
1. Add event listener in `registerProvider()` function
2. Call `reregisterQuickDiffProvider(repository)` helper
3. Remember: Tree views refresh, decorations update, providers re-register

### Handling New Git Status Types
1. Add case to `getStatusText()`, `getStatusColor()`, `getStatusTooltip()`
2. Consider if it should appear in decorations (see decoration strategy above)
3. Test with staged, unstaged, and merged change scenarios
