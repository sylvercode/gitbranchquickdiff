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
const WORKSPACE_STATE_KEY_REF = 'gitbranchquickdiff.ref';
const WORKSPACE_STATE_KEY_ENABLED = 'gitbranchquickdiff.enabled';
const WORKSPACE_STATE_KEY_DISPLAY_MODE = 'gitbranchquickdiff.displayMode';
const WORKSPACE_STATE_KEY_DEFAULT_ACTION = 'gitbranchquickdiff.defaultAction';
const DEFAULT_REF = 'main';
const DEFAULT_ENABLED = true;
const DEFAULT_DISPLAY_MODE = 'list';
const DEFAULT_DEFAULT_ACTION = 'openChanges';

// Global helper functions to access workspace state
function getRawRef(context: vscode.ExtensionContext): string {
    // Try global workspace state first
    const cachedRef = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_REF);

    if (cachedRef !== undefined) {
        return cachedRef;
    }

    // Fall back to setting (default ref)
    return vscode.workspace.getConfiguration(EXTENTION_NAME)
        .get<string>(REF_CONFIG_NAME) ?? DEFAULT_REF;
}

async function getCurrentRef(context: vscode.ExtensionContext, repository: git.Repository): Promise<string> {
    // Try global workspace state first
    const cachedRef = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_REF);

    if (cachedRef !== undefined) {
        return await vscodeVariables.variables(repository, cachedRef);
    }

    // Fall back to setting (default ref)
    const configRef = vscode.workspace.getConfiguration(EXTENTION_NAME)
        .get<string>(REF_CONFIG_NAME) ?? DEFAULT_REF;

    return await vscodeVariables.variables(repository, configRef);
}

function getCurrentEnabled(context: vscode.ExtensionContext): boolean {
    // Get from global workspace state, default to DEFAULT_ENABLED if not set
    const cachedEnabled = context.workspaceState.get<boolean>(WORKSPACE_STATE_KEY_ENABLED);
    return cachedEnabled ?? DEFAULT_ENABLED;
}

function getCurrentDisplayMode(context: vscode.ExtensionContext): string {
    // Try global workspace state first
    const cachedDisplayMode = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_DISPLAY_MODE);

    if (cachedDisplayMode !== undefined) {
        return cachedDisplayMode;
    }

    // Fall back to setting (default display mode)
    return vscode.workspace.getConfiguration(EXTENTION_NAME)
        .get<string>(DISPLAY_MODE_CONFIG_NAME) ?? DEFAULT_DISPLAY_MODE;
}

function getCurrentDefaultAction(context: vscode.ExtensionContext): string {
    // Try global workspace state first
    const cachedDefaultAction = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_DEFAULT_ACTION);

    if (cachedDefaultAction !== undefined) {
        return cachedDefaultAction;
    }

    // Fall back to setting (default action)
    return vscode.workspace.getConfiguration(EXTENTION_NAME)
        .get<string>(DEFAULT_ACTION_CONFIG_NAME) ?? DEFAULT_DEFAULT_ACTION;
}

export function activate(context: vscode.ExtensionContext) {
    registerCommands(context);
    registerToGitExtention(context);
}

