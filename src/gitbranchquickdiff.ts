import * as vscode from 'vscode';
import * as path from 'path';
import * as vscodeVariables from './vscode-variables';
import { getGitAPI } from './gitApi';
import * as git from './git';
import { Status } from './git';
import { ChangedFile, ChangesTreeDataProvider, DirectoryNode, openChange, ExtendedStatus } from './changesTreeView';
import { l10n } from './l10n';

export const EXTENTION_NAME = 'gitbranchquickdiff';

const REF_CONFIG_NAME = 'ref';
const DISPLAY_MODE_CONFIG_NAME = 'displayMode';
const DEFAULT_ACTION_CONFIG_NAME = 'defaultAction';
const WORKSPACE_STATE_KEY_PREFIX = 'gitbranchquickdiff.cachedRef';
const WORKSPACE_STATE_KEY_PREFIX_ENABLED = 'gitbranchquickdiff.enabled';
const WORKSPACE_STATE_KEY_PREFIX_DISPLAY_MODE = 'gitbranchquickdiff.displayMode';
const WORKSPACE_STATE_KEY_PREFIX_DEFAULT_ACTION = 'gitbranchquickdiff.defaultAction';
const DEFAULT_REF = 'main';
const DEFAULT_ENABLED = true;
const DEFAULT_DISPLAY_MODE = 'list';
const DEFAULT_DEFAULT_ACTION = 'openChanges';

// Store the extension context globally for command access
let extensionContext: vscode.ExtensionContext | undefined;

// Helper functions to generate workspace state keys for a repository
function getWorkspaceStateKey(repository: git.Repository): string {
    return `${WORKSPACE_STATE_KEY_PREFIX}.${repository.rootUri.fsPath}`;
}

function getWorkspaceStateKeyEnabled(repository: git.Repository): string {
    return `${WORKSPACE_STATE_KEY_PREFIX_ENABLED}.${repository.rootUri.fsPath}`;
}

function getWorkspaceStateKeyDisplayMode(repository: git.Repository): string {
    return `${WORKSPACE_STATE_KEY_PREFIX_DISPLAY_MODE}.${repository.rootUri.fsPath}`;
}

function getWorkspaceStateKeyDefaultAction(repository: git.Repository): string {
    return `${WORKSPACE_STATE_KEY_PREFIX_DEFAULT_ACTION}.${repository.rootUri.fsPath}`;
}

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    registerCommands(context);

    registerToGitExtention(context);
}

function registerCommands(context: vscode.ExtensionContext) {
    registerCommand(context, `${EXTENTION_NAME}.activate`, enableExtention);
    registerCommand(context, `${EXTENTION_NAME}.deactivate`, disableExtention);
    registerCommand(context, `${EXTENTION_NAME}.changeref`, changeRef);
    registerCommand(context, `${EXTENTION_NAME}.resetRef`, resetRef);
    registerCommand(context, `${EXTENTION_NAME}.refreshChanges`, refreshChanges);
    registerCommand(context, `${EXTENTION_NAME}.openChange`, openChangeCommand);
    registerCommand(context, `${EXTENTION_NAME}.openFile`, openFileCommand);
    registerCommand(context, `${EXTENTION_NAME}.openDirectoryChanges`, openDirectoryChangesCommand);
    registerCommand(context, `${EXTENTION_NAME}.openAllChanges`, openAllChangesCommand);
    registerCommand(context, `${EXTENTION_NAME}.viewAsList`, setListMode);
    registerCommand(context, `${EXTENTION_NAME}.viewAsTree`, setTreeMode);
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenFile`, setDefaultActionOpenFile);
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenChanges`, setDefaultActionOpenChanges);
    registerCommand(context, `${EXTENTION_NAME}.restoreFile`, restoreFileCommand);
    registerCommand(context, `${EXTENTION_NAME}.restoreDirectory`, restoreDirectoryCommand);
    registerCommand(context, `${EXTENTION_NAME}.clearWorkspaceCache`, clearWorkspaceCache);
}

