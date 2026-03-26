import * as vscode from 'vscode';
import { API, Repository } from '../externals/git';
import { ChangesTreeDataProvider, MultiRepoTreeDataProvider } from '../views';
import {
    DEFAULT_ACTION_CONFIG_NAME,
    DISPLAY_MODE_CONFIG_NAME,
    EXTENTION_NAME,
    getCurrentDefaultAction,
    getCurrentDisplayMode,
    getCurrentEnabled,
    getCurrentRef,
    getCurrentSubmoduleDisplay,
    getGitAPI,
    l10n,
    migrateWorkspaceState,
    REF_CONFIG_NAME,
    SUBMODULE_DISPLAY_CONFIG_NAME,
    WORKSPACE_STATE_KEY_DEFAULT_ACTION,
    WORKSPACE_STATE_KEY_DISPLAY_MODE,
    WORKSPACE_STATE_KEY_REFS,
    WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY
} from '../utils';
import { GitBranchQuickDiffContentProvider, QUICKDIFF_SCHEME } from './contentProvider';
import { CustomQuickDiffProvider } from './quickDiffProvider';

let currentMultiRepoProvider: MultiRepoTreeDataProvider | undefined;
let currentGitApi: API | undefined;
let reregisterAllProvidersFunc: (() => Promise<void>) | undefined;

export function getCurrentMultiRepoProvider(): MultiRepoTreeDataProvider | undefined {
    return currentMultiRepoProvider;
}

export function getRegisteredGitApi(): API | undefined {
    return currentGitApi;
}

export async function reregisterAllProviders(): Promise<void> {
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }
}

export function registerProvider(context: vscode.ExtensionContext): void {
    void registerToGitExtension(context);
}

async function registerToGitExtension(context: vscode.ExtensionContext) {
    const git = await getGitAPI();
    if (!git) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    if (git.state === 'initialized') {
        await initializeProviders(context, git);
        return;
    }

    const disposable = git.onDidChangeState((state: string) => {
        if (state === 'initialized') {
            void initializeProviders(context, git);
            disposable.dispose();
        }
    });
}

