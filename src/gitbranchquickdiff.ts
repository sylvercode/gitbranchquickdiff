import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as util from 'util';
import * as vscodeVariables from './vscode-variables';
import { getGitAPI } from './gitApi';
import * as git from './git';
import { Status } from './git';
import { ChangedFile, ChangesTreeDataProvider, DirectoryNode, openChange, ExtendedStatus, RepositoryNode, MultiRepoTreeDataProvider } from './changesTreeView';
import { l10n } from './l10n';

const execFile = util.promisify(child_process.execFile);

export const EXTENTION_NAME = 'gitbranchquickdiff';

const REF_CONFIG_NAME = 'ref';
const DISPLAY_MODE_CONFIG_NAME = 'displayMode';
const DEFAULT_ACTION_CONFIG_NAME = 'defaultAction';
const SUBMODULE_DISPLAY_CONFIG_NAME = 'submoduleDisplay';
const WORKSPACE_STATE_KEY_REF = 'gitbranchquickdiff.ref'; // Legacy key for migration
const WORKSPACE_STATE_KEY_REFS = 'gitbranchquickdiff.refs'; // Per-repo ref map: Record<string, string>
const WORKSPACE_STATE_KEY_ENABLED = 'gitbranchquickdiff.enabled';
const WORKSPACE_STATE_KEY_DISPLAY_MODE = 'gitbranchquickdiff.displayMode';
const WORKSPACE_STATE_KEY_DEFAULT_ACTION = 'gitbranchquickdiff.defaultAction';
const WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY = 'gitbranchquickdiff.submoduleDisplay';
const WORKSPACE_STATE_KEY_RECENT_REFS = 'gitbranchquickdiff.recentRefs';
const DEFAULT_REF = 'main';
const MAX_RECENT_REFS = 10;
const DEFAULT_ENABLED = true;
const DEFAULT_DISPLAY_MODE = 'list';
const DEFAULT_DEFAULT_ACTION = 'openChanges';
const DEFAULT_SUBMODULE_DISPLAY = 'standalone';

// Global helper functions to access workspace state
function getRawRef(context: vscode.ExtensionContext, repository: git.Repository): string {
    // Try per-repo workspace state first
    const refsMap = context.workspaceState.get<Record<string, string>>(WORKSPACE_STATE_KEY_REFS);
    const repoKey = repository.rootUri.fsPath;

    if (refsMap !== undefined && refsMap[repoKey] !== undefined) {
        return refsMap[repoKey];
    }

    // Fall back to setting (default ref)
    return vscode.workspace.getConfiguration(EXTENTION_NAME)
        .get<string>(REF_CONFIG_NAME) ?? DEFAULT_REF;
}

async function getCurrentRef(context: vscode.ExtensionContext, repository: git.Repository): Promise<string> {
    return await vscodeVariables.variables(repository, getRawRef(context, repository));
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

function getCurrentSubmoduleDisplay(context: vscode.ExtensionContext): string {
    // Try global workspace state first
    const cached = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY);

    if (cached !== undefined) {
        return cached;
    }

    // Fall back to setting
    return vscode.workspace.getConfiguration(EXTENTION_NAME)
        .get<string>(SUBMODULE_DISPLAY_CONFIG_NAME) ?? DEFAULT_SUBMODULE_DISPLAY;
}

async function migrateWorkspaceState(context: vscode.ExtensionContext, repositories: git.Repository[]) {
    // Migrate ref: from single string to per-repo map
    const oldRef = context.workspaceState.get<string>(WORKSPACE_STATE_KEY_REF);
    if (oldRef !== undefined) {
        const refsMap: Record<string, string> = {};
        for (const repo of repositories) {
            refsMap[repo.rootUri.fsPath] = oldRef;
        }
        await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, refsMap);
        await context.workspaceState.update(WORKSPACE_STATE_KEY_REF, undefined);
    }

    // Migrate recentRefs: from single array to per-repo map
    const oldRecentRefs = context.workspaceState.get<unknown>(WORKSPACE_STATE_KEY_RECENT_REFS);
    if (Array.isArray(oldRecentRefs)) {
        const recentRefsMap: Record<string, string[]> = {};
        for (const repo of repositories) {
            recentRefsMap[repo.rootUri.fsPath] = [...oldRecentRefs];
        }
        await context.workspaceState.update(WORKSPACE_STATE_KEY_RECENT_REFS, recentRefsMap);
    }
}

export function activate(context: vscode.ExtensionContext) {
    registerCommands(context);
    registerToGitExtention(context);
}

