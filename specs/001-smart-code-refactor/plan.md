# Implementation Plan: SMART Code Refactor and Source Reorganization

**Branch**: `001-smart-code-refactor` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-smart-code-refactor/spec.md`

## Summary

Split two oversized mixed-responsibility files (`gitbranchquickdiff.ts` ~1350 lines, `changesTreeView.ts` ~1300 lines) into focused single-responsibility modules organized in a shallow one-level subfolder hierarchy under `src/`. Each subfolder exposes a barrel `index.ts`. Cross-cutting utilities go to `src/utils/`. `extension.ts` remains the sole entry point. All user-visible behavior and command registrations are preserved.

## Technical Context

**Language/Version**: TypeScript (strict mode via `tsconfig.json`)
**Primary Dependencies**: VS Code Extension API, VS Code built-in Git extension API (v1), proposed `quickDiffProvider` API
**Package Manager**: npm
**Build**: `npm run compile` (`tsc -p ./`), `npm run watch` (`tsc -watch -p ./`)
**Storage**: VS Code workspace state (`context.workspaceState`)
**Testing**: Manual testing only (per constitution)
**Target Platform**: VS Code Extension Host (requires `--enable-proposed-api=sylvercode.gitbranchquickdiff`)
**Project Type**: VS Code extension (VSIX distribution only)
**Performance Goals**: State-based caching, 100ms debounce on rapid refreshes, no timer-based invalidation except tag TTL
**Constraints**: Must not break proposed API compatibility; must not modify `externals/git.d.ts` or `externals/vscode.proposed.quickDiffProvider.d.ts`
**Scale/Scope**: ~8 source files → ~15-20 after refactor, ~3500 total lines of application code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Proposed API Compatibility | ✅ PASS | Refactor does not alter proposed API usage; `vscode.proposed.quickDiffProvider.d.ts` is moved to `externals/` but not modified. QuickDiffProvider registration logic is extracted but not changed. |
| II. Multi-Repository by Default | ✅ PASS | Per-repo state keys, multi-repo provider structure, and submodule support are preserved. Module extraction maintains the same `Map<Repository, ...>` patterns. |
| III. VS Code Extension Conventions | ✅ PASS | `package.json` contributions unchanged. `extension.ts` remains sole activation entry point. All APIs (`TreeDataProvider`, `FileDecorationProvider`, `registerCommand`) used identically. |
| IV. Performance via State-Based Caching | ✅ PASS | Dual-cache strategy (`_cachedDiffBetween`, `_cachedDiffWith`) stays in `ChangesTreeDataProvider`. Debounce timers preserved. No new timer-based invalidation introduced. |
| V. Localization Ready | ✅ PASS | `l10n()` usage preserved across all moved modules. No new hardcoded user-facing strings. |
| Architecture Documentation | ✅ PASS | `docs/architecture.md` must be updated to reflect new structure (included as deliverable). |

**Gate Result**: ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-smart-code-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code — Current Structure

```text
src/
├── extension.ts              # 7 lines — entry point
├── gitbranchquickdiff.ts     # ~1350 lines — mixed controller/commands/providers/state
├── changesTreeView.ts        # ~1300 lines — mixed tree/decoration/nodes/multi-repo
├── gitApi.ts                 # ~20 lines — Git extension wrapper
├── l10n.ts                   # ~70 lines — localization
├── vscode-variables.ts       # ~300 lines — variable substitution engine
├── git.d.ts                  # ~300 lines — type definitions (DO NOT MODIFY)
└── vscode.proposed.quickDiffProvider.d.ts  # ~20 lines (DO NOT MODIFY)
```

### Source Code — Target Structure

```text
src/
├── extension.ts                          # Entry point (delegates to subfolders)
├── commands/                             # Command handler implementations
│   ├── index.ts                          # Barrel: exports registerCommands + individual commands
│   ├── registerCommands.ts               # Command registration wiring
│   ├── refCommands.ts                    # changeRef, resetRef, updateRecentRefs
│   ├── viewCommands.ts                   # setListMode, setTreeMode, setDefaultAction*
│   ├── openCommands.ts                   # openChange, openFile, openDirectoryChanges, openAllChanges
│   └── restoreCommands.ts               # restoreFile, restoreDirectory
├── quickdiff/                            # QuickDiff and content providers
│   ├── index.ts                          # Barrel: exports provider classes + registration
│   ├── quickDiffProvider.ts              # CustomQuickDiffProvider class
│   ├── contentProvider.ts                # GitBranchQuickDiffContentProvider class
│   └── providerRegistration.ts           # registerProvider, registerRepo, reregister logic
├── views/                                # Tree view data providers and UI nodes
│   ├── index.ts                          # Barrel: exports all view classes + enums
│   ├── changesTreeDataProvider.ts        # ChangesTreeDataProvider (per-repo, with caching)
│   ├── multiRepoTreeDataProvider.ts      # MultiRepoTreeDataProvider (orchestrator)
│   ├── nodes.ts                          # RepositoryNode, DirectoryNode, ChangedFile, MessageItem
│   ├── decorationProvider.ts             # ChangesDecorationProvider
│   └── treeBuilder.ts                    # buildTree function + directory compacting
├── utils/                                # Cross-cutting shared utilities
│   ├── index.ts                          # Barrel: exports all utilities
│   ├── l10n.ts                           # Localization (moved from src/l10n.ts)
│   ├── gitApi.ts                         # Git extension wrapper (moved from src/gitApi.ts)
│   ├── vscodeVariables.ts                # Variable substitution (moved from src/vscode-variables.ts)
│   ├── statusHelpers.ts                  # getStatusText, getStatusColor, getStatusTooltip, ExtendedStatus
│   └── workspaceState.ts                 # getRawRef, getCurrentRef, getCurrentEnabled, etc. + migration
└── externals/                            # External type definitions (DO NOT MODIFY contents)
    ├── git.d.ts                          # Git extension API types
    └── vscode.proposed.quickDiffProvider.d.ts  # Proposed QuickDiff API types
```

**Structure Decision**: Shallow one-level subfolders under `src/` organized by responsibility domain. Five subfolders: `commands/` (command handlers), `quickdiff/` (QuickDiff and content providers), `views/` (tree data providers, node classes, decorations), `utils/` (shared cross-cutting utilities), `externals/` (external type definitions — DO NOT MODIFY contents). Each subfolder except `externals/` has an `index.ts` barrel file. Type definition files are moved to `src/externals/`.

## Complexity Tracking

> No constitution violations to justify.
