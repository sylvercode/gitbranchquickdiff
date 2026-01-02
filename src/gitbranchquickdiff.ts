import * as vscode from 'vscode';
import * as vscodeVariables from './vscode-variables';
import { getGitAPI } from './gitApi';
import * as git from './git';
import { ChangedFile, ChangesTreeDataProvider, openChange } from './changesTreeView';

export const EXTENTION_NAME = 'gitbranchquickdiff';

const ENABLED_CONFIG_NAME = 'enabled';
const REF_CONFIG_NAME = 'ref';

export function activate(context: vscode.ExtensionContext) {
    registerCommands(context);

    registerToGitExtention(context);
}

function registerCommands(context: vscode.ExtensionContext) {
    registerCommand(context, `${EXTENTION_NAME}.activate`, enableExtention);
    registerCommand(context, `${EXTENTION_NAME}.deactivate`, disableExtention);
    registerCommand(context, `${EXTENTION_NAME}.changeref`, changeRef);
    registerCommand(context, `${EXTENTION_NAME}.defaultref`, resetRefToDefault);
    registerCommand(context, `${EXTENTION_NAME}.refreshChanges`, refreshChanges);
    registerCommand(context, `${EXTENTION_NAME}.openChange`, openChangeCommand);
    registerCommand(context, `${EXTENTION_NAME}.openFile`, openFileCommand);
    registerCommand(context, `${EXTENTION_NAME}.viewAsList`, setListMode);
    registerCommand(context, `${EXTENTION_NAME}.viewAsTree`, setTreeMode);
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenFile`, setDefaultActionOpenFile);
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenChanges`, setDefaultActionOpenChanges);
}

async function registerToGitExtention(context: vscode.ExtensionContext) {
    // Get the Git extension API
    const git = await getGitAPI();
    if (!git) {
        vscode.window.showErrorMessage('Git extension not found');
        return;
    }


    // Wait for git to be initialized
    if (git.state === 'initialized') {
        registerProvider(context, git);
    } else {
        const disposable = git.onDidChangeState((state: string) => {
            if (state === 'initialized') {
                registerProvider(context, git);
                disposable.dispose();
            }
        });
    }
}

async function registerProvider(context: vscode.ExtensionContext, git: git.API) {
    const providers = new Map<git.Repository, { provider: CustomQuickDiffProvider; disposable: vscode.Disposable }>();
    const treeViews = new Map<git.Repository, { treeDataProvider: ChangesTreeDataProvider; treeView: vscode.TreeView<any> }>();

    // Helper function to re-register QuickDiffProvider
    const reregisterQuickDiffProvider = async (repository: git.Repository) => {
        console.log(`[GitBranchQuickDiff] Re-registering QuickDiffProvider for repository: ${repository.rootUri.fsPath}`);

        const existingProvider = providers.get(repository);
        if (existingProvider) {
            existingProvider.disposable.dispose();

            const provider = new CustomQuickDiffProvider(git, repository);
            await provider.updateLabel();
            const disposable = vscode.window.registerQuickDiffProvider(
                { pattern: `${repository.rootUri.fsPath}/**` },
                provider,
                EXTENTION_NAME,
                provider.label,
                repository.rootUri
            );
            providers.set(repository, { provider, disposable });
            currentProviders.set(repository, provider);
            console.log(`[GitBranchQuickDiff] QuickDiffProvider re-registered`);
        }
    };

    // Helper function to setup HEAD change listener
    const setupHeadChangeListener = (repository: git.Repository) => {
        context.subscriptions.push(repository.state.onDidChange(async () => {
            console.log(`[GitBranchQuickDiff] HEAD changed for repository: ${repository.rootUri.fsPath}`);
            await reregisterQuickDiffProvider(repository);

            // Refresh tree view (which will update decorations)
            const treeView = treeViews.get(repository);
            if (treeView) {
                const provider = providers.get(repository)?.provider;
                if (provider) {
                    const isEnabled = vscode.workspace.getConfiguration(EXTENTION_NAME).get<boolean>('enabled', true);
                    const ref = await provider.getCurrentRef();
                    treeView.treeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;
                }
                treeView.treeDataProvider.refresh();
            }
        }));
    };

    const registerRepo = async (repository: git.Repository) => {
        console.log(`[GitBranchQuickDiff] Registering provider for repository: ${repository.rootUri.fsPath}`);

        const provider = new CustomQuickDiffProvider(git, repository);
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
        console.log(`[GitBranchQuickDiff] QuickDiffProvider registered`);

        // Register tree view for this repository
        const treeDataProvider = new ChangesTreeDataProvider(
            repository,
            () => provider.getCurrentRef()
        );
        // Set display mode from configuration
        const savedDisplayMode = vscode.workspace.getConfiguration(EXTENTION_NAME).get<string>('displayMode', 'list');
        treeDataProvider.setDisplayMode(savedDisplayMode as 'list' | 'tree');

        const treeView = vscode.window.createTreeView(`${EXTENTION_NAME}.changes`, {
            treeDataProvider,
            showCollapseAll: true
        });
        // Set initial title with ref
        const isEnabled = vscode.workspace.getConfiguration(EXTENTION_NAME).get<boolean>('enabled', true);
        const ref = await provider.getCurrentRef();
        treeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;
        treeViews.set(repository, { treeDataProvider, treeView });
        context.subscriptions.push(treeView);
        console.log(`[GitBranchQuickDiff] Tree view registered`);

        // Register file decoration provider for explorer and tab headers
        console.log(`[GitBranchQuickDiff] Registering file decoration provider`);
        const decorationDisposable = vscode.window.registerFileDecorationProvider(treeDataProvider.decorationProvider);
        context.subscriptions.push(decorationDisposable);
        console.log(`[GitBranchQuickDiff] File decoration provider registered`);

        // Store references for command access
        currentTreeDataProviders.set(repository, treeDataProvider);
        currentTreeViews.set(repository, treeView);
        currentRepositories.set(repository, repository);
        currentProviders.set(repository, provider);
    };

    // Register existing repositories
    for (const repository of git.repositories) {
        registerRepo(repository);
        setupHeadChangeListener(repository);
    }

    // Initialize display mode context
    const savedDisplayMode = vscode.workspace.getConfiguration(EXTENTION_NAME).get<string>('displayMode', 'list');
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', savedDisplayMode);
    // Apply saved mode to all tree data providers
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.setDisplayMode(savedDisplayMode as 'list' | 'tree');
    }

    // Listen for new repositories
    context.subscriptions.push(git.onDidOpenRepository((repository) => {
        registerRepo(repository);
        setupHeadChangeListener(repository);
    }));

    // Listen for config changes and re-register providers
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration(`${EXTENTION_NAME}.${REF_CONFIG_NAME}`) ||
            e.affectsConfiguration(`${EXTENTION_NAME}.${ENABLED_CONFIG_NAME}`)) {
            console.log(`[GitBranchQuickDiff] Configuration changed`);

            // Re-register all QuickDiffProviders
            for (const repository of providers.keys()) {
                await reregisterQuickDiffProvider(repository);
            }

            // Refresh all tree views (which will update decorations)
            for (const [repository, { treeDataProvider, treeView }] of treeViews) {
                const provider = providers.get(repository)?.provider;
                if (provider) {
                    const isEnabled = vscode.workspace.getConfiguration(EXTENTION_NAME).get<boolean>('enabled', true);
                    const ref = await provider.getCurrentRef();
                    treeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;
                }
                treeDataProvider.refresh();
            }
        }
    }));
}