function registerCommands(context: vscode.ExtensionContext) {
    registerCommand(context, `${EXTENTION_NAME}.activate`, () => enableExtention(context));
    registerCommand(context, `${EXTENTION_NAME}.deactivate`, () => disableExtention(context));
    registerCommand(context, `${EXTENTION_NAME}.changeref`, (repoNode?: RepositoryNode) => changeRef(context, repoNode));
    registerCommand(context, `${EXTENTION_NAME}.resetRef`, (repoNode?: RepositoryNode) => resetRef(context, repoNode));
    registerCommand(context, `${EXTENTION_NAME}.refreshChanges`, (repoNode?: RepositoryNode) => refreshChanges(repoNode));
    registerCommand(context, `${EXTENTION_NAME}.openChange`, (fileItem: ChangedFile) => openChangeCommand(context, fileItem));
    registerCommand(context, `${EXTENTION_NAME}.openFile`, (fileItem: ChangedFile) => openFileCommand(context, fileItem));
    registerCommand(context, `${EXTENTION_NAME}.openDirectoryChanges`, (directoryNode: any) => openDirectoryChangesCommand(context, directoryNode));
    registerCommand(context, `${EXTENTION_NAME}.openAllChanges`, (repoNode?: RepositoryNode) => openAllChangesCommand(context, repoNode));
    registerCommand(context, `${EXTENTION_NAME}.viewAsList`, () => setListMode(context));
    registerCommand(context, `${EXTENTION_NAME}.viewAsTree`, () => setTreeMode(context));
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenFile`, () => setDefaultActionOpenFile(context));
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenChanges`, () => setDefaultActionOpenChanges(context));
    registerCommand(context, `${EXTENTION_NAME}.restoreFile`, (fileItem: ChangedFile) => restoreFileCommand(context, fileItem));
    registerCommand(context, `${EXTENTION_NAME}.restoreDirectory`, (directoryNode: any) => restoreDirectoryCommand(context, directoryNode));
    registerCommand(context, `${EXTENTION_NAME}.clearWorkspaceCache`, () => clearWorkspaceCache(context));
    registerCommand(context, `${EXTENTION_NAME}.toggleSubmoduleDisplay`, () => toggleSubmoduleDisplay(context));
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

    // Migrate workspace state from global to per-repo format
    await migrateWorkspaceState(context, git.repositories);

    // Register our custom content provider for historical file versions
    const contentProvider = new GitBranchQuickDiffContentProvider(context, git);
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(QUICKDIFF_SCHEME, contentProvider)
    );
    console.log(`[GitBranchQuickDiff] Registered content provider for scheme: ${QUICKDIFF_SCHEME}`);

    const providers = new Map<git.Repository, { provider: CustomQuickDiffProvider; disposable: vscode.Disposable }>();

    // Create MultiRepoTreeDataProvider and tree view (once for all repos)
    const submoduleDisplay = getCurrentSubmoduleDisplay(context);
    const multiRepoProvider = new MultiRepoTreeDataProvider(submoduleDisplay as 'standalone' | 'integrated');
    currentMultiRepoProvider = multiRepoProvider;

    const treeView = vscode.window.createTreeView(`${EXTENTION_NAME}.changes`, {
        treeDataProvider: multiRepoProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);
    console.log(`[GitBranchQuickDiff] Tree view created`);

    // Helper to update tree view title
    const updateTitle = async () => {
        const isEnabled = getCurrentEnabled(context);
        if (!isEnabled) {
            treeView.title = `Quick Diff (deactivated)`;
        } else if (multiRepoProvider.size === 1) {
            const repo = multiRepoProvider.repositories[0];
            const ref = await getCurrentRef(context, repo);
            treeView.title = `Quick Diff (${ref})`;
        } else {
            treeView.title = `Quick Diff`;
        }
    };

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

        // Update repo node descriptions
        for (const repo of multiRepoProvider.repositories) {
            const node = multiRepoProvider.getNodeForRepo(repo);
            if (node) {
                const ref = await getCurrentRef(context, repo);
                node.updateDescription(ref);
            }
        }

        await updateTitle();
        multiRepoProvider.refresh();
    };

    // Helper function to setup HEAD change listener
    const setupHeadChangeListener = (repository: git.Repository) => {
        context.subscriptions.push(repository.state.onDidChange(async () => {
            console.log(`[GitBranchQuickDiff] HEAD changed for repository: ${repository.rootUri.fsPath}`);
            await reregisterQuickDiffProvider(repository);

            // Update repo node description
            const node = multiRepoProvider.getNodeForRepo(repository);
            if (node) {
                const ref = await getCurrentRef(context, repository);
                node.updateDescription(ref);
            }

            await updateTitle();
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', getCurrentEnabled(context));
            multiRepoProvider.refreshRepo(repository);
        }));
    };

    const registerRepo = async (repository: git.Repository) => {
        console.log(`[GitBranchQuickDiff] Registering provider for repository: ${repository.rootUri.fsPath}`);

        // Register QuickDiffProvider
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

        // Create ChangesTreeDataProvider for this repo
        const treeDataProvider = new ChangesTreeDataProvider(
            repository,
            () => getCurrentRef(context, repository),
            () => getCurrentDefaultAction(context),
            () => getCurrentEnabled(context)
        );
        const savedDisplayMode = getCurrentDisplayMode(context);
        treeDataProvider.setDisplayMode(savedDisplayMode as 'list' | 'tree');

        // Register file decoration provider for this repo
        console.log(`[GitBranchQuickDiff] Registering file decoration provider for: ${repository.rootUri.fsPath}`);
        const decorationDisposable = vscode.window.registerFileDecorationProvider(treeDataProvider.decorationProvider);
        context.subscriptions.push(decorationDisposable);

        // Add to multi-repo provider
        const ref = await getCurrentRef(context, repository);
        multiRepoProvider.addRepository(repository, treeDataProvider, ref);

        // Store first repository reference (for commands that need a default repo)
        if (!firstRepository) {
            firstRepository = repository;
        }
    };

    // Register existing repositories
    for (const repository of git.repositories) {
        await registerRepo(repository);
        setupHeadChangeListener(repository);
    }

    // Set initial title and contexts
    await updateTitle();
    const displayMode = getCurrentDisplayMode(context);
    const enabled = getCurrentEnabled(context);
    const defaultAction = getCurrentDefaultAction(context);
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', displayMode);
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', enabled);
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', defaultAction);
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.submoduleDisplay', getCurrentSubmoduleDisplay(context));

    // Listen for new repositories
    context.subscriptions.push(git.onDidOpenRepository(async (repository) => {
        await registerRepo(repository);
        setupHeadChangeListener(repository);
        await updateTitle();
    }));

    // Listen for config changes and re-register providers
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration(`${EXTENTION_NAME}.${REF_CONFIG_NAME}`) ||
            e.affectsConfiguration(`${EXTENTION_NAME}.${DISPLAY_MODE_CONFIG_NAME}`) ||
            e.affectsConfiguration(`${EXTENTION_NAME}.${DEFAULT_ACTION_CONFIG_NAME}`) ||
            e.affectsConfiguration(`${EXTENTION_NAME}.${SUBMODULE_DISPLAY_CONFIG_NAME}`)) {
            console.log(`[GitBranchQuickDiff] Configuration changed`);

            // Clear workspace state overrides for changed configurations
            if (e.affectsConfiguration(`${EXTENTION_NAME}.${REF_CONFIG_NAME}`)) {
                await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, undefined);
            }
            if (e.affectsConfiguration(`${EXTENTION_NAME}.${DISPLAY_MODE_CONFIG_NAME}`)) {
                await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, undefined);
            }
            if (e.affectsConfiguration(`${EXTENTION_NAME}.${DEFAULT_ACTION_CONFIG_NAME}`)) {
                await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, undefined);
            }
            if (e.affectsConfiguration(`${EXTENTION_NAME}.${SUBMODULE_DISPLAY_CONFIG_NAME}`)) {
                await context.workspaceState.update(WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY, undefined);
            }

            // Re-register all QuickDiffProviders
            for (const repository of providers.keys()) {
                await reregisterQuickDiffProvider(repository);
            }

            // Get global settings once
            const isEnabled = getCurrentEnabled(context);
            const cfgDisplayMode = getCurrentDisplayMode(context);
            const cfgDefaultAction = getCurrentDefaultAction(context);

            // Update global contexts once
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', cfgDisplayMode);
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.enabled', isEnabled);
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', cfgDefaultAction);

            // Update submodule display mode
            const cfgSubmoduleDisplay = getCurrentSubmoduleDisplay(context);
            vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.submoduleDisplay', cfgSubmoduleDisplay);
            multiRepoProvider.setSubmoduleDisplay(cfgSubmoduleDisplay as 'standalone' | 'integrated');

            // Update repo node descriptions
            for (const repo of multiRepoProvider.repositories) {
                const node = multiRepoProvider.getNodeForRepo(repo);
                if (node) {
                    const ref = await getCurrentRef(context, repo);
                    node.updateDescription(ref);
                }
            }

            await updateTitle();
            multiRepoProvider.setDisplayMode(cfgDisplayMode as 'list' | 'tree');
            multiRepoProvider.refresh();
        }
    }));
}