async function registerToGitExtention(context: vscode.ExtensionContext) {
    // Get the Git extension API
    const git = await getGitAPI();
    if (!git) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
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

            const provider = new CustomQuickDiffProvider(git, repository, context);
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

    // Store a function to re-register all providers (for use by commands)
    reregisterAllProvidersFunc = async () => {
        for (const repository of providers.keys()) {
            await reregisterQuickDiffProvider(repository);
        }

        // Refresh all tree views (which will update decorations)
        for (const [repository, { treeDataProvider, treeView }] of treeViews) {
            const provider = providers.get(repository)?.provider;
            if (provider) {
                const isEnabled = provider.getCurrentEnabled();
                const ref = await provider.getCurrentRef();
                treeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;
            }
            treeDataProvider.refresh();
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
                    const isEnabled = provider.getCurrentEnabled();
                    const ref = await provider.getCurrentRef();
                    treeView.treeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;
                    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', isEnabled);
                }
                treeView.treeDataProvider.refresh();
            }
        }));
    };

    const registerRepo = async (repository: git.Repository) => {
        console.log(`[GitBranchQuickDiff] Registering provider for repository: ${repository.rootUri.fsPath}`);

        const provider = new CustomQuickDiffProvider(git, repository, context);
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
            () => provider.getCurrentRef(),
            () => provider.getCurrentDefaultAction(),
            () => provider.getCurrentEnabled()
        );
        // Set display mode from workspace state/configuration
        const savedDisplayMode = provider.getCurrentDisplayMode();
        treeDataProvider.setDisplayMode(savedDisplayMode as 'list' | 'tree');

        const treeView = vscode.window.createTreeView(`${EXTENTION_NAME}.changes`, {
            treeDataProvider,
            showCollapseAll: true
        });
        // Set initial title with ref
        const isEnabled = provider.getCurrentEnabled();
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

        // Set contexts immediately if this is the first repository
        if (currentProviders.size === 1) {
            const displayMode = provider.getCurrentDisplayMode();
            const enabled = provider.getCurrentEnabled();
            const defaultAction = provider.getCurrentDefaultAction();
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', displayMode);
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', enabled);
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', defaultAction);
        }
    };

    // Register existing repositories
    for (const repository of git.repositories) {
        await registerRepo(repository);
        setupHeadChangeListener(repository);
    }

    // Listen for new repositories
    context.subscriptions.push(git.onDidOpenRepository(async (repository) => {
        await registerRepo(repository);
        setupHeadChangeListener(repository);
    }));

    // Listen for config changes and re-register providers
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration(`${EXTENTION_NAME}.${REF_CONFIG_NAME}`) ||
            e.affectsConfiguration(`${EXTENTION_NAME}.${DISPLAY_MODE_CONFIG_NAME}`) ||
            e.affectsConfiguration(`${EXTENTION_NAME}.${DEFAULT_ACTION_CONFIG_NAME}`)) {
            console.log(`[GitBranchQuickDiff] Configuration changed`);

            // Re-register all QuickDiffProviders
            for (const repository of providers.keys()) {
                await reregisterQuickDiffProvider(repository);
            }

            // Refresh all tree views (which will update decorations)
            for (const [repository, { treeDataProvider, treeView }] of treeViews) {
                const provider = providers.get(repository)?.provider;
                if (provider) {
                    const isEnabled = provider.getCurrentEnabled();
                    const ref = await provider.getCurrentRef();
                    treeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;

                    // Update all contexts
                    const displayMode = provider.getCurrentDisplayMode();
                    const defaultAction = provider.getCurrentDefaultAction();
                    treeDataProvider.setDisplayMode(displayMode as 'list' | 'tree');
                    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', displayMode);
                    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', isEnabled);
                    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', defaultAction);
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
        private repository: git.Repository,
        private context: vscode.ExtensionContext) {
    }

    public async updateLabel() {
        this._label = await this.getCurrentRef();
    }

    async getCurrentRef(): Promise<string> {
        // Try workspace state first (cached ref)
        const cachedRef = this.context.workspaceState.get<string>(
            getWorkspaceStateKey(this.repository)
        );

        if (cachedRef !== undefined) {
            return await vscodeVariables.variables(this.repository, cachedRef);
        }

        // Fall back to setting (default ref)
        const configRef = vscode.workspace.getConfiguration(EXTENTION_NAME)
            .get<string>(REF_CONFIG_NAME) ?? DEFAULT_REF;

        return await vscodeVariables.variables(this.repository, configRef);
    }

    getCurrentEnabled(): boolean {
        // Get from workspace state, default to DEFAULT_ENABLED if not set
        const cachedEnabled = this.context.workspaceState.get<boolean>(
            getWorkspaceStateKeyEnabled(this.repository)
        );

        return cachedEnabled ?? DEFAULT_ENABLED;
    }

    getCurrentDisplayMode(): string {
        // Try workspace state first
        const cachedDisplayMode = this.context.workspaceState.get<string>(
            getWorkspaceStateKeyDisplayMode(this.repository)
        );

        if (cachedDisplayMode !== undefined) {
            return cachedDisplayMode;
        }

        // Fall back to setting (default display mode)
        return vscode.workspace.getConfiguration(EXTENTION_NAME)
            .get<string>(DISPLAY_MODE_CONFIG_NAME) ?? DEFAULT_DISPLAY_MODE;
    }

    getCurrentDefaultAction(): string {
        // Try workspace state first
        const cachedDefaultAction = this.context.workspaceState.get<string>(
            getWorkspaceStateKeyDefaultAction(this.repository)
        );

        if (cachedDefaultAction !== undefined) {
            return cachedDefaultAction;
        }

        // Fall back to setting (default action)
        return vscode.workspace.getConfiguration(EXTENTION_NAME)
            .get<string>(DEFAULT_ACTION_CONFIG_NAME) ?? DEFAULT_DEFAULT_ACTION;
    }

    async provideOriginalResource(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        if (uri.scheme !== 'file') {
            return undefined;
        }

        const isEnabled = this.getCurrentEnabled();
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

async function enableExtention() {
    if (!extensionContext) {
        return;
    }

    // Set context immediately for UI responsiveness
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', true);

    // Save to workspace state for all repositories
    for (const repository of currentRepositories.values()) {
        await extensionContext.workspaceState.update(
            getWorkspaceStateKeyEnabled(repository),
            true
        );
    }

    // Re-register all providers
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }
}

async function disableExtention() {
    if (!extensionContext) {
        return;
    }

    // Set context immediately for UI responsiveness
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', false);

    // Save to workspace state for all repositories
    for (const repository of currentRepositories.values()) {
        await extensionContext.workspaceState.update(
            getWorkspaceStateKeyEnabled(repository),
            false
        );
    }

    // Re-register all providers and refresh tree views
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }

    // Force refresh tree views to show deactivation message
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.refresh();
    }
}