function registerCommands(context: vscode.ExtensionContext) {
    registerCommand(context, `${EXTENTION_NAME}.activate`, () => enableExtention(context));
    registerCommand(context, `${EXTENTION_NAME}.deactivate`, () => disableExtention(context));
    registerCommand(context, `${EXTENTION_NAME}.changeref`, () => changeRef(context));
    registerCommand(context, `${EXTENTION_NAME}.resetRef`, () => resetRef(context));
    registerCommand(context, `${EXTENTION_NAME}.refreshChanges`, refreshChanges);
    registerCommand(context, `${EXTENTION_NAME}.openChange`, (fileItem: ChangedFile) => openChangeCommand(context, fileItem));
    registerCommand(context, `${EXTENTION_NAME}.open File`, (fileItem: ChangedFile) => openFileCommand(context, fileItem));
    registerCommand(context, `${EXTENTION_NAME}.openDirectoryChanges`, (directoryNode: any) => openDirectoryChangesCommand(context, directoryNode));
    registerCommand(context, `${EXTENTION_NAME}.openAllChanges`, () => openAllChangesCommand(context));
    registerCommand(context, `${EXTENTION_NAME}.viewAsList`, () => setListMode(context));
    registerCommand(context, `${EXTENTION_NAME}.viewAsTree`, () => setTreeMode(context));
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenFile`, () => setDefaultActionOpenFile(context));
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenChanges`, () => setDefaultActionOpenChanges(context));
    registerCommand(context, `${EXTENTION_NAME}.restoreFile`, (fileItem: ChangedFile) => restoreFileCommand(context, fileItem));
    registerCommand(context, `${EXTENTION_NAME}.restoreDirectory`, (directoryNode: any) => restoreDirectoryCommand(context, directoryNode));
    registerCommand(context, `${EXTENTION_NAME}.clearWorkspaceCache`, () => clearWorkspaceCache(context));
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
    // Store git API reference for command access
    gitAPI = git;

    const providers = new Map<git.Repository, { provider: CustomQuickDiffProvider; disposable: vscode.Disposable }>();
    let singleTreeDataProvider: ChangesTreeDataProvider | undefined;
    let singleTreeView: vscode.TreeView<any> | undefined;

    // Helper function to re-register QuickDiffProvider
    const reregisterQuickDiffProvider = async (repository: git.Repository) => {
        console.log(`[GitBranchQuickDiff] Re-registering QuickDiffProvider for repository: ${repository.rootUri.fsPath}`);

        const existingProvider = providers.get(repository);
        if (existingProvider) {
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
            console.log(`[GitBranchQuickDiff] QuickDiffProvider re-registered`);
        }
    };

    // Store a function to re-register all providers (for use by commands)
    reregisterAllProvidersFunc = async () => {
        for (const repository of providers.keys()) {
            await reregisterQuickDiffProvider(repository);
        }

        // Refresh single tree view (which will update decorations)
        if (singleTreeView && singleTreeDataProvider && firstRepository) {
            const isEnabled = getCurrentEnabled(context);
            const ref = await getCurrentRef(context, firstRepository);
            singleTreeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;
            singleTreeDataProvider.refresh();
        }
    };

    // Helper function to setup HEAD change listener
    const setupHeadChangeListener = (repository: git.Repository) => {
        context.subscriptions.push(repository.state.onDidChange(async () => {
            console.log(`[GitBranchQuickDiff] HEAD changed for repository: ${repository.rootUri.fsPath}`);
            await reregisterQuickDiffProvider(repository);

            // Refresh single tree view (which will update decorations)
            // Only update if this is the first repository (the one shown in the tree view)
            if (singleTreeView && singleTreeDataProvider && firstRepository === repository) {
                const isEnabled = getCurrentEnabled(context);
                const ref = await getCurrentRef(context, repository);
                singleTreeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;
                vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', isEnabled);
                singleTreeDataProvider.refresh();
            }
        }));
    };

    const registerRepo = async (repository: git.Repository) => {
        console.log(`[GitBranchQuickDiff] Registering provider for repository: ${repository.rootUri.fsPath}`);

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
        console.log(`[GitBranchQuickDiff] QuickDiffProvider registered`);

        // Create tree view only for the first repository
        if (!singleTreeView) {
            console.log(`[GitBranchQuickDiff] Creating single tree view for repository: ${repository.rootUri.fsPath}`);

            // Store first repository reference
            firstRepository = repository;

            const treeDataProvider = new ChangesTreeDataProvider(
                repository,
                () => getCurrentRef(context, repository),
                () => getCurrentDefaultAction(context),
                () => getCurrentEnabled(context)
            );
            // Set display mode from workspace state/configuration
            const savedDisplayMode = getCurrentDisplayMode(context);
            treeDataProvider.setDisplayMode(savedDisplayMode as 'list' | 'tree');

            const treeView = vscode.window.createTreeView(`${EXTENTION_NAME}.changes`, {
                treeDataProvider,
                showCollapseAll: true
            });
            // Set initial title with ref
            const isEnabled = getCurrentEnabled(context);
            const ref = await getCurrentRef(context, repository);
            treeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;
            context.subscriptions.push(treeView);
            console.log(`[GitBranchQuickDiff] Tree view created`);

            // Register file decoration provider for explorer and tab headers
            console.log(`[GitBranchQuickDiff] Registering file decoration provider`);
            const decorationDisposable = vscode.window.registerFileDecorationProvider(treeDataProvider.decorationProvider);
            context.subscriptions.push(decorationDisposable);
            console.log(`[GitBranchQuickDiff] File decoration provider registered`);

            // Store single tree view references
            singleTreeDataProvider = treeDataProvider;
            singleTreeView = treeView;
            currentTreeDataProvider = treeDataProvider;

            // Set contexts
            const displayMode = getCurrentDisplayMode(context);
            const enabled = getCurrentEnabled(context);
            const defaultAction = getCurrentDefaultAction(context);
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

            // Clear workspace state overrides for changed configurations
            if (e.affectsConfiguration(`${EXTENTION_NAME}.${REF_CONFIG_NAME}`)) {
                await context.workspaceState.update(WORKSPACE_STATE_KEY_REF, undefined);
            }
            if (e.affectsConfiguration(`${EXTENTION_NAME}.${DISPLAY_MODE_CONFIG_NAME}`)) {
                await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, undefined);
            }
            if (e.affectsConfiguration(`${EXTENTION_NAME}.${DEFAULT_ACTION_CONFIG_NAME}`)) {
                await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, undefined);
            }

            // Re-register all QuickDiffProviders
            for (const repository of providers.keys()) {
                await reregisterQuickDiffProvider(repository);
            }

            // Get global settings once
            const isEnabled = getCurrentEnabled(context);
            const displayMode = getCurrentDisplayMode(context);
            const defaultAction = getCurrentDefaultAction(context);

            // Update global contexts once
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', displayMode);
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', isEnabled);
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', defaultAction);

            // Refresh single tree view (which will update decorations)
            if (singleTreeView && singleTreeDataProvider && firstRepository) {
                const ref = await getCurrentRef(context, firstRepository);
                singleTreeView.title = isEnabled ? `Quick Diff (${ref})` : `Quick Diff (deactivated)`;
                singleTreeDataProvider.setDisplayMode(displayMode as 'list' | 'tree');
                singleTreeDataProvider.refresh();
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
        private context: vscode.ExtensionContext,
        private git: git.API,
        private repository: git.Repository) {
    }

    public async updateLabel() {
        this._label = await getCurrentRef(this.context, this.repository);
    }

    async provideOriginalResource(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        if (uri.scheme !== 'file') {
            return undefined;
        }

        const isEnabled = getCurrentEnabled(this.context);
        if (!isEnabled) {
            return undefined;
        }

        // Check if file is in this repository
        const repoPath = this.repository.rootUri.fsPath;
        if (!uri.fsPath.startsWith(repoPath)) {
            return undefined;
        }

        // Get the custom reference from settings
        const ref = await getCurrentRef(this.context, this.repository);
        return this.git.toGitUri(uri, ref);
    }
}

function registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) {
    context.subscriptions.push(
        vscode.commands.registerCommand(command, callback, thisArg));
}

async function enableExtention(context: vscode.ExtensionContext) {
    // Save to global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_ENABLED, true);

    // Set context immediately for UI responsiveness
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', true);

    // Re-register all providers
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }
}

async function disableExtention(context: vscode.ExtensionContext) {
    // Save to global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_ENABLED, false);

    // Set context immediately for UI responsiveness
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', false);

    // Re-register all providers and refresh tree view
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }

    // Force refresh tree view to show deactivation message
    if (currentTreeDataProvider) {
        currentTreeDataProvider.refresh();
    }
}

async function changeRef(context: vscode.ExtensionContext) {
    // Get raw (unsubstituted) ref value to show in input box
    // This preserves variable syntax like ${git:lastTag}
    const currentValue = getRawRef(context);

    const input = await vscode.window.showInputBox({
        title: l10n('prompt.setRefTitle'),
        prompt: l10n('prompt.setRefPlaceholder'),
        value: currentValue,
    });

    if (input !== undefined) {
        // Save to global workspace state
        await context.workspaceState.update(WORKSPACE_STATE_KEY_REF, input);

        // Re-register all providers with the new ref
        if (reregisterAllProvidersFunc) {
            await reregisterAllProvidersFunc();
        }
    }
}

async function resetRef(context: vscode.ExtensionContext) {
    // Clear global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_REF, undefined);

    // Re-register all providers to use the default setting
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }

    vscode.window.showInformationMessage(l10n('info.refResetToDefault'));
}

async function clearWorkspaceCache(context: vscode.ExtensionContext) {
    // Confirm action
    const answer = await vscode.window.showWarningMessage(
        'Clear all GitBranchQuickDiff workspace cache? This will reset all settings (ref, enabled state, display mode, default action).',
        { modal: true },
        'Clear Cache'
    );

    if (answer !== 'Clear Cache') {
        return;
    }

    // Clear all global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_REF, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_ENABLED, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, undefined);

    // Re-register all providers to use the default settings
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }

    vscode.window.showInformationMessage('GitBranchQuickDiff workspace cache cleared. All settings reset to defaults.');
}

// Global references to store current tree view and repositories for command access
let currentTreeDataProvider: ChangesTreeDataProvider | undefined;
let firstRepository: git.Repository | undefined;
let gitAPI: git.API | undefined;

// Store the reregistration function for access from commands
let reregisterAllProvidersFunc: (() => Promise<void>) | undefined;