// Custom URI scheme for our quick diff provider
const QUICKDIFF_SCHEME = 'gitbranchquickdiff';

// Content provider for historical file versions
class GitBranchQuickDiffContentProvider implements vscode.TextDocumentContentProvider {
    constructor(
        private context: vscode.ExtensionContext,
        private git: git.API) {
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        // Parse the query to get the original file URI and ref
        const query = JSON.parse(uri.query);
        const originalUri = vscode.Uri.parse(query.uri);
        const ref = query.ref;

        // Find the repository for this file
        for (const repository of this.git.repositories) {
            if (originalUri.fsPath.startsWith(repository.rootUri.fsPath)) {
                try {
                    // Get the relative path
                    const relativePath = path.relative(repository.rootUri.fsPath, originalUri.fsPath);
                    // Get content from git using binary encoding to preserve original bytes
                    const content = await repository.show(ref, relativePath);
                    // Return as-is - VS Code will apply the correct encoding based on the working file
                    return content;
                } catch (error) {
                    console.error(`[GitBranchQuickDiff] Error getting content for ${originalUri.fsPath} at ${ref}:`, error);
                    return '';
                }
            }
        }
        return '';
    }
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

        // Create a custom URI with our scheme that includes the original URI and ref
        // This allows our content provider to retrieve the content with proper encoding handling
        return uri.with({
            scheme: QUICKDIFF_SCHEME,
            query: JSON.stringify({ uri: uri.toString(), ref })
        });
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
    if (currentMultiRepoProvider) {
        currentMultiRepoProvider.refresh();
    }
}

