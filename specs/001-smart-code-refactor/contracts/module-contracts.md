# Module Contracts: SMART Code Refactor and Source Reorganization

**Feature**: 001-smart-code-refactor
**Date**: 2026-03-23

## Overview

This project is a VS Code extension. Its external interface contracts are defined in `package.json` (commands, configuration, views, menus). The refactor does not change any external contract. This document defines the **internal barrel file contracts** — the public API each subfolder exposes.

## commands/index.ts

```typescript
export { registerCommands } from './registerCommands';
export { changeRef, resetRef } from './refCommands';
export { refreshChanges, openChangeCommand, openFileCommand, openDirectoryChangesCommand, openAllChangesCommand } from './openCommands';
export { restoreFileCommand, restoreDirectoryCommand } from './restoreCommands';
export { enableExtention, disableExtention, setListMode, setTreeMode, setDefaultActionOpenFile, setDefaultActionOpenChanges, clearWorkspaceCache, toggleSubmoduleDisplay } from './viewCommands';
```

## quickdiff/index.ts

```typescript
export { CustomQuickDiffProvider } from './quickDiffProvider';
export { GitBranchQuickDiffContentProvider, QUICKDIFF_SCHEME } from './contentProvider';
export { registerProvider, getCurrentMultiRepoProvider, getRegisteredGitApi, reregisterAllProviders } from './providerRegistration';
```

## views/index.ts

```typescript
export { RepositoryNode, DirectoryNode, ChangedFile, MessageItem } from './nodes';
export { ExtendedStatus, DisplayMode } from '../utils/statusHelpers';
export { ChangesTreeDataProvider } from './changesTreeDataProvider';
export { MultiRepoTreeDataProvider } from './multiRepoTreeDataProvider';
export { ChangesDecorationProvider } from './decorationProvider';
export { buildTree } from './treeBuilder';
export { openChange } from './changesTreeDataProvider';
```

## utils/index.ts

```typescript
export { initLocalization, l10n } from './l10n';
export { getGitAPI, getGitRepository } from './gitApi';
export { variables as vscodeVariables, clearTagCache } from './vscodeVariables';
export { ExtendedStatus, DisplayMode, toExtendedStatus, getStatusText, getStatusColor, getStatusTooltip, DIFF_BADGE_SUFFIX } from './statusHelpers';
export {
    EXTENTION_NAME,
    getRawRef,
    getCurrentRef,
    getCurrentEnabled,
    getCurrentDisplayMode,
    getCurrentDefaultAction,
    getCurrentSubmoduleDisplay,
    migrateWorkspaceState,
    REF_CONFIG_NAME,
    DISPLAY_MODE_CONFIG_NAME,
    DEFAULT_ACTION_CONFIG_NAME,
    SUBMODULE_DISPLAY_CONFIG_NAME,
    WORKSPACE_STATE_KEY_REF,
    WORKSPACE_STATE_KEY_REFS,
    WORKSPACE_STATE_KEY_ENABLED,
    WORKSPACE_STATE_KEY_DISPLAY_MODE,
    WORKSPACE_STATE_KEY_DEFAULT_ACTION,
    WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY,
    WORKSPACE_STATE_KEY_RECENT_REFS,
    MAX_RECENT_REFS
} from './workspaceState';
```

## Dependency Direction Contract

```
externals/      ← No barrel; type-only imports from any folder
    ↑
utils/          ← No internal dependencies (leaf layer)
    ↑
views/          ← May import from utils/ only
    ↑
quickdiff/      ← May import from utils/ and views/
    ↑
commands/       ← May import from utils/, views/, and quickdiff/
    ↑
extension.ts    ← May import from any subfolder
```

`externals/` contains only `.d.ts` type definitions. It has no barrel `index.ts`. Any module may import types from it using folder-relative paths such as `../externals/git`.

## External Contract Preservation

The following `package.json` contributions are unchanged by this refactor:

- **Commands**: All 18 `gitbranchquickdiff.*` commands remain registered with identical identifiers
- **Configuration**: All 6 settings (`ref`, `enabled`, `displayMode`, `defaultAction`, `tagCacheTTL`, `submoduleDisplay`) remain unchanged
- **Views**: `gitbranchquickdiff.changes` tree view remains registered
- **Menus**: All view/title, view/item/context, and commandPalette entries remain unchanged
- **Activation**: `onStartupFinished` activation event unchanged
