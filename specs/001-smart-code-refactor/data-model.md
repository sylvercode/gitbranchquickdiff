# Data Model: SMART Code Refactor and Source Reorganization

**Feature**: 001-smart-code-refactor
**Date**: 2026-03-23

## Overview

This refactor does not introduce new data entities. The data model documents the **module responsibility map** — the primary structural artifact produced by this feature. Each entry defines a module's boundary, what it owns, and what is explicitly out of scope.

## Module Responsibility Map

### commands/registerCommands.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Wire all command identifiers to their handler functions |
| **Owns** | `registerCommands(context)` function, `registerCommand` helper |
| **Out of Scope** | Command implementation logic; command handlers live in sibling files |
| **Dependencies** | `vscode.commands.registerCommand`, command handler modules |

### commands/refCommands.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Manage the comparison reference for repositories |
| **Owns** | `changeRef`, `resetRef`, `updateRecentRefs`, `pickRepository` |
| **Out of Scope** | Workspace state read/write (delegates to `utils/workspaceState`) |
| **Dependencies** | `utils/workspaceState`, `utils/l10n`, `views/nodes` (RepositoryNode type) |

### commands/viewCommands.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Toggle display mode, default action, submodule display, enabled state |
| **Owns** | `setListMode`, `setTreeMode`, `setDefaultActionOpenFile`, `setDefaultActionOpenChanges`, `enableExtention`, `disableExtention`, `toggleSubmoduleDisplay`, `clearWorkspaceCache` |
| **Out of Scope** | Tree view rendering; only updates state and triggers refresh |
| **Dependencies** | `utils/workspaceState`, `views/multiRepoTreeDataProvider` (refresh) |

### commands/openCommands.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Open diff views and file views for changed items |
| **Owns** | `openChangeCommand`, `openFileCommand`, `openDirectoryChangesCommand`, `openAllChangesCommand`, `buildChangesArray`, `refreshChanges` |
| **Out of Scope** | Diff computation; delegates to tree data providers for file lists |
| **Dependencies** | `views/nodes` (ChangedFile, DirectoryNode, RepositoryNode types), `views/changesTreeDataProvider` (openChange function) |

### commands/restoreCommands.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Restore files or directories to their state at the comparison ref |
| **Owns** | `restoreFileCommand`, `restoreDirectoryCommand` |
| **Out of Scope** | Git operations beyond restore (checkout, diff) |
| **Dependencies** | `utils/workspaceState`, `utils/l10n`, `views/nodes` |

### quickdiff/quickDiffProvider.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Map current files to their historical counterparts at the comparison ref |
| **Owns** | `CustomQuickDiffProvider` class (`provideOriginalResource`, `updateLabel`) |
| **Out of Scope** | File content retrieval; delegates to contentProvider via URI scheme |
| **Dependencies** | `utils/workspaceState` (getCurrentRef), `externals/git.d.ts` types |

### quickdiff/contentProvider.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Serve file content from git at a specified ref |
| **Owns** | `GitBranchQuickDiffContentProvider` class (`provideTextDocumentContent`), `QUICKDIFF_SCHEME` constant |
| **Out of Scope** | Determining which ref to use; receives ref in URI |
| **Dependencies** | `externals/git.d.ts` (Repository.show), `child_process` (execFile for git show) |

### quickdiff/providerRegistration.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Orchestrate provider lifecycle: register, re-register, and dispose providers per repository |
| **Owns** | `registerProvider`, `registerRepo`, `reregisterQuickDiffProvider`, `reregisterAllProvidersFunc`, HEAD change listeners, config change listeners, repository open/close handlers |
| **Out of Scope** | Provider implementation; uses provider classes from sibling modules |
| **Dependencies** | `quickdiff/quickDiffProvider`, `quickdiff/contentProvider`, `views/`, `utils/workspaceState`, `utils/gitApi` |
| **State** | Module-level variables: `currentMultiRepoProvider`, `firstRepository`, `gitAPI`, `reregisterAllProvidersFunc` |

### views/changesTreeDataProvider.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Compute and cache changed files for a single repository |
| **Owns** | `ChangesTreeDataProvider` class (dual-cache strategy, debounced refresh, `getChangedFiles`, `getChildren`) |
| **Out of Scope** | Multi-repo orchestration; that is `MultiRepoTreeDataProvider`'s concern |
| **Dependencies** | `views/nodes`, `views/treeBuilder`, `views/decorationProvider`, `utils/statusHelpers` |