async function changeRef() {
    if (!extensionContext) {
        vscode.window.showErrorMessage(l10n('error.extensionNotInitialized'));
        console.error('[GitBranchQuickDiff] Extension context not available in changeRef command');
        return;
    }

    // Get current ref from active repository's workspace state or setting
    let currentValue = '';
    if (currentProviders.size > 0) {
        const firstProvider = currentProviders.values().next().value as CustomQuickDiffProvider;
        currentValue = await firstProvider.getCurrentRef();
    } else {
        // Fall back to setting default
        currentValue = vscode.workspace.getConfiguration(EXTENTION_NAME).get<string>(REF_CONFIG_NAME) ?? DEFAULT_REF;
    }

    const input = await vscode.window.showInputBox({
        title: l10n('prompt.setRefTitle'),
        prompt: l10n('prompt.setRefPlaceholder'),
        value: currentValue,
    });

    if (input !== undefined) {
        // Save to workspace state instead of settings
        for (const repository of currentRepositories.values()) {
            await extensionContext.workspaceState.update(
                getWorkspaceStateKey(repository),
                input
            );
        }

        // Re-register all providers with the new ref
        if (reregisterAllProvidersFunc) {
            await reregisterAllProvidersFunc();
        }
    }
}

async function resetRef() {
    if (!extensionContext) {
        vscode.window.showErrorMessage(l10n('error.extensionNotInitialized'));
        console.error('[GitBranchQuickDiff] Extension context not available in resetRef command');
        return;
    }

    // Clear workspace state for all repositories
    for (const repository of currentRepositories.values()) {
        await extensionContext.workspaceState.update(
            getWorkspaceStateKey(repository),
            undefined
        );
    }

    // Re-register all providers to use the default setting
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }

    vscode.window.showInformationMessage(l10n('info.refResetToDefault'));
}

