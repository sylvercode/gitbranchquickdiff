# Testing Workspace State Feature

This document describes how to manually test the workspace state persistence feature for ref selection.

## Feature Overview

The extension now uses VS Code's Workspace State API to cache the currently selected ref per repository. The `gitbranchquickdiff.ref` setting acts as a default fallback when no cached ref exists.

## Test Scenarios

### 1. Initial State (No Cached Ref)
**Expected**: Extension should use the setting value as the default.

**Steps**:
1. Open the extension in VS Code (F5 to launch Extension Development Host)
2. Open a git repository
3. Check the tree view title - it should show `Quick Diff (main)` or the value from settings
4. Open the Source Control view and check the diff gutter on a modified file

### 2. Change Ref via Command (Save to Workspace State)
**Expected**: The ref should be saved to workspace state, not settings.

**Steps**:
1. Click the target icon (🎯) in the Quick Diff view title bar or use Command Palette: "Set quick diff ref"
2. Enter a different ref (e.g., `HEAD~1` or another branch name)
3. Verify the tree view title updates to show the new ref
4. Check `.vscode/settings.json` - the `gitbranchquickdiff.ref` value should NOT change
5. Check the diff gutter updates to compare against the new ref

### 3. Persistence Between Sessions
**Expected**: The cached ref should persist after restarting VS Code.

**Steps**:
1. Set a ref via the command (e.g., `HEAD~1`)
2. Close VS Code completely
3. Reopen VS Code and the same workspace
4. Verify the Quick Diff view shows the same ref (`HEAD~1`) that was set before closing

### 4. Reset to Default Setting
**Expected**: Clearing workspace state should revert to the setting value.

**Steps**:
1. Set a ref via the command (e.g., `develop`)
2. Use Command Palette: "Revert quick diff ref to user setting" or click the menu item
3. Verify the tree view title updates to show the default setting value (e.g., `main`)
4. Verify diff gutter updates accordingly
5. Check that a confirmation message appears: "Quick diff ref has been reset to the default from settings"

### 5. Multi-Root Workspace Support
**Expected**: Each repository should have its own cached ref.

**Steps**:
1. Open a multi-root workspace with at least 2 git repositories
2. Set different refs for each repository using the command
3. Verify each repository's Quick Diff view shows its own ref
4. Restart VS Code and verify both refs persist independently

### 6. Setting as Default
**Expected**: Changing the setting should affect repositories without cached refs.

**Steps**:
1. Reset workspace state using "Revert quick diff ref to user setting"
2. Change the `gitbranchquickdiff.ref` setting to a different value (e.g., `develop`)
3. Verify the tree view updates to show the new setting value
4. Set a custom ref via command
5. Change the setting again - this should NOT affect the currently displayed ref (cached ref takes precedence)

## Workspace State Storage Location

The workspace state is stored in VS Code's internal storage:
- **Linux**: `~/.config/Code/User/workspaceStorage/<workspace-id>/state.vscdb`
- **Windows**: `%APPDATA%\Code\User\workspaceStorage\<workspace-id>\state.vscdb`
- **macOS**: `~/Library/Application Support/Code/User/workspaceStorage/<workspace-id>/state.vscdb`

The cached ref is stored with the key: `gitbranchquickdiff.cachedRef.<repository-path>`

## Verification Points

- ✅ Workspace state is used first (if exists)
- ✅ Setting is used as fallback (if no workspace state)
- ✅ Ref persists between VS Code sessions
- ✅ Each repository has independent cached ref (multi-root support)
- ✅ Reset command clears workspace state
- ✅ Settings UI does not show workspace state values
- ✅ QuickDiffProvider is properly re-registered when ref changes
- ✅ Tree view title updates to reflect current ref
- ✅ Diff gutter updates when ref changes

## Expected Behavior Summary

| Scenario | Workspace State | Setting | Displayed Ref |
|----------|----------------|---------|---------------|
| First launch | None | `main` | `main` |
| After setting custom ref | `develop` | `main` | `develop` |
| After reset | None | `main` | `main` |
| After changing setting | `develop` | `feature` | `develop` (cached takes precedence) |
| After reset then change setting | None | `feature` | `feature` |
