# GitBranchQuickDiff Architecture

## Responsibility Domains

The runtime source is organized into one-level responsibility domains under `src/`.

| Domain | Primary responsibility | Public entry |
|---|---|---|
| `commands/` | Command handlers and command registration wiring | `src/commands/index.ts` |
| `quickdiff/` | Quick diff providers and provider lifecycle orchestration | `src/quickdiff/index.ts` |
| `views/` | Tree nodes, per-repo change computation, multi-repo orchestration, file decorations | `src/views/index.ts` |
| `utils/` | Cross-cutting helpers for localization, Git API access, workspace state, status mapping, variable substitution | `src/utils/index.ts` |
| `externals/` | External type definitions that are not project-owned | no barrel |

## Source Layout

```text
src/
├── extension.ts
├── commands/
│   ├── index.ts
│   ├── openCommands.ts
│   ├── refCommands.ts
│   ├── registerCommands.ts
│   ├── restoreCommands.ts
│   └── viewCommands.ts
├── quickdiff/
│   ├── contentProvider.ts
│   ├── index.ts
│   ├── providerRegistration.ts
│   └── quickDiffProvider.ts
├── views/
│   ├── changesTreeDataProvider.ts
│   ├── decorationProvider.ts
│   ├── index.ts
│   ├── multiRepoTreeDataProvider.ts
│   ├── nodes.ts
│   └── treeBuilder.ts
├── utils/
│   ├── gitApi.ts
│   ├── index.ts
│   ├── l10n.ts
│   ├── statusHelpers.ts
│   ├── vscodeVariables.ts
│   └── workspaceState.ts
└── externals/
    ├── git.d.ts
    └── vscode.proposed.quickDiffProvider.d.ts
```

## Dependency Direction

The intended dependency order is enforced in code review and import usage:

```text
externals/
    ↑
utils/
    ↑
views/
    ↑
quickdiff/
    ↑
commands/
    ↑
extension.ts
```

Rules:

- `utils/` does not import from `views/`, `quickdiff/`, or `commands/`.
- `views/` imports only from `utils/` and `externals/`.
- `quickdiff/` imports from `views/`, `utils/`, and `externals/`.
- `commands/` imports from `quickdiff/`, `views/`, `utils/`, and `externals/`.
- `extension.ts` remains the only activation entry point.

## Activation Flow

`extension.ts` is intentionally minimal:

1. Initialize localization through `utils/initLocalization`.
2. Register commands through `commands/registerCommands`.
3. Register the quick diff and tree-view runtime through `quickdiff/registerProvider`.

This keeps activation wiring centralized while keeping behavior ownership in the relevant responsibility domain.

## Module Ownership

### `commands/`

- `registerCommands.ts`: owns the command identifier to handler mapping.
- `refCommands.ts`: owns ref selection, ref reset, recent-ref persistence, and repository picking.
- `openCommands.ts`: owns diff opening, file opening, directory-wide diff opening, and explicit refresh.
- `restoreCommands.ts`: owns restore-to-ref workflows for files and directories.
- `viewCommands.ts`: owns enable/disable state, display mode, default action, submodule mode, and workspace-cache clearing.

### `quickdiff/`

- `quickDiffProvider.ts`: maps a working file to its original resource at the current comparison ref.
- `contentProvider.ts`: resolves file content from Git at a given ref through the custom URI scheme.
- `providerRegistration.ts`: owns provider lifecycle, tree-view creation, repository add/remove handling, HEAD-change handling, config-change handling, and command-facing runtime getters.

### `views/`

- `nodes.ts`: owns `RepositoryNode`, `DirectoryNode`, `ChangedFile`, and `MessageItem`.
- `treeBuilder.ts`: owns the directory-tree construction and compact-folder logic.
- `decorationProvider.ts`: owns explorer and tab decoration updates for diff changes.
- `changesTreeDataProvider.ts`: owns per-repository change computation, status synthesis, caching, debounce, and `openChange`.
- `multiRepoTreeDataProvider.ts`: owns multi-repository orchestration, single-repo optimization, and integrated submodule presentation.

### `utils/`

- `workspaceState.ts`: owns workspace-state keys, config fallbacks, state migration, and state getters.
- `statusHelpers.ts`: owns `ExtendedStatus`, `DisplayMode`, and all status-to-display mappings.
- `vscodeVariables.ts`: owns `${...}` substitution and tag-cache handling.
- `gitApi.ts`: owns acquisition of the built-in Git extension API.
- `l10n.ts`: owns runtime localization lookup and initialization.

## Provider Lifecycle

Quick diff providers are intentionally re-registered instead of being mutated in place. Re-registration occurs when:

- a repository HEAD changes
- the effective ref changes
- the effective display mode changes
- the effective default action changes
- the effective submodule display mode changes

The tree view itself is created once, then refreshed or updated as repositories and settings change.

## Workspace State Strategy

The extension stores runtime state in workspace storage, not by mutating user settings.

- Per-repo state:
  - `gitbranchquickdiff.refs`
  - `gitbranchquickdiff.recentRefs`
- Global state:
  - `gitbranchquickdiff.enabled`
  - `gitbranchquickdiff.displayMode`
  - `gitbranchquickdiff.defaultAction`
  - `gitbranchquickdiff.submoduleDisplay`

Configuration values remain the default source when no workspace override exists. Legacy single-repo state is migrated to the per-repo format by `utils/workspaceState.ts`.

## Performance-Critical Behavior

`views/changesTreeDataProvider.ts` preserves the existing performance model:

- `diffBetween(ref, 'HEAD')` is cached until the ref or HEAD commit changes.
- `diffWith(ref)` is cached until the ref or working-tree state counts change.
- explicit refresh clears both caches.
- refresh events are debounced by 100ms.

This keeps the refactor behaviorally equivalent while preserving the state-based caching strategy required by the constitution.

## Navigation Examples

Use these ownership rules when changing behavior:

- Command registration: `src/commands/registerCommands.ts`
- Quick diff source resolution: `src/quickdiff/quickDiffProvider.ts`
- Provider lifecycle and multi-repo registration: `src/quickdiff/providerRegistration.ts`
- Tree node composition: `src/views/nodes.ts`
- Per-repo change computation and cache logic: `src/views/changesTreeDataProvider.ts`
- Multi-repo and submodule orchestration: `src/views/multiRepoTreeDataProvider.ts`
- Workspace-state persistence: `src/utils/workspaceState.ts`
- Status display mapping: `src/utils/statusHelpers.ts`

## External Definitions

`src/externals/git.d.ts` and `src/externals/vscode.proposed.quickDiffProvider.d.ts` are external contracts. They are grouped separately from project-owned runtime code and must not be modified as part of feature work unless the targeted upstream API version changes.
