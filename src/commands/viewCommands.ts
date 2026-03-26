import * as vscode from 'vscode';
import { getCurrentMultiRepoProvider, reregisterAllProviders } from '../quickdiff';
import {
    WORKSPACE_STATE_KEY_DEFAULT_ACTION,
    WORKSPACE_STATE_KEY_DISPLAY_MODE,
    WORKSPACE_STATE_KEY_ENABLED,
    WORKSPACE_STATE_KEY_RECENT_REFS,
    WORKSPACE_STATE_KEY_REF,
    WORKSPACE_STATE_KEY_REFS,
    WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY,
    getCurrentSubmoduleDisplay
} from '../utils';

export async function enableExtension(context: vscode.ExtensionContext) {
    await context.workspaceState.update(WORKSPACE_STATE_KEY_ENABLED, true);
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', true);
    await reregisterAllProviders();
}

export async function disableExtension(context: vscode.ExtensionContext) {
    await context.workspaceState.update(WORKSPACE_STATE_KEY_ENABLED, false);
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', false);
    await reregisterAllProviders();
    getCurrentMultiRepoProvider()?.refresh();
}

export async function clearWorkspaceCache(context: vscode.ExtensionContext) {
    const answer = await vscode.window.showWarningMessage(
        'Clear all GitBranchQuickDiff workspace cache? This will reset all settings (ref, enabled state, display mode, default action).',
        { modal: true },
        'Clear Cache'
    );

    if (answer !== 'Clear Cache') {
        return;
    }

    await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_REF, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_ENABLED, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_RECENT_REFS, undefined);

    await reregisterAllProviders();
    vscode.window.showInformationMessage('GitBranchQuickDiff workspace cache cleared. All settings reset to defaults.');
}

export async function toggleSubmoduleDisplay(context: vscode.ExtensionContext) {
    const current = getCurrentSubmoduleDisplay(context);
    const newMode = current === 'standalone' ? 'integrated' : 'standalone';

    await context.workspaceState.update(WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY, newMode);
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.submoduleDisplay', newMode);

    getCurrentMultiRepoProvider()?.setSubmoduleDisplay(newMode);
    await reregisterAllProviders();
}

export async function setListMode(context: vscode.ExtensionContext) {
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, 'list');
    getCurrentMultiRepoProvider()?.setDisplayMode('list');
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'list');
}

export async function setTreeMode(context: vscode.ExtensionContext) {
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, 'tree');
    getCurrentMultiRepoProvider()?.setDisplayMode('tree');
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'tree');
}

export async function setDefaultActionOpenFile(context: vscode.ExtensionContext) {
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, 'openFile');
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', 'openFile');
    getCurrentMultiRepoProvider()?.refresh();
}

export async function setDefaultActionOpenChanges(context: vscode.ExtensionContext) {
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, 'openChanges');
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', 'openChanges');
    getCurrentMultiRepoProvider()?.refresh();
}