async function clearWorkspaceCache() {
    if (!extensionContext) {
        vscode.window.showErrorMessage(l10n('error.extensionNotInitialized'));
        console.error('[GitBranchQuickDiff] Extension context not available in clearWorkspaceCache command');
        return;
    }

    // Confirm action
    const answer = await vscode.window.showWarningMessage(
        'Clear all GitBranchQuickDiff workspace cache? This will reset all per-repository settings (ref, enabled state, display mode, default action).',
        { modal: true },
        'Clear Cache'
    );

    if (answer !== 'Clear Cache') {
        return;
    }

    // Clear workspace state for all repositories
    for (const repository of currentRepositories.values()) {
        await extensionContext.workspaceState.update(
            getWorkspaceStateKey(repository),
            undefined
        );
        await extensionContext.workspaceState.update(
            getWorkspaceStateKeyEnabled(repository),
            undefined
        );
        await extensionContext.workspaceState.update(
            getWorkspaceStateKeyDisplayMode(repository),
            undefined
        );
        await extensionContext.workspaceState.update(
            getWorkspaceStateKeyDefaultAction(repository),
            undefined
        );
    }

    // Re-register all providers to use the default settings
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }

    vscode.window.showInformationMessage('GitBranchQuickDiff workspace cache cleared. All settings reset to defaults.');
}

// Global maps to store current tree providers and repositories for command access
const currentTreeDataProviders = new Map<git.Repository, ChangesTreeDataProvider>();
const currentTreeViews = new Map<git.Repository, vscode.TreeView<any>>();
const currentRepositories = new Map<git.Repository, git.Repository>();
const currentProviders = new Map<git.Repository, CustomQuickDiffProvider>();

// Store the reregistration function for access from commands
let reregisterAllProvidersFunc: (() => Promise<void>) | undefined;

function refreshChanges() {
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.refresh();
    }
}

async function openChangeCommand(fileItem: ChangedFile) {
    // Get the Git API
    const gitApi = await getGitAPI();
    if (!gitApi) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // Find the repository for this URI
    for (const [repository, provider] of currentProviders.entries()) {
        if (fileItem.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
            await openChange(gitApi, repository, () => provider.getCurrentRef(), fileItem.resourceUri, fileItem.originalUri, fileItem.status);
            return;
        }
    }
}

async function openFileCommand(fileItem: ChangedFile) {
    // For deleted files, use openChange to show the file from the ref
    if (fileItem.status === ExtendedStatus.INDEX_DELETED ||
        fileItem.status === ExtendedStatus.DELETED ||
        fileItem.status === ExtendedStatus.DELETED_BY_THEM ||
        fileItem.status === ExtendedStatus.DELETED_BY_US) {
        // Get the Git API
        const gitApi = await getGitAPI();
        if (!gitApi) {
            vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
            return;
        }

        // Find the repository for this URI
        for (const [repository, provider] of currentProviders.entries()) {
            if (fileItem.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
                await openChange(gitApi, repository, () => provider.getCurrentRef(), fileItem.resourceUri, fileItem.originalUri, fileItem.status);
                return;
            }
        }
    } else {
        await vscode.commands.executeCommand('vscode.open', fileItem.resourceUri);
    }
}

