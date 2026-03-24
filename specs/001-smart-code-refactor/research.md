# Research: SMART Code Refactor and Source Reorganization

**Feature**: 001-smart-code-refactor
**Date**: 2026-03-23

## R1: Folder Organization Pattern for VS Code Extensions

**Decision**: Shallow one-level subfolders under `src/` grouped by responsibility domain (`commands/`, `quickdiff/`, `views/`, `utils/`).

**Rationale**: VS Code extension projects are typically small-to-medium codebases. A single level of domain folders provides clear separation without over-engineering. This matches common patterns in well-maintained VS Code extensions (e.g., GitLens, Git Graph) where the source root has feature-oriented folders. The project's ~8 files will expand to ~15-20 — deep nesting would add navigation overhead for no gain.

**Alternatives considered**:
- **Domain-grouped two-level** (e.g., `src/quickdiff/sub-providers/`): Rejected because the project has only one feature domain; a second level adds indirection without aiding discoverability.
- **Flat with prefixes** (e.g., `commands-changeRef.ts`): Rejected because it doesn't provide IDE folder-level collapsing and makes the file list longer rather than shorter.

## R2: Responsibility Extraction Strategy for gitbranchquickdiff.ts (~1350 lines)

**Decision**: Split into four domains: workspace state management → `utils/workspaceState.ts`, command handlers → `commands/*.ts`, provider classes → `quickdiff/*.ts`, provider registration lifecycle → `quickdiff/providerRegistration.ts`.

**Rationale**: The file currently mixes five distinct responsibilities: (1) workspace state read/write/migration helpers, (2) 16+ command handler functions, (3) two provider classes (`CustomQuickDiffProvider`, `GitBranchQuickDiffContentProvider`), (4) provider lifecycle orchestration (registration, re-registration, repository add/remove), (5) command registration wiring. Each maps cleanly to one target module. The workspace state helpers are consumed by both commands and providers, making `utils/` the correct home per the cross-cutting concern decision.

**Alternatives considered**:
- **Keep providers + registration together**: Rejected because the registration logic (~200 lines) handles tree view creation, listener setup, and repository lifecycle — a distinct orchestration concern from the provider classes themselves.
- **One file per command**: Rejected for pragmatic size reasons. Most command handlers are 10-30 lines. Grouping by theme (ref management, view mode, open actions, restore actions) keeps files meaningful without one-function-per-file explosion.

## R3: Responsibility Extraction Strategy for changesTreeView.ts (~1300 lines)

**Decision**: Split into five modules: `views/changesTreeDataProvider.ts` (per-repo provider with caching), `views/multiRepoTreeDataProvider.ts` (multi-repo orchestrator), `views/nodes.ts` (RepositoryNode, DirectoryNode, ChangedFile, MessageItem), `views/decorationProvider.ts` (ChangesDecorationProvider), `views/treeBuilder.ts` (buildTree + compact). Shared status utilities move to `utils/statusHelpers.ts`.

**Rationale**: `changesTreeView.ts` contains two distinct `TreeDataProvider` implementations, four `TreeItem` subclasses, a `FileDecorationProvider`, a standalone tree-building algorithm, a shared `openChange` function, and status mapping utilities. The status utilities (`getStatusText`, `getStatusColor`, `getStatusTooltip`, `ExtendedStatus`) are consumed by both nodes and decoration — they are cross-cutting and belong in `utils/`. The `openChange` function is called from both `commands/openCommands.ts` and `changesTreeView.ts` node click handling; it stays in `views/` since it is view-action logic.

**Alternatives considered**:
- **Two files only** (tree providers + everything else): Rejected because nodes, decoration, and tree building are distinct concerns with different change frequencies.
- **Move status helpers to views/**: Rejected because they are also consumed by the decoration provider and could be needed by future modules — `utils/` is the resolved home for cross-cutting concerns.

## R4: Barrel File (`index.ts`) Pattern

**Decision**: Each subfolder exposes an `index.ts` that re-exports the public API of that folder. Internal implementation details not needed outside the folder are not re-exported.

**Rationale**: Barrel files provide stable import paths (`from './commands'`) that decouple consumers from internal file structure. If an internal file is renamed or split further, only the barrel needs updating. This is a standard TypeScript pattern for module boundaries.

**Alternatives considered**:
- **Direct file imports** (e.g., `from './commands/refCommands'`): Rejected because it couples consumers to internal file names, making future restructuring more invasive.
- **Single barrel at `src/index.ts`**: Rejected because it flattens all exports into one namespace, defeating the purpose of folder-based domain separation.

## R5: Module Granularity Threshold

**Decision**: Extractions under ~50 lines may be grouped with a closely related module rather than requiring a standalone file. Classes always get their own file if they exceed this threshold or have distinct state.

**Rationale**: Avoiding one-function files keeps the file count manageable (~15-20 target vs. 25+ with strict one-concern-per-file). The threshold is pragmatic, not absolute — a 30-line class with its own state still warrants a standalone file.

**Alternatives considered**:
- **Strict one-concern-per-file**: Rejected for this project size. Would create many files under 30 lines each, increasing navigation overhead without proportional benefit.
- **No threshold (merge freely)**: Rejected because it would recreate the current problem of mixed-responsibility files over time.

## R6: Import Path and Migration Strategy

**Decision**: All imports updated in a single pass. `extension.ts` imports from barrel files. Subfolder modules may import from sibling barrels or directly from `utils/` barrel. Type definitions (`externals/git.d.ts`, proposed API) live in `src/externals/` and are imported with relative paths from any depth.

**Rationale**: A single-pass migration is feasible because all consumers are within the same project and the TypeScript compiler will immediately flag broken imports. There is no runtime import resolution to worry about. Type definition files are grouped in `externals/` to clearly separate external contracts not authored by this project from application code.

**Alternatives considered**:
- **tsconfig path aliases** (e.g., `@commands/`): Rejected as over-engineering for a project with one level of nesting. Relative paths are sufficient and don't require build configuration changes.
- **Gradual migration with re-exports from old locations**: Rejected because this is an internal refactor with no external consumers; a clean cutover is simpler.

## R7: Architecture Documentation Update

**Decision**: `docs/architecture.md` will be updated as a deliverable of this refactor to reflect the new source layout and module responsibility map.

**Rationale**: Constitution principle III and the Development Workflow section require that any change to component structure be reflected in `docs/architecture.md` before the change is considered complete.

**Alternatives considered**: None — this is a constitutional requirement, not optional.