### views/multiRepoTreeDataProvider.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Orchestrate multiple per-repo tree providers into a single tree view |
| **Owns** | `MultiRepoTreeDataProvider` class (repo map, submodule map, single-repo optimization, `getChildren`, `addRepository`, `removeRepository`) |
| **Out of Scope** | Per-repo diff computation; delegates to `ChangesTreeDataProvider` |
| **Dependencies** | `views/changesTreeDataProvider`, `views/nodes` |

### views/nodes.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Define tree item classes for the changes tree view |
| **Owns** | `RepositoryNode`, `DirectoryNode`, `ChangedFile`, `MessageItem` |
| **Out of Scope** | Data fetching or caching; nodes are pure view models |
| **Dependencies** | `utils/statusHelpers` (for color and icon), `utils/l10n` |

### views/decorationProvider.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Apply file decorations (badges, colors) in the explorer for diff changes |
| **Owns** | `ChangesDecorationProvider` class (`setChanges`, `provideFileDecoration`) |
| **Out of Scope** | Deciding which files are changed; receives change list from tree provider |
| **Dependencies** | `utils/statusHelpers` |

### views/treeBuilder.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Build directory→file tree hierarchy from a flat file list |
| **Owns** | `buildTree` function, compact-folder logic (reads `explorer.compactFolders` setting) |
| **Out of Scope** | File change computation; receives pre-computed `ChangedFile[]` |
| **Dependencies** | `views/nodes` (DirectoryNode, ChangedFile types) |

### utils/workspaceState.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Read, write, and migrate VS Code workspace state for extension settings |
| **Owns** | `getRawRef`, `getCurrentRef`, `getCurrentEnabled`, `getCurrentDisplayMode`, `getCurrentDefaultAction`, `getCurrentSubmoduleDisplay`, `migrateWorkspaceState`, all `WORKSPACE_STATE_KEY_*` constants, `DEFAULT_*` constants, `EXTENTION_NAME` constant |
| **Out of Scope** | Business logic that uses these values; only provides state access |
| **Dependencies** | `utils/vscodeVariables` (for `getCurrentRef`), `externals/git.d.ts` |

### utils/statusHelpers.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Map git status codes to display representations |
| **Owns** | `ExtendedStatus` enum, `toExtendedStatus`, `getStatusText`, `getStatusColor`, `getStatusTooltip`, `DisplayMode` enum, `DIFF_BADGE_SUFFIX` constant |
| **Out of Scope** | Applying decorations or rendering status; only provides mappings |
| **Dependencies** | `utils/l10n`, `externals/git.d.ts` (Status enum) |

### utils/l10n.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Provide localized string lookup |
| **Owns** | `initLocalization`, `l10n` function |
| **Out of Scope** | Translation file management; reads from `l10n/` directory |
| **Dependencies** | `vscode`, `fs`, `path` |

### utils/gitApi.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Acquire the VS Code Git extension API |
| **Owns** | `getGitAPI`, `getGitRepository` |
| **Out of Scope** | Using the API; only provides access |
| **Dependencies** | `vscode` |

### utils/vscodeVariables.ts

| Attribute | Value |
|-----------|-------|
| **Primary Concern** | Substitute `${...}` variables in ref strings |
| **Owns** | `variables` function, `clearTagCache`, tag cache management |
| **Out of Scope** | Deciding which ref to resolve; receives raw ref string |
| **Dependencies** | `vscode`, `child_process`, `externals/git.d.ts` |

## Validation Rules

- **Circular dependency prohibition**: No folder may import from a folder that imports from it. The dependency order is: `utils/` ← `views/` ← `quickdiff/` ← `commands/`. `extension.ts` imports from `commands/` and `quickdiff/`.
- **Barrel completeness**: Every public export from a subfolder must appear in its `index.ts`.
- **Type definition immutability**: `externals/git.d.ts` and `externals/vscode.proposed.quickDiffProvider.d.ts` must not be modified. They are moved to `src/externals/` but their contents remain unchanged.

## State Transitions

No new state machines are introduced. Existing workspace state keys and their read/write patterns are preserved identically in `utils/workspaceState.ts`.