function refreshChanges() {
    // Clear tag cache to force fresh tag lookup
    vscodeVariables.clearTagCache();

    if (currentTreeDataProvider) {
        currentTreeDataProvider.refresh();
    }
}

async function openChangeCommand(context: vscode.ExtensionContext, fileItem: ChangedFile) {
    if (!gitAPI) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // Find the repository for this URI
    for (const repository of gitAPI.repositories) {
        if (fileItem.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
            await openChange(gitAPI, repository, () => getCurrentRef(context, repository), fileItem.resourceUri, fileItem.originalUri, fileItem.status);
            return;
        }
    }
}

async function openFileCommand(context: vscode.ExtensionContext, fileItem: ChangedFile) {
    // For deleted files, use openChange to show the file from the ref
    if (fileItem.status === ExtendedStatus.INDEX_DELETED ||
        fileItem.status === ExtendedStatus.DELETED ||
        fileItem.status === ExtendedStatus.DELETED_BY_THEM ||
        fileItem.status === ExtendedStatus.DELETED_BY_US) {
        if (!gitAPI) {
            vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
            return;
        }

        // Find the repository for this URI
        for (const repository of gitAPI.repositories) {
            if (fileItem.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
                await openChange(gitAPI, repository, () => getCurrentRef(context, repository), fileItem.resourceUri, fileItem.originalUri, fileItem.status);
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

async function openDirectoryChangesCommand(context: vscode.ExtensionContext, directoryNode: any) {
    if (!gitAPI) {
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
    for (const repository of gitAPI.repositories) {
        if (directoryNode.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
            // Get all files in this directory from the tree data provider
            if (!currentTreeDataProvider) {
                return;
            }
            const treeDataProvider = currentTreeDataProvider;

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
            const ref = await getCurrentRef(context, repository);
            const changes = buildChangesArray(files, gitAPI, ref);

            // Open all changes in multi-file diff view
            if (changes.length > 0) {
                await vscode.commands.executeCommand('vscode.changes', `${ref} ↔ Working Tree`, changes);
            }
            return;
        }
    }
}

async function openAllChangesCommand(context: vscode.ExtensionContext) {
    if (!gitAPI || !firstRepository || !currentTreeDataProvider) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    const treeDataProvider = currentTreeDataProvider;

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
    const ref = await getCurrentRef(context, firstRepository);
    const changes = buildChangesArray(allFiles, gitAPI, ref);

    // Open all changes in multi-file diff view
    if (changes.length > 0) {
        await vscode.commands.executeCommand('vscode.changes', `${ref} ↔ Working Tree`, changes);
    }
}

async function restoreFileCommand(context: vscode.ExtensionContext, fileItem: ChangedFile) {
    if (!gitAPI) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // Find the repository for this URI
    for (const repository of gitAPI.repositories) {
        if (fileItem.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
            // Show confirmation dialog
            const fileName = path.basename(fileItem.resourceUri.fsPath);
            const ref = await getCurrentRef(context, repository);
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
                    if (currentTreeDataProvider) {
                        currentTreeDataProvider.refresh();
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

async function restoreDirectoryCommand(context: vscode.ExtensionContext, directoryNode: any) {
    if (!gitAPI) {
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
    for (const repository of gitAPI.repositories) {
        if (directoryNode.resourceUri.fsPath.startsWith(repository.rootUri.fsPath)) {
            // Get all files in this directory from the tree data provider
            if (!currentTreeDataProvider) {
                return;
            }
            const treeDataProvider = currentTreeDataProvider;

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
            const ref = await getCurrentRef(context, repository);
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
                if (currentTreeDataProvider) {
                    currentTreeDataProvider.refresh();
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

async function setListMode(context: vscode.ExtensionContext) {
    // Save to global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, 'list');

    // Update tree data provider
    if (currentTreeDataProvider) {
        currentTreeDataProvider.setDisplayMode('list');
    }
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'list');
}

async function setTreeMode(context: vscode.ExtensionContext) {
    // Save to global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, 'tree');

    // Update tree data provider
    if (currentTreeDataProvider) {
        currentTreeDataProvider.setDisplayMode('tree');
    }
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'tree');
}

async function setDefaultActionOpenFile(context: vscode.ExtensionContext) {
    // Save to global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, 'openFile');

    // Update context
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', 'openFile');

    // Refresh tree data provider
    if (currentTreeDataProvider) {
        currentTreeDataProvider.refresh();
    }
}

async function setDefaultActionOpenChanges(context: vscode.ExtensionContext) {
    // Save to global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, 'openChanges');

    // Update context
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', 'openChanges');

    // Refresh tree data provider
    if (currentTreeDataProvider) {
        currentTreeDataProvider.refresh();
    }
}