async function pickRepository(context: vscode.ExtensionContext): Promise<git.Repository | undefined> {
    if (!currentMultiRepoProvider || currentMultiRepoProvider.size === 0) {
        return undefined;
    }

    const repos = currentMultiRepoProvider.repositories;
    if (repos.length === 1) {
        return repos[0];
    }

    // Show quick pick with repo names
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

async function changeRef(context: vscode.ExtensionContext, repoNode?: RepositoryNode) {
    // Determine target repository
    let repository: git.Repository | undefined;
    if (repoNode instanceof RepositoryNode) {
        repository = repoNode.repository;
    } else {
        repository = await pickRepository(context);
    }

    if (!repository) {
        return;
    }

    // Get raw (unsubstituted) ref value to show in input box
    // This preserves variable syntax like ${git:lastTag}
    const currentValue = getRawRef(context, repository);

    // Load recent refs from workspace state (per-repo)
    const allRecentRefs = context.workspaceState.get<Record<string, string[]>>(WORKSPACE_STATE_KEY_RECENT_REFS) ?? {};
    const recentRefs = allRecentRefs[repository.rootUri.fsPath] ?? [];

    // Create quick pick with custom input support
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = l10n('prompt.setRefTitle');
    quickPick.placeholder = l10n('prompt.setRefPlaceholder');

    // Build quick pick items from recent refs
    const quickPickItems: vscode.QuickPickItem[] = recentRefs.map(ref => ({
        label: ref,
        description: ref === currentValue ? '(current)' : undefined
    }));

    quickPick.items = quickPickItems;

    // Handle selection or custom input
    const input = await new Promise<string | undefined>((resolve) => {
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (selected) {
                // User selected an item from the list
                resolve(selected.label);
            } else {
                // User typed a custom value
                resolve(quickPick.value);
            }
            quickPick.hide();
        });

        quickPick.onDidHide(() => {
            resolve(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });

    if (input !== undefined && input.trim() !== '') {
        // Save to per-repo workspace state
        const refsMap = context.workspaceState.get<Record<string, string>>(WORKSPACE_STATE_KEY_REFS) ?? {};
        refsMap[repository.rootUri.fsPath] = input;
        await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, refsMap);

        // Update recent refs list
        await updateRecentRefs(context, repository, input);

        // Re-register all providers with the new ref
        if (reregisterAllProvidersFunc) {
            await reregisterAllProvidersFunc();
        }
    }
}

async function updateRecentRefs(context: vscode.ExtensionContext, repository: git.Repository, ref: string) {
    // Load current recent refs (per-repo)
    const allRecentRefs = context.workspaceState.get<Record<string, string[]>>(WORKSPACE_STATE_KEY_RECENT_REFS) ?? {};
    const repoKey = repository.rootUri.fsPath;
    const recentRefs = allRecentRefs[repoKey] ?? [];

    // Remove ref if it already exists to avoid duplicates
    const filtered = recentRefs.filter(r => r !== ref);

    // Add to front of list (most recent first)
    filtered.unshift(ref);

    // Keep only MAX_RECENT_REFS
    const updated = filtered.slice(0, MAX_RECENT_REFS);

    // Save back to workspace state
    allRecentRefs[repoKey] = updated;
    await context.workspaceState.update(WORKSPACE_STATE_KEY_RECENT_REFS, allRecentRefs);
}

async function resetRef(context: vscode.ExtensionContext, repoNode?: RepositoryNode) {
    // Determine target repository
    let repository: git.Repository | undefined;
    if (repoNode instanceof RepositoryNode) {
        repository = repoNode.repository;
    } else {
        repository = await pickRepository(context);
    }

    if (!repository) {
        return;
    }

    // Clear per-repo ref from workspace state
    const refsMap = context.workspaceState.get<Record<string, string>>(WORKSPACE_STATE_KEY_REFS);
    if (refsMap !== undefined) {
        delete refsMap[repository.rootUri.fsPath];
        const hasEntries = Object.keys(refsMap).length > 0;
        await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, hasEntries ? refsMap : undefined);
    }

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
    await context.workspaceState.update(WORKSPACE_STATE_KEY_REFS, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_REF, undefined); // Clear legacy key
    await context.workspaceState.update(WORKSPACE_STATE_KEY_ENABLED, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY, undefined);
    await context.workspaceState.update(WORKSPACE_STATE_KEY_RECENT_REFS, undefined);

    // Re-register all providers to use the default settings
    if (reregisterAllProvidersFunc) {
        await reregisterAllProvidersFunc();
    }

    vscode.window.showInformationMessage('GitBranchQuickDiff workspace cache cleared. All settings reset to defaults.');
}

