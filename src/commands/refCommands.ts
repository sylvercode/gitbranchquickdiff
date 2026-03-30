import * as path from 'path';
import * as vscode from 'vscode';
import { Repository } from '../externals/git';
import { getCurrentMultiRepoProvider, reregisterAllProviders } from '../quickdiff';
import { DEFAULT_REF, EXTENTION_NAME, getRawRef, l10n, logger, MAX_RECENT_REFS, REF_CONFIG_NAME, WORKSPACE_STATE_KEY_RECENT_REFS, WORKSPACE_STATE_KEY_REFS } from '../utils';
import { RepositoryNode } from '../views';

async function pickRepository(context: vscode.ExtensionContext): Promise<Repository | undefined> {
    const currentMultiRepoProvider = getCurrentMultiRepoProvider();
    if (!currentMultiRepoProvider || currentMultiRepoProvider.size === 0) {
        return undefined;
    }

    const repos = currentMultiRepoProvider.repositories;
    if (repos.length === 1) {
        return repos[0];
    }

    const items = repos.map(repo => ({
        label: path.basename(repo.rootUri.fsPath),
        description: getRawRef(context, repo),
        repository: repo
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: l10n('prompt.pickRepository')
    });

    return selected?.repository;
}

export async function changeRef(context: vscode.ExtensionContext, repoNode?: RepositoryNode) {
    const repository = repoNode instanceof RepositoryNode ? repoNode.repository : await pickRepository(context);
    if (!repository) {
        return;
    }

    const currentValue = getRawRef(context, repository);
    const configDefault = vscode.workspace.getConfiguration(EXTENTION_NAME).get<string>(REF_CONFIG_NAME) ?? DEFAULT_REF;
    const allRecentRefs = context.workspaceState.get<Record<string, string[]>>(WORKSPACE_STATE_KEY_RECENT_REFS) ?? {};
    const recentRefs = allRecentRefs[repository.rootUri.fsPath] ?? [];

    const settingDefaultDescription = l10n('label.settingDefault');
    const settingDefaultItem: vscode.QuickPickItem = {
        label: configDefault,
        description: configDefault === currentValue
            ? `${settingDefaultDescription} (current)`
            : settingDefaultDescription
    };

    const recentItems: vscode.QuickPickItem[] = recentRefs
        .filter(ref => ref !== configDefault)
        .map(ref => ({
            label: ref,
            description: ref === currentValue ? '(current)' : undefined
        }));

    const quickPick = vscode.window.createQuickPick();
    quickPick.title = l10n('prompt.setRefTitle');
    quickPick.placeholder = l10n('prompt.setRefPlaceholder');
    quickPick.items = [settingDefaultItem, ...recentItems];

    let selectedSettingDefault = false;

    const input = await new Promise<string | undefined>(resolve => {
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (selected === settingDefaultItem) {
                selectedSettingDefault = true;
            }
            resolve(selected ? selected.label : quickPick.value);
            quickPick.hide();
        });

        quickPick.onDidHide(() => {
            resolve(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });

    if (input !== undefined && input.trim() !== '') {
        if (selectedSettingDefault) {
            logger.info('Resetting ref for repository:', path.basename(repository.rootUri.fsPath));
            const refsMap = context.workspaceState.get<Record<string, string>>(WORKSPACE_STATE_KEY_REFS);
            if (refsMap !== undefined) {
                delete refsMap[repository.rootUri.fsPath];
                await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, Object.keys(refsMap).length > 0 ? refsMap : undefined);
            }
        } else {
            logger.info('Changing ref for repository', path.basename(repository.rootUri.fsPath), 'to:', input);
            const refsMap = context.workspaceState.get<Record<string, string>>(WORKSPACE_STATE_KEY_REFS) ?? {};
            refsMap[repository.rootUri.fsPath] = input;
            await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, refsMap);
            await updateRecentRefs(context, repository, input);
        }
        await reregisterAllProviders();
    }
}

export async function updateRecentRefs(context: vscode.ExtensionContext, repository: Repository, ref: string) {
    const allRecentRefs = context.workspaceState.get<Record<string, string[]>>(WORKSPACE_STATE_KEY_RECENT_REFS) ?? {};
    const repoKey = repository.rootUri.fsPath;
    const recentRefs = allRecentRefs[repoKey] ?? [];

    const filtered = recentRefs.filter(existingRef => existingRef !== ref);
    filtered.unshift(ref);
    allRecentRefs[repoKey] = filtered.slice(0, MAX_RECENT_REFS);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_RECENT_REFS, allRecentRefs);
}

export async function resetRef(context: vscode.ExtensionContext, repoNode?: RepositoryNode) {
    const repository = repoNode instanceof RepositoryNode ? repoNode.repository : await pickRepository(context);
    if (!repository) {
        return;
    }

    logger.info('Resetting ref for repository:', path.basename(repository.rootUri.fsPath));
    const refsMap = context.workspaceState.get<Record<string, string>>(WORKSPACE_STATE_KEY_REFS);
    if (refsMap !== undefined) {
        delete refsMap[repository.rootUri.fsPath];
        await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, Object.keys(refsMap).length > 0 ? refsMap : undefined);
    }

    await reregisterAllProviders();
    vscode.window.showInformationMessage(l10n('info.refResetToDefault'));
}
