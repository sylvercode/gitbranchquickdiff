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