// Helper function to build changes array for multi-file diff view
function buildChangesArray(
    files: ChangedFile[],
    gitApi: git.API,
    ref: string
): [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined][] {
    const changes: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined][] = [];
    for (const file of files) {
        const gitUri = gitApi.toGitUri(file.resourceUri, ref);

        // For deleted files: [label, left (old from ref), right (null - doesn't exist)]
        if (file.status === ExtendedStatus.INDEX_DELETED ||
            file.status === ExtendedStatus.DELETED ||
            file.status === ExtendedStatus.DELETED_BY_THEM ||
            file.status === ExtendedStatus.DELETED_BY_US) {
            changes.push([file.resourceUri, gitUri, undefined]);
        }
        // For added/untracked files: [label, left (null - didn't exist), right (current)]
        else if (file.status === ExtendedStatus.UNTRACKED ||
            file.status === ExtendedStatus.INDEX_ADDED ||
            file.status === ExtendedStatus.INTENT_TO_ADD) {
            changes.push([file.resourceUri, undefined, file.resourceUri]);
        }
        // For renamed files: [label, left (old from ref with original path), right (current with new path)]
        else if (file.status === ExtendedStatus.INDEX_RENAMED) {
            // For renamed files, originalUri has the old path and resourceUri has the new path
            const originalGitUri = gitApi.toGitUri(file.originalUri, ref);
            changes.push([file.resourceUri, originalGitUri, file.resourceUri]);
        }
        // For modified files: [label, left (old from ref), right (current)]
        else {
            changes.push([file.resourceUri, gitUri, file.resourceUri]);
        }
    }
    return changes;
}

async function openDirectoryChangesCommand(directoryNode: any) {
    // Get the Git API
    const gitApi = await getGitAPI();
    if (!gitApi) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // Check if it's a DirectoryNode
    if (!(directoryNode instanceof DirectoryNode)) {
        return;
    }

    // Check if resourceUri exists
    if (!directoryNode.resourceUri) {
        return;
    }

    // Find the repository for this directory
    for (const [repository, provider] of currentProviders.entries()) {
        if (directoryNode.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
            // Get all files in this directory from the tree data provider
            const treeDataProvider = currentTreeDataProviders.get(repository);
            if (!treeDataProvider) {
                return;
            }

            // Get children of this directory (recursive to get all files)
            const getFilesRecursive = async (node: any): Promise<ChangedFile[]> => {
                const children = await treeDataProvider.getChildren(node);
                const files: ChangedFile[] = [];
                for (const child of children) {
                    if (child instanceof DirectoryNode) {
                        // Recursively get files from subdirectories
                        files.push(...await getFilesRecursive(child));
                    } else if (child instanceof ChangedFile) {
                        // It's a ChangedFile
                        files.push(child);
                    }
                }
                return files;
            };

            const files = await getFilesRecursive(directoryNode);

            // Build changes array for vscode.changes command
            const ref = await provider.getCurrentRef();
            const changes = buildChangesArray(files, gitApi, ref);

            // Open all changes in multi-file diff view
            if (changes.length > 0) {
                await vscode.commands.executeCommand('vscode.changes', `${ref} ↔ Working Tree`, changes);
            }
            return;
        }
    }
}

async function openAllChangesCommand() {
    // Get the Git API
    const gitApi = await getGitAPI();
    if (!gitApi) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // Process all repositories
    for (const [repository, provider] of currentProviders.entries()) {
        const treeDataProvider = currentTreeDataProviders.get(repository);
        if (!treeDataProvider) {
            continue;
        }

        // Get all root-level items (files and directories)
        const rootItems = await treeDataProvider.getChildren();

        // Collect all changed files
        const getFilesRecursive = async (node: any): Promise<ChangedFile[]> => {
            if (node instanceof ChangedFile) {
                return [node];
            } else if (node instanceof DirectoryNode) {
                const children = await treeDataProvider.getChildren(node);
                const files: ChangedFile[] = [];
                for (const child of children) {
                    files.push(...await getFilesRecursive(child));
                }
                return files;
            }
            return [];
        };

        const allFiles: ChangedFile[] = [];
        for (const item of rootItems) {
            allFiles.push(...await getFilesRecursive(item));
        }

        // Build changes array for vscode.changes command
        const ref = await provider.getCurrentRef();
        const changes = buildChangesArray(allFiles, gitApi, ref);

        // Open all changes in multi-file diff view
        if (changes.length > 0) {
            await vscode.commands.executeCommand('vscode.changes', `${ref} ↔ Working Tree`, changes);
        }
    }
}