async function toggleSubmoduleDisplay(context: vscode.ExtensionContext) {
    const current = getCurrentSubmoduleDisplay(context);
    const newMode = current === 'standalone' ? 'integrated' : 'standalone';

    await context.workspaceState.update(WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY, newMode);
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.submoduleDisplay', newMode);

    if (currentMultiRepoProvider) {
        currentMultiRepoProvider.setSubmoduleDisplay(newMode);
    }
}

// Global references to store current tree view and repositories for command access
let currentMultiRepoProvider: MultiRepoTreeDataProvider | undefined;
let firstRepository: git.Repository | undefined;
let gitAPI: git.API | undefined;

// Store the reregistration function for access from commands
let reregisterAllProvidersFunc: (() => Promise<void>) | undefined;

function refreshChanges(repoNode?: RepositoryNode) {
    // Clear tag cache to force fresh tag lookup
    vscodeVariables.clearTagCache();

    if (currentMultiRepoProvider) {
        if (repoNode instanceof RepositoryNode) {
            currentMultiRepoProvider.refreshRepo(repoNode.repository);
        } else {
            currentMultiRepoProvider.refresh();
        }
    }
}

async function openChangeCommand(context: vscode.ExtensionContext, fileItem: ChangedFile | { resourceUri: vscode.Uri; originalUri: vscode.Uri; status: ExtendedStatus; existsInRef?: boolean }) {
    if (!gitAPI) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // Extract properties (works with both ChangedFile and plain object)
    const resourceUri = fileItem.resourceUri;
    const originalUri = fileItem.originalUri;
    const status = fileItem.status;
    const existsInRef = fileItem.existsInRef ?? true;

    // Find the repository for this URI
    for (const repository of gitAPI.repositories) {
        if (resourceUri.path.startsWith(repository.rootUri.path)) {
            await openChange(gitAPI, repository, () => getCurrentRef(context, repository), resourceUri, originalUri, status, existsInRef);
            return;
        }
    }
}

