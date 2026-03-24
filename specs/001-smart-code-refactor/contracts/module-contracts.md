# Module Contracts: SMART Code Refactor and Source Reorganization

**Feature**: 001-smart-code-refactor
**Date**: 2026-03-23

## Overview

This project is a VS Code extension. Its external interface contracts are defined in `package.json` (commands, configuration, views, menus). The refactor does not change any external contract. This document defines the **internal barrel file contracts** — the public API each subfolder exposes.

## commands/index.ts

```typescript
// Command registration — called from extension.ts
export { registerCommands } from './registerCommands';

// Individual command functions — used by providerRegistration for wiring
export { changeRef, resetRef } from './refCommands';
export { refreshChanges, openChangeCommand, openFileCommand, openDirectoryChangesCommand, openAllChangesCommand } from './openCommands';
export { restoreFileCommand, restoreDirectoryCommand } from './restoreCommands';
export { enableExtention, disableExtention, setListMode, setTreeMode, setDefaultActionOpenFile, setDefaultActionOpenChanges, clearWorkspaceCache, toggleSubmoduleDisplay } from './viewCommands';
```

## quickdiff/index.ts

```typescript
export { CustomQuickDiffProvider } from './quickDiffProvider';
export { GitBranchQuickDiffContentProvider, QUICKDIFF_SCHEME } from './contentProvider';
export { registerProvider } from './providerRegistration';
```

## views/index.ts

```typescript
// Node types
export { RepositoryNode, DirectoryNode, ChangedFile, MessageItem } from './nodes';

// Enums
export { ExtendedStatus, DisplayMode } from '../utils/statusHelpers';

// Tree data providers
export { ChangesTreeDataProvider } from './changesTreeDataProvider';
export { MultiRepoTreeDataProvider } from './multiRepoTreeDataProvider';

// Decoration
export { ChangesDecorationProvider } from './decorationProvider';

// Tree building
export { buildTree } from './treeBuilder';

// View-action function
export { openChange } from './changesTreeDataProvider';
```

## utils/index.ts

```typescript
// Localization
export { initLocalization, l10n } from './l10n';

// Git API access
export { getGitAPI, getGitRepository } from './gitApi';

// Variable substitution
export { variables as vscodeVariables, clearTagCache } from './vscodeVariables';

// Status utilities
export { ExtendedStatus, DisplayMode, toExtendedStatus, getStatusText, getStatusColor, getStatusTooltip, DIFF_BADGE_SUFFIX } from './statusHelpers';

// Workspace state
export { EXTENTION_NAME, getRawRef, getCurrentRef, getCurrentEnabled, getCurrentDisplayMode, getCurrentDefaultAction, getCurrentSubmoduleDisplay, migrateWorkspaceState } from './workspaceState';
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

`externals/` contains only `.d.ts` type definitions. It has no barrel `index.ts`. Any module may import types from it.

## External Contract Preservation

The following `package.json` contributions are unchanged by this refactor:

- **Commands**: All 18 `gitbranchquickdiff.*` commands remain registered with identical identifiers
- **Configuration**: All 6 settings (`ref`, `enabled`, `displayMode`, `defaultAction`, `tagCacheTTL`, `submoduleDisplay`) remain unchanged
- **Views**: `gitbranchquickdiff.changes` tree view remains registered
- **Menus**: All view/title, view/item/context, and commandPalette entries remain unchanged
- **Activation**: `onStartupFinished` activation event unchanged