async function restoreFileCommand(fileItem: ChangedFile) {
    // Get the Git API
    const gitApi = await getGitAPI();
    if (!gitApi) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // Find the repository for this URI
    for (const [repository, provider] of currentProviders.entries()) {
        if (fileItem.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
            // Show confirmation dialog
            const fileName = path.basename(fileItem.resourceUri.fsPath);
            const ref = await provider.getCurrentRef();
            const answer = await vscode.window.showWarningMessage(
                l10n('confirm.restoreFile', fileName, ref),
                { modal: true },
                l10n('confirm.restore')
            );

            if (answer === l10n('confirm.restore')) {
                try {
                    // Check if file is added (doesn't exist in ref) or renamed
                    const isAdded = fileItem.status === ExtendedStatus.INDEX_ADDED ||
                        fileItem.status === ExtendedStatus.INTENT_TO_ADD ||
                        fileItem.status === ExtendedStatus.UNTRACKED ||
                        fileItem.status === ExtendedStatus.ADDED_BY_US ||
                        fileItem.status === ExtendedStatus.ADDED_BY_THEM ||
                        fileItem.status === ExtendedStatus.BOTH_ADDED;
                    const isRenamed = fileItem.status === ExtendedStatus.INDEX_RENAMED;

                    if (isAdded) {
                        // For added files, delete them (they don't exist in ref)
                        await vscode.workspace.fs.delete(fileItem.resourceUri);
                    } else if (isRenamed) {
                        // For renamed files: delete new file, restore old file
                        await vscode.workspace.fs.delete(fileItem.resourceUri);

                        // Get the relative path for the original file
                        const originalRelativePath = path.relative(repository.rootUri.fsPath, fileItem.originalUri.fsPath);
                        const content = await repository.show(ref, originalRelativePath);
                        await vscode.workspace.fs.writeFile(fileItem.originalUri, Buffer.from(content, 'utf8'));
                    } else {
                        // For modified/deleted files, restore content from ref
                        const relativePath = path.relative(repository.rootUri.fsPath, fileItem.resourceUri.fsPath);
                        const content = await repository.show(ref, relativePath);
                        await vscode.workspace.fs.writeFile(fileItem.resourceUri, Buffer.from(content, 'utf8'));
                    }

                    // Refresh the tree view
                    const treeDataProvider = currentTreeDataProviders.get(repository);
                    if (treeDataProvider) {
                        treeDataProvider.refresh();
                    }

                    vscode.window.showInformationMessage(l10n('info.restoredFile', fileName, ref));
                } catch (error) {
                    vscode.window.showErrorMessage(l10n('error.restoreFailed', String(error)));
                }
            }
            return;
        }
    }
}

