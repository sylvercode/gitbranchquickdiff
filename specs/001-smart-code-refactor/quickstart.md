# Quickstart: SMART Code Refactor and Source Reorganization

**Feature**: 001-smart-code-refactor
**Date**: 2026-03-23

## Prerequisites

- Node.js and npm installed
- VS Code with the extension development host available
- Git repository cloned at `/workspaces/gitbranchquickdiff`

## Build & Verify

```bash
# Install dependencies (if not already done)
npm install

# Compile TypeScript — should produce zero errors after refactor
npm run compile

# Start watch mode for development
npm run watch
```

## Manual Verification Checklist

After restructuring, verify in the VS Code Extension Development Host:

1. **Extension activates** — no errors in the Output panel for "GitBranchQuickDiff"
2. **Quick Diff gutter** — open a file modified since the comparison ref; gutter markers appear
3. **Change ref** — run "GitBranchQuickDiff: Change Ref" from command palette; quick pick appears with recent refs
4. **Reset ref** — run "GitBranchQuickDiff: Reset Ref"; ref resets to config default
5. **Tree view** — "Branch Changes" view shows changed files in sidebar
6. **List/Tree toggle** — toggle between list and tree display modes
7. **Open change** — click a changed file; diff view opens
8. **Open file** — right-click → "Open File"; file opens without diff
9. **Restore file** — right-click → "Restore File"; file restored to ref state
10. **Multi-repo** — if workspace has multiple repos, each shows as a RepositoryNode
11. **Submodule toggle** — toggle submodule display between standalone and integrated
12. **Enable/Disable** — deactivate and reactivate the extension; tree view shows appropriate message

## Post-Refactor Evidence Checklist

### Line-count Evidence for SC-001

| Original file | Original lines | Replacement modules reviewed | Largest replacement | Largest replacement ratio | Status |
|---|---:|---|---:|---:|---|
| `src/gitbranchquickdiff.ts` | 1327 | `src/commands/*.ts`, `src/quickdiff/*.ts`, `src/utils/workspaceState.ts` | `src/quickdiff/providerRegistration.ts` at 246 lines | 18.5% | PASS |
| `src/changesTreeView.ts` | 1446 | `src/views/*.ts`, `src/utils/statusHelpers.ts` | `src/views/changesTreeDataProvider.ts` at 450 lines | 31.1% | PASS |

### Ownership-Locatability Timing for SC-004

Use a timer and confirm each lookup completes in under 2 minutes:

- Command registration: `src/commands/registerCommands.ts`
- Quick diff source resolution: `src/quickdiff/quickDiffProvider.ts`
- Tree node composition: `src/views/nodes.ts`
- Workspace-state persistence: `src/utils/workspaceState.ts`

Record result:

| Behavior | Target | Result | Notes |
|---|---:|---|---|
| Command registration | < 2 min | Not run | Requires timed maintainer walkthrough |
| Quick diff source resolution | < 2 min | Not run | Requires timed maintainer walkthrough |
| Tree node composition | < 2 min | Not run | Requires timed maintainer walkthrough |
| Workspace-state persistence | < 2 min | Not run | Requires timed maintainer walkthrough |

### Behavioral Parity Checklist

- [x] `ChangesTreeDataProvider` keeps separate `diffBetween` and `diffWith` caches
- [x] `ChangesTreeDataProvider.refresh()` preserves the 100ms debounce
- [x] `providerRegistration.ts` still re-registers QuickDiff providers on HEAD changes
- [x] `providerRegistration.ts` still handles repository open/close lifecycle events
- [x] `MultiRepoTreeDataProvider` still supports `standalone` and `integrated` submodule display modes
- [ ] Extension Development Host checklist executed end-to-end

### Validation Log

| Validation item | Result | Evidence |
|---|---|---|
| TypeScript compile | PASS | `npm run compile` completed on 2026-03-24 |
| Static cache/debounce verification | PASS | `src/views/changesTreeDataProvider.ts` preserves dual-cache + 100ms debounce |
| Manual Extension Host verification | NOT RUN | Requires VS Code Extension Development Host execution |

## Source Navigation Guide

After refactor, the source is organized as:

| I need to... | Look in... |
|---|---|
| Change how commands are registered | `src/commands/registerCommands.ts` |
| Modify ref selection (change ref, reset ref) | `src/commands/refCommands.ts` |
| Modify diff/file opening behavior | `src/commands/openCommands.ts` |
| Modify file restoration | `src/commands/restoreCommands.ts` |
| Modify display mode / enable / disable | `src/commands/viewCommands.ts` |
| Change QuickDiff URI mapping | `src/quickdiff/quickDiffProvider.ts` |
| Change how historical file content is served | `src/quickdiff/contentProvider.ts` |
| Change provider lifecycle (registration, re-registration) | `src/quickdiff/providerRegistration.ts` |
| Modify how changed files are computed/cached | `src/views/changesTreeDataProvider.ts` |
| Modify multi-repo tree orchestration | `src/views/multiRepoTreeDataProvider.ts` |
| Change tree item appearance (icons, labels, tooltips) | `src/views/nodes.ts` |
| Change file decoration badges | `src/views/decorationProvider.ts` |
| Change tree/folder structure building | `src/views/treeBuilder.ts` |
| Modify workspace state reading/writing | `src/utils/workspaceState.ts` |
| Modify status character/color mapping | `src/utils/statusHelpers.ts` |
| Modify localization | `src/utils/l10n.ts` |
| Modify variable substitution (`${git:lastTag}`, etc.) | `src/utils/vscodeVariables.ts` |
| Modify Git API acquisition | `src/utils/gitApi.ts` |
| Find external type definitions (git, proposed API) | `src/externals/` |