class CustomQuickDiffProvider implements vscode.QuickDiffProvider {
    readonly id = EXTENTION_NAME;
    private _label: string = 'HEAD';

    get label(): string {
        return this._label;
    }

    constructor(
        private git: git.API,
        private repository: git.Repository) {
    }

    public async updateLabel() {
        this._label = await this.getCurrentRef();
    }

    async getCurrentRef(): Promise<string> {
        return await vscodeVariables.variables(
            this.repository,
            vscode.workspace.getConfiguration(EXTENTION_NAME).get<string>(REF_CONFIG_NAME) ?? "HEAD");
    }

    async provideOriginalResource(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        if (uri.scheme !== 'file') {
            return undefined;
        }

        const isEnabled = vscode.workspace.getConfiguration(EXTENTION_NAME).get<boolean>(ENABLED_CONFIG_NAME);
        if (!isEnabled) {
            return undefined;
        }

        // Check if file is in this repository
        const repoPath = this.repository.rootUri.fsPath;
        if (!uri.fsPath.startsWith(repoPath)) {
            return undefined;
        }

        // Get the custom reference from settings
        const ref = await this.getCurrentRef();
        return this.git.toGitUri(uri, ref);
    }
}

function registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) {
    context.subscriptions.push(
        vscode.commands.registerCommand(command, callback, thisArg));
}

function enableExtention() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update(ENABLED_CONFIG_NAME, true, false);
}

function disableExtention() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update(ENABLED_CONFIG_NAME, false, false);
}

function resetRefToDefault() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update(REF_CONFIG_NAME, undefined, false);
}

async function changeRef() {
    const input = await vscode.window.showInputBox({
        title: 'ref',
        prompt: 'Enter the git reference to use for quick diff (branch, tag, commit hash, etc.)',
        value: vscode.workspace.getConfiguration(EXTENTION_NAME).get<string>(REF_CONFIG_NAME),
    });

    if (input) {
        vscode.workspace.getConfiguration(EXTENTION_NAME).update(REF_CONFIG_NAME, input, false);
    }
}

// Global maps to store current tree providers and repositories for command access
const currentTreeDataProviders = new Map<git.Repository, ChangesTreeDataProvider>();
const currentTreeViews = new Map<git.Repository, vscode.TreeView<any>>();
const currentRepositories = new Map<git.Repository, git.Repository>();
const currentProviders = new Map<git.Repository, CustomQuickDiffProvider>();

function refreshChanges() {
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.refresh();
    }
}

async function openChangeCommand(fileItem: ChangedFile) {
    // Get the Git API
    const gitApi = await getGitAPI();
    if (!gitApi) {
        vscode.window.showErrorMessage('Git extension not found');
        return;
    }

    // Find the repository for this URI
    for (const [repository, provider] of currentProviders.entries()) {
        if (fileItem.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
            await openChange(gitApi, repository, () => provider.getCurrentRef(), fileItem.resourceUri, fileItem.status);
            return;
        }
    }
}

async function openFileCommand(fileItem: ChangedFile) {
    await vscode.commands.executeCommand('vscode.open', fileItem.resourceUri);
}

function setListMode() {
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.setDisplayMode('list');
    }
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'list');
    vscode.workspace.getConfiguration(EXTENTION_NAME).update('displayMode', 'list', false);
}

function setTreeMode() {
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.setDisplayMode('tree');
    }
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'tree');
    vscode.workspace.getConfiguration(EXTENTION_NAME).update('displayMode', 'tree', false);
}

function setDefaultActionOpenFile() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update('defaultAction', 'openFile', false);
}

function setDefaultActionOpenChanges() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update('defaultAction', 'openChanges', false);
}