async function restoreDirectoryCommand(directoryNode: any) {
    // Get the Git API
    const gitApi = await getGitAPI();
    if (!gitApi) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // Check if it's a DirectoryNode
    if (!(directoryNode instanceof DirectoryNode)) {
        return;
    }

    // Check if resourceUri exists
    if (!directoryNode.resourceUri) {
        return;
    }

    // Find the repository for this directory
    for (const [repository, provider] of currentProviders.entries()) {
        if (directoryNode.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
            // Get all files in this directory from the tree data provider
            const treeDataProvider = currentTreeDataProviders.get(repository);
            if (!treeDataProvider) {
                return;
            }

            // Get children of this directory (recursive to get all files)
            const getFilesRecursive = async (node: any): Promise<ChangedFile[]> => {
                const children = await treeDataProvider.getChildren(node);
                const files: ChangedFile[] = [];
                for (const child of children) {
                    if (child instanceof DirectoryNode) {
                        // Recursively get files from subdirectories
                        files.push(...await getFilesRecursive(child));
                    } else if (child instanceof ChangedFile) {
                        // It's a ChangedFile
                        files.push(child);
                    }
                }
                return files;
            };

            const files = await getFilesRecursive(directoryNode);

            if (files.length === 0) {
                return;
            }

            // Show confirmation dialog with file count
            const ref = await provider.getCurrentRef();
            const message = files.length === 1
                ? l10n('confirm.restoreDirectory.single', ref)
                : l10n('confirm.restoreDirectory.multiple', files.length, ref);

            const answer = await vscode.window.showWarningMessage(
                message,
                { modal: true },
                l10n('confirm.restore')
            );

            if (answer === l10n('confirm.restore')) {
                let successCount = 0;
                let failCount = 0;

                for (const file of files) {
                    try {
                        // Check if file is added (doesn't exist in ref) or renamed
                        const isAdded = file.status === ExtendedStatus.INDEX_ADDED ||
                            file.status === ExtendedStatus.INTENT_TO_ADD ||
                            file.status === ExtendedStatus.UNTRACKED ||
                            file.status === ExtendedStatus.ADDED_BY_US ||
                            file.status === ExtendedStatus.ADDED_BY_THEM ||
                            file.status === ExtendedStatus.BOTH_ADDED;
                        const isRenamed = file.status === ExtendedStatus.INDEX_RENAMED;

                        if (isAdded) {
                            // For added files, delete them (they don't exist in ref)
                            await vscode.workspace.fs.delete(file.resourceUri);
                        } else if (isRenamed) {
                            // For renamed files: delete new file, restore old file
                            await vscode.workspace.fs.delete(file.resourceUri);

                            // Get the relative path for the original file
                            const originalRelativePath = path.relative(repository.rootUri.fsPath, file.originalUri.fsPath);
                            const content = await repository.show(ref, originalRelativePath);
                            await vscode.workspace.fs.writeFile(file.originalUri, Buffer.from(content, 'utf8'));
                        } else {
                            // For modified/deleted files, restore content from ref
                            const relativePath = path.relative(repository.rootUri.fsPath, file.resourceUri.fsPath);
                            const content = await repository.show(ref, relativePath);
                            await vscode.workspace.fs.writeFile(file.resourceUri, Buffer.from(content, 'utf8'));
                        }

                        successCount++;
                    } catch (error) {
                        console.error(`Failed to restore ${file.resourceUri.fsPath}:`, error);
                        failCount++;
                    }
                }

                // Refresh the tree view
                const treeDataProvider = currentTreeDataProviders.get(repository);
                if (treeDataProvider) {
                    treeDataProvider.refresh();
                }

                if (failCount === 0) {
                    const message = successCount === 1
                        ? l10n('info.restoredFiles.single', ref)
                        : l10n('info.restoredFiles.multiple', successCount, ref);
                    vscode.window.showInformationMessage(message);
                } else {
                    vscode.window.showWarningMessage(
                        l10n('warning.restorePartialFailure', successCount, failCount)
                    );
                }
            }
            return;
        }
    }
}

async function setListMode() {
    if (!extensionContext) {
        return;
    }

    // Save to workspace state for all repositories
    for (const repository of currentRepositories.values()) {
        await extensionContext.workspaceState.update(
            getWorkspaceStateKeyDisplayMode(repository),
            'list'
        );
    }

    // Update tree data providers
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.setDisplayMode('list');
    }
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'list');
}

async function setTreeMode() {
    if (!extensionContext) {
        return;
    }

    // Save to workspace state for all repositories
    for (const repository of currentRepositories.values()) {
        await extensionContext.workspaceState.update(
            getWorkspaceStateKeyDisplayMode(repository),
            'tree'
        );
    }

    // Update tree data providers
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.setDisplayMode('tree');
    }
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'tree');
}

async function setDefaultActionOpenFile() {
    if (!extensionContext) {
        return;
    }

    // Save to workspace state for all repositories
    for (const repository of currentRepositories.values()) {
        await extensionContext.workspaceState.update(
            getWorkspaceStateKeyDefaultAction(repository),
            'openFile'
        );
    }

    // Update context
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', 'openFile');

    // Refresh tree data providers
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.refresh();
    }
}

async function setDefaultActionOpenChanges() {
    if (!extensionContext) {
        return;
    }

    // Save to workspace state for all repositories
    for (const repository of currentRepositories.values()) {
        await extensionContext.workspaceState.update(
            getWorkspaceStateKeyDefaultAction(repository),
            'openChanges'
        );
    }

    // Update context
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', 'openChanges');

    // Refresh tree data providers
    for (const treeDataProvider of currentTreeDataProviders.values()) {
        treeDataProvider.refresh();
    }
}