async function openFileCommand(context: vscode.ExtensionContext, fileItem: ChangedFile | { resourceUri: vscode.Uri; originalUri: vscode.Uri; status: ExtendedStatus; existsInRef?: boolean }) {
    // Extract properties (works with both ChangedFile and plain object)
    const resourceUri = fileItem.resourceUri;
    const originalUri = fileItem.originalUri;
    const status = fileItem.status;
    const existsInRef = fileItem.existsInRef ?? true;

    // Check if file exists on disk
    let fileExists = true;
    try {
        await vscode.workspace.fs.stat(resourceUri);
    } catch {
        fileExists = false;
    }

    // For deleted files or restored files that don't exist (added after ref then deleted)
    if (status === ExtendedStatus.INDEX_DELETED ||
        status === ExtendedStatus.DELETED ||
        status === ExtendedStatus.DELETED_BY_THEM ||
        status === ExtendedStatus.DELETED_BY_US ||
        (status === ExtendedStatus.RESTORED && !fileExists && !existsInRef)) {
        if (!gitAPI) {
            vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
            return;
        }

        // Find the repository for this URI
        for (const repository of gitAPI.repositories) {
            if (resourceUri.path.startsWith(repository.rootUri.path)) {
                // Check if file is in Git's state (working tree, index, or merge)
                const isInGitState =
                    repository.state.workingTreeChanges.some(c => c.uri.toString() === resourceUri.toString()) ||
                    repository.state.indexChanges.some(c => c.uri.toString() === resourceUri.toString()) ||
                    repository.state.mergeChanges.some(c => c.uri.toString() === resourceUri.toString());

                if (isInGitState) {
                    // File is in Git's working tree/index/merge state
                    // Use Git extension's openChange command - it handles working tree deletions
                    await vscode.commands.executeCommand('git.openChange', resourceUri);
                } else {
                    // File was deleted between ref and HEAD (committed deletion, not in working tree)
                    // Just open the file content from ref (no "(deleted)" indication, but it's read-only)
                    const ref = existsInRef ? await getCurrentRef(context, repository) : 'HEAD';
                    const gitUri = gitAPI.toGitUri(resourceUri, ref);
                    await vscode.commands.executeCommand('vscode.open', gitUri);
                }
                return;
            }
        }
    } else {
        await vscode.commands.executeCommand('vscode.open', resourceUri);
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
        if (directoryNode.resourceUri.path.startsWith(repository.rootUri.path)) {
            // Get all files in this directory from the tree data provider
            if (!currentMultiRepoProvider) {
                return;
            }

            // Get children of this directory (recursive to get all files)
            const getFilesRecursive = async (node: any): Promise<ChangedFile[]> => {
                const children = await currentMultiRepoProvider!.getChildren(node);
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

async function openAllChangesCommand(context: vscode.ExtensionContext, repoNode?: RepositoryNode) {
    if (!gitAPI || !currentMultiRepoProvider) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // If invoked from a RepositoryNode, only show that repo's changes
    if (repoNode instanceof RepositoryNode) {
        const children = await currentMultiRepoProvider.getChildren(repoNode);
        const getFilesRecursive = async (node: any): Promise<ChangedFile[]> => {
            if (node instanceof ChangedFile) {
                return [node];
            } else if (node instanceof DirectoryNode) {
                const childItems = await currentMultiRepoProvider!.getChildren(node);
                const files: ChangedFile[] = [];
                for (const child of childItems) {
                    files.push(...await getFilesRecursive(child));
                }
                return files;
            }
            return [];
        };

        const allFiles: ChangedFile[] = [];
        for (const item of children) {
            allFiles.push(...await getFilesRecursive(item));
        }

        const ref = await getCurrentRef(context, repoNode.repository);
        const changes = buildChangesArray(allFiles, gitAPI, ref);
        if (changes.length > 0) {
            const repoName = path.basename(repoNode.repository.rootUri.fsPath);
            await vscode.commands.executeCommand('vscode.changes', `${repoName}: ${ref} ↔ Working Tree`, changes);
        }
        return;
    }

    // Collect changes from all repos
    const allChanges: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined][] = [];
    const titleParts: string[] = [];

    for (const repo of currentMultiRepoProvider.repositories) {
        const node = currentMultiRepoProvider.getNodeForRepo(repo);
        if (!node) {
            continue;
        }

        const children = await currentMultiRepoProvider.getChildren(node);
        const getFilesRecursive = async (item: any): Promise<ChangedFile[]> => {
            if (item instanceof ChangedFile) {
                return [item];
            } else if (item instanceof DirectoryNode) {
                const childItems = await currentMultiRepoProvider!.getChildren(item);
                const files: ChangedFile[] = [];
                for (const child of childItems) {
                    files.push(...await getFilesRecursive(child));
                }
                return files;
            }
            return [];
        };

        const files: ChangedFile[] = [];
        for (const child of children) {
            files.push(...await getFilesRecursive(child));
        }

        if (files.length > 0) {
            const ref = await getCurrentRef(context, repo);
            const changes = buildChangesArray(files, gitAPI, ref);
            allChanges.push(...changes);

            if (currentMultiRepoProvider.size > 1) {
                titleParts.push(`${path.basename(repo.rootUri.fsPath)}: ${ref}`);
            } else {
                titleParts.push(ref);
            }
        }
    }

    if (allChanges.length > 0) {
        const title = titleParts.length === 1
            ? `${titleParts[0]} ↔ Working Tree`
            : `${titleParts.join(', ')} ↔ Working Tree`;
        await vscode.commands.executeCommand('vscode.changes', title, allChanges);
    }
}

async function restoreFileCommand(context: vscode.ExtensionContext, fileItem: ChangedFile) {
    if (!gitAPI) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    // Find the repository for this URI
    for (const repository of gitAPI.repositories) {
        if (fileItem.resourceUri.path.startsWith(repository.rootUri.path)) {
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
                        // For renamed files: delete new file, restore old file at original location
                        await vscode.workspace.fs.delete(fileItem.resourceUri);

                        // Get raw bytes from git without encoding interpretation
                        const originalRelativePath = path.posix.relative(repository.rootUri.path, fileItem.originalUri.path);
                        try {
                            const { stdout } = await execFile('git', ['show', `${ref}:${originalRelativePath}`], {
                                cwd: repository.rootUri.fsPath,
                                encoding: 'buffer',
                                maxBuffer: 100 * 1024 * 1024 // 100MB
                            });
                            await vscode.workspace.fs.writeFile(fileItem.originalUri, stdout as Buffer);
                        } catch (error) {
                            // Fallback to repository.show() if git command fails
                            const content = await repository.show(ref, originalRelativePath);
                            await vscode.workspace.fs.writeFile(fileItem.originalUri, Buffer.from(content, 'binary'));
                        }
                    } else {
                        // For modified/deleted files, restore content from ref
                        const isDeleted = fileItem.status === ExtendedStatus.INDEX_DELETED ||
                            fileItem.status === ExtendedStatus.DELETED ||
                            fileItem.status === ExtendedStatus.DELETED_BY_THEM ||
                            fileItem.status === ExtendedStatus.DELETED_BY_US;

                        if (isDeleted) {
                            // File is deleted - create it with content from ref
                            const relativePath = path.posix.relative(repository.rootUri.path, fileItem.resourceUri.path);
                            try {
                                const { stdout } = await execFile('git', ['show', `${ref}:${relativePath}`], {
                                    cwd: repository.rootUri.fsPath,
                                    encoding: 'buffer',
                                    maxBuffer: 100 * 1024 * 1024 // 100MB
                                });
                                await vscode.workspace.fs.writeFile(fileItem.resourceUri, stdout as Buffer);
                            } catch (error) {
                                // Fallback to repository.show() if git command fails
                                const content = await repository.show(ref, relativePath);
                                await vscode.workspace.fs.writeFile(fileItem.resourceUri, Buffer.from(content, 'binary'));
                            }
                        } else {
                            // File exists - modify it using WorkspaceEdit to preserve detected encoding
                            const contentUri = fileItem.resourceUri.with({
                                scheme: QUICKDIFF_SCHEME,
                                query: JSON.stringify({ uri: fileItem.resourceUri.toString(), ref })
                            });
                            const doc = await vscode.workspace.openTextDocument(contentUri);
                            const content = doc.getText();

                            // Replace entire file content using WorkspaceEdit (preserves encoding)
                            const existingDoc = await vscode.workspace.openTextDocument(fileItem.resourceUri);
                            const edit = new vscode.WorkspaceEdit();
                            const fullRange = new vscode.Range(
                                existingDoc.positionAt(0),
                                existingDoc.positionAt(existingDoc.getText().length)
                            );
                            edit.replace(fileItem.resourceUri, fullRange, content);
                            await vscode.workspace.applyEdit(edit);

                            // Save the document to persist changes
                            await existingDoc.save();
                        }
                    }

                    // Refresh the tree view
                    if (currentMultiRepoProvider) {
                        currentMultiRepoProvider.refresh();
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
        if (directoryNode.resourceUri.path.startsWith(repository.rootUri.path)) {
            // Get all files in this directory from the tree data provider
            if (!currentMultiRepoProvider) {
                return;
            }

            // Get children of this directory (recursive to get all files)
            const getFilesRecursive = async (node: any): Promise<ChangedFile[]> => {
                const children = await currentMultiRepoProvider!.getChildren(node);
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
                            // For renamed files: delete new file, restore old file at original location
                            await vscode.workspace.fs.delete(file.resourceUri);

                            // Get raw bytes from git without encoding interpretation
                            const originalRelativePath = path.posix.relative(repository.rootUri.path, file.originalUri.path);
                            try {
                                const { stdout } = await execFile('git', ['show', `${ref}:${originalRelativePath}`], {
                                    cwd: repository.rootUri.fsPath,
                                    encoding: 'buffer',
                                    maxBuffer: 100 * 1024 * 1024 // 100MB
                                });
                                await vscode.workspace.fs.writeFile(file.originalUri, stdout as Buffer);
                            } catch (error) {
                                // Fallback to repository.show() if git command fails
                                const content = await repository.show(ref, originalRelativePath);
                                await vscode.workspace.fs.writeFile(file.originalUri, Buffer.from(content, 'binary'));
                            }
                        } else {
                            // For modified/deleted files, restore content from ref
                            const isDeleted = file.status === ExtendedStatus.INDEX_DELETED ||
                                file.status === ExtendedStatus.DELETED ||
                                file.status === ExtendedStatus.DELETED_BY_THEM ||
                                file.status === ExtendedStatus.DELETED_BY_US;

                            if (isDeleted) {
                                // File is deleted - create it with content from ref
                                const relativePath = path.posix.relative(repository.rootUri.path, file.resourceUri.path);
                                try {
                                    const { stdout } = await execFile('git', ['show', `${ref}:${relativePath}`], {
                                        cwd: repository.rootUri.fsPath,
                                        encoding: 'buffer',
                                        maxBuffer: 100 * 1024 * 1024 // 100MB
                                    });
                                    await vscode.workspace.fs.writeFile(file.resourceUri, stdout as Buffer);
                                } catch (error) {
                                    // Fallback to repository.show() if git command fails
                                    const content = await repository.show(ref, relativePath);
                                    await vscode.workspace.fs.writeFile(file.resourceUri, Buffer.from(content, 'binary'));
                                }
                            } else {
                                // File exists - modify it using WorkspaceEdit to preserve detected encoding
                                const contentUri = file.resourceUri.with({
                                    scheme: QUICKDIFF_SCHEME,
                                    query: JSON.stringify({ uri: file.resourceUri.toString(), ref })
                                });
                                const doc = await vscode.workspace.openTextDocument(contentUri);
                                const content = doc.getText();

                                // Replace entire file content using WorkspaceEdit (preserves encoding)
                                const existingDoc = await vscode.workspace.openTextDocument(file.resourceUri);
                                const edit = new vscode.WorkspaceEdit();
                                const fullRange = new vscode.Range(
                                    existingDoc.positionAt(0),
                                    existingDoc.positionAt(existingDoc.getText().length)
                                );
                                edit.replace(file.resourceUri, fullRange, content);
                                await vscode.workspace.applyEdit(edit);

                                // Save the document to persist changes
                                await existingDoc.save();
                            }
                        }

                        successCount++;
                    } catch (error) {
                        console.error(`Failed to restore ${file.resourceUri.fsPath}:`, error);
                        failCount++;
                    }
                }

                // Refresh the tree view
                if (currentMultiRepoProvider) {
                    currentMultiRepoProvider.refresh();
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
    if (currentMultiRepoProvider) {
        currentMultiRepoProvider.setDisplayMode('list');
    }
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'list');
}

async function setTreeMode(context: vscode.ExtensionContext) {
    // Save to global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DISPLAY_MODE, 'tree');

    // Update tree data provider
    if (currentMultiRepoProvider) {
        currentMultiRepoProvider.setDisplayMode('tree');
    }
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.displayMode', 'tree');
}

async function setDefaultActionOpenFile(context: vscode.ExtensionContext) {
    // Save to global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, 'openFile');

    // Update context
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', 'openFile');

    // Refresh tree data provider
    if (currentMultiRepoProvider) {
        currentMultiRepoProvider.refresh();
    }
}

async function setDefaultActionOpenChanges(context: vscode.ExtensionContext) {
    // Save to global workspace state
    await context.workspaceState.update(WORKSPACE_STATE_KEY_DEFAULT_ACTION, 'openChanges');

    // Update context
    vscode.commands.executeCommand('setContext', 'gitbranchquickdiff.defaultAction', 'openChanges');

    // Refresh tree data provider
    if (currentMultiRepoProvider) {
        currentMultiRepoProvider.refresh();
    }
}
