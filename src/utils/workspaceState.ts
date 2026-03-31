import * as vscode from 'vscode';
import { Repository } from '../externals/git';
import { variables as vscodeVariables } from './vscodeVariables';

export const EXTENSION_NAME = 'gitbranchquickdiff';

export const REF_CONFIG_NAME = 'ref';
export const DISPLAY_MODE_CONFIG_NAME = 'displayMode';
export const DEFAULT_ACTION_CONFIG_NAME = 'defaultAction';
export const SUBMODULE_DISPLAY_CONFIG_NAME = 'submoduleDisplay';

export const WORKSPACE_STATE_KEY_REF = 'gitbranchquickdiff.ref';
export const WORKSPACE_STATE_KEY_REFS = 'gitbranchquickdiff.refs';
export const WORKSPACE_STATE_KEY_ENABLED = 'gitbranchquickdiff.enabled';
export const WORKSPACE_STATE_KEY_DISPLAY_MODE = 'gitbranchquickdiff.displayMode';
export const WORKSPACE_STATE_KEY_DEFAULT_ACTION = 'gitbranchquickdiff.defaultAction';
export const WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY = 'gitbranchquickdiff.submoduleDisplay';
export const WORKSPACE_STATE_KEY_RECENT_REFS = 'gitbranchquickdiff.recentRefs';

export const DEFAULT_REF = 'main';
export const MAX_RECENT_REFS = 10;
export const DEFAULT_ENABLED = true;
export const DEFAULT_DISPLAY_MODE = 'list';
export const DEFAULT_DEFAULT_ACTION = 'openChanges';
export const DEFAULT_SUBMODULE_DISPLAY = 'standalone';

export function getConfigDefaultRef(): string {
    return vscode.workspace.getConfiguration(EXTENSION_NAME)
        .get<string>(REF_CONFIG_NAME) ?? DEFAULT_REF;
}

export function getRawRef(context: vscode.ExtensionContext, repository: Repository): string {
    const refsMap = context.workspaceState.get<Record<string, string>>(WORKSPACE_STATE_KEY_REFS);
    const repoKey = repository.rootUri.fsPath;

    if (refsMap !== undefined && refsMap[repoKey] !== undefined) {
        return refsMap[repoKey];
    }

    return getConfigDefaultRef();
}

export async function clearRepoRef(context: vscode.ExtensionContext, repository: Repository): Promise<void> {
    const refsMap = context.workspaceState.get<Record<string, string>>(WORKSPACE_STATE_KEY_REFS);
    if (refsMap !== undefined) {
        delete refsMap[repository.rootUri.fsPath];
        await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, Object.keys(refsMap).length > 0 ? refsMap : undefined);
    }
}

export async function getCurrentRef(context: vscode.ExtensionContext, repository: Repository): Promise<string> {
    return vscodeVariables(repository, getRawRef(context, repository));
}

export function getCurrentEnabled(context: vscode.ExtensionContext): boolean {
    const cachedEnabled = context.workspaceState.get<boolean>(WORKSPACE_STATE_KEY_ENABLED);
    return cachedEnabled ?? DEFAULT_ENABLED;
}

export function getCurrentDisplayMode(context: vscode.ExtensionContext): string {
    const cachedDisplayMode = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_DISPLAY_MODE);
    if (cachedDisplayMode !== undefined) {
        return cachedDisplayMode;
    }

    return vscode.workspace.getConfiguration(EXTENSION_NAME)
        .get<string>(DISPLAY_MODE_CONFIG_NAME) ?? DEFAULT_DISPLAY_MODE;
}

export function getCurrentDefaultAction(context: vscode.ExtensionContext): string {
    const cachedDefaultAction = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_DEFAULT_ACTION);
    if (cachedDefaultAction !== undefined) {
        return cachedDefaultAction;
    }

    return vscode.workspace.getConfiguration(EXTENSION_NAME)
        .get<string>(DEFAULT_ACTION_CONFIG_NAME) ?? DEFAULT_DEFAULT_ACTION;
}

export function getCurrentSubmoduleDisplay(context: vscode.ExtensionContext): string {
    const cached = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY);
    if (cached !== undefined) {
        return cached;
    }

    return vscode.workspace.getConfiguration(EXTENSION_NAME)
        .get<string>(SUBMODULE_DISPLAY_CONFIG_NAME) ?? DEFAULT_SUBMODULE_DISPLAY;
}

export async function migrateWorkspaceState(context: vscode.ExtensionContext, repositories: Repository[]) {
    const oldRef = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_REF);
    if (oldRef !== undefined) {
        const refsMap: Record<string, string> = {};
        for (const repo of repositories) {
            refsMap[repo.rootUri.fsPath] = oldRef;
        }
        await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, refsMap);
        await context.workspaceState.update(WORKSPACE_STATE_KEY_REF, undefined);
    }

    const oldRecentRefs = context.workspaceState.get<unknown>(WORKSPACE_STATE_KEY_RECENT_REFS);
    if (Array.isArray(oldRecentRefs)) {
        const recentRefsMap: Record<string, string[]> = {};
        for (const repo of repositories) {
            recentRefsMap[repo.rootUri.fsPath] = [...oldRecentRefs];
        }
        await context.workspaceState.update(WORKSPACE_STATE_KEY_RECENT_REFS, recentRefsMap);
    }
}