async function initializeProviders(context: vscode.ExtensionContext, git: API) {
    currentGitApi = git;
    await migrateWorkspaceState(context, git.repositories);

    const contentProvider = new GitBranchQuickDiffContentProvider(context, git);
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(QUICKDIFF_SCHEME, contentProvider));

    const providers = new Map<Repository, { provider: CustomQuickDiffProvider; disposable: vscode.Disposable }>();
    const submoduleDisplay = getCurrentSubmoduleDisplay(context);
    const multiRepoProvider = new MultiRepoTreeDataProvider(submoduleDisplay as 'standalone' | 'integrated');
    currentMultiRepoProvider = multiRepoProvider;

    const treeView = vscode.window.createTreeView(`${EXTENTION_NAME}.changes`, {
        treeDataProvider: multiRepoProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    const updateTitle = async () => {
        if (!getCurrentEnabled(context)) {
            treeView.title = 'Quick Diff (deactivated)';
            return;
        }

        const singleRepo = multiRepoProvider.singleTopLevelRepo;
        treeView.title = singleRepo ? `Quick Diff (${await getCurrentRef(context, singleRepo)})` : 'Quick Diff';
    };

    const reregisterQuickDiffProvider = async (repository: Repository) => {
        const existingProvider = providers.get(repository);
        if (!existingProvider) {
            return;
        }

        existingProvider.disposable.dispose();
        const provider = new CustomQuickDiffProvider(context, git, repository);
        await provider.updateLabel();
        const disposable = vscode.window.registerQuickDiffProvider(
            { pattern: `${repository.rootUri.fsPath}/**` },
            provider,
            EXTENTION_NAME,
            provider.label,
            repository.rootUri
        );
        providers.set(repository, { provider, disposable });
    };

    reregisterAllProvidersFunc = async () => {
        for (const repository of providers.keys()) {
            await reregisterQuickDiffProvider(repository);
        }

        for (const repo of multiRepoProvider.repositories) {
            const node = multiRepoProvider.getNodeForRepo(repo);
            if (node) {
                node.updateDescription(await getCurrentRef(context, repo));
            }
        }

        await updateTitle();
        multiRepoProvider.refresh();
    };

    const setupHeadChangeListener = (repository: Repository) => {
        context.subscriptions.push(repository.state.onDidChange(async () => {
            await reregisterQuickDiffProvider(repository);

            const node = multiRepoProvider.getNodeForRepo(repository);
            if (node) {
                node.updateDescription(await getCurrentRef(context, repository));
            }

            await updateTitle();
            void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', getCurrentEnabled(context));
            multiRepoProvider.refreshRepo(repository);
        }));
    };

    const registerRepo = async (repository: Repository) => {
        const provider = new CustomQuickDiffProvider(context, git, repository);
        await provider.updateLabel();
        const disposable = vscode.window.registerQuickDiffProvider(
            { pattern: `${repository.rootUri.fsPath}/**` },
            provider,
            EXTENTION_NAME,
            provider.label,
            repository.rootUri
        );
        providers.set(repository, { provider, disposable });
        context.subscriptions.push(disposable);

        const treeDataProvider = new ChangesTreeDataProvider(
            repository,
            () => getCurrentRef(context, repository),
            () => getCurrentDefaultAction(context),
            () => getCurrentEnabled(context)
        );
        treeDataProvider.setDisplayMode(getCurrentDisplayMode(context) as 'list' | 'tree');

        const decorationDisposable = vscode.window.registerFileDecorationProvider(treeDataProvider.decorationProvider);
        context.subscriptions.push(decorationDisposable);
        multiRepoProvider.addRepository(repository, treeDataProvider, await getCurrentRef(context, repository), decorationDisposable);
    };

    for (const repository of git.repositories) {
        await registerRepo(repository);
        setupHeadChangeListener(repository);
    }

    await updateTitle();
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', getCurrentDisplayMode(context));
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', getCurrentEnabled(context));
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', getCurrentDefaultAction(context));
    void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.submoduleDisplay', getCurrentSubmoduleDisplay(context));

    context.subscriptions.push(git.onDidOpenRepository(async repository => {
        await registerRepo(repository);
        setupHeadChangeListener(repository);
        await updateTitle();
    }));

    context.subscriptions.push(git.onDidCloseRepository(async repository => {
        const existingProvider = providers.get(repository);
        if (existingProvider) {
            existingProvider.disposable.dispose();
            providers.delete(repository);
        }

        multiRepoProvider.removeRepository(repository);
        await updateTitle();
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async event => {
        if (!event.affectsConfiguration(`${EXTENTION_NAME}.${REF_CONFIG_NAME}`) &&
            !event.affectsConfiguration(`${EXTENTION_NAME}.${DISPLAY_MODE_CONFIG_NAME}`) &&
            !event.affectsConfiguration(`${EXTENTION_NAME}.${DEFAULT_ACTION_CONFIG_NAME}`) &&
            !event.affectsConfiguration(`${EXTENTION_NAME}.${SUBMODULE_DISPLAY_CONFIG_NAME}`)) {
            return;
        }

        if (event.affectsConfiguration(`${EXTENTION_NAME}.${REF_CONFIG_NAME}`)) {
            await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, undefined);
        }
        if (event.affectsConfiguration(`${EXTENTION_NAME}.${DISPLAY_MODE_CONFIG_NAME}`)) {
            await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, undefined);
        }
        if (event.affectsConfiguration(`${EXTENTION_NAME}.${DEFAULT_ACTION_CONFIG_NAME}`)) {
            await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, undefined);
        }
        if (event.affectsConfiguration(`${EXTENTION_NAME}.${SUBMODULE_DISPLAY_CONFIG_NAME}`)) {
            await context.workspaceState.update(WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY, undefined);
        }

        for (const repository of providers.keys()) {
            await reregisterQuickDiffProvider(repository);
        }

        const isEnabled = getCurrentEnabled(context);
        const displayMode = getCurrentDisplayMode(context);
        const defaultAction = getCurrentDefaultAction(context);
        const submoduleMode = getCurrentSubmoduleDisplay(context);

        void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', displayMode);
        void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', isEnabled);
        void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', defaultAction);
        void vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.submoduleDisplay', submoduleMode);

        multiRepoProvider.setSubmoduleDisplay(submoduleMode as 'standalone' | 'integrated');
        for (const repo of multiRepoProvider.repositories) {
            const node = multiRepoProvider.getNodeForRepo(repo);
            if (node) {
                node.updateDescription(await getCurrentRef(context, repo));
            }
        }

        await updateTitle();
        multiRepoProvider.setDisplayMode(displayMode as 'list' | 'tree');
        multiRepoProvider.refresh();
    }));
}
