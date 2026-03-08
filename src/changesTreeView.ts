import * as vscode from 'vscode';
import * as path from 'path';
import * as vscodeVariables from './vscode-variables';
import { Repository, Status, API } from './git';
import { l10n } from './l10n';

// Extended Status enum with RESTORED status
export enum ExtendedStatus {
    INDEX_MODIFIED,
    INDEX_ADDED,
    INDEX_DELETED,
    INDEX_RENAMED,
    INDEX_COPIED,

    MODIFIED,
    DELETED,
    UNTRACKED,
    IGNORED,
    INTENT_TO_ADD,
    INTENT_TO_RENAME,
    TYPE_CHANGED,

    ADDED_BY_US,
    ADDED_BY_THEM,
    DELETED_BY_US,
    DELETED_BY_THEM,
    BOTH_ADDED,
    BOTH_DELETED,
    BOTH_MODIFIED,

    RESTORED
}

// Convert git.Status to ExtendedStatus
function toExtendedStatus(status: Status): ExtendedStatus {
    return status as unknown as ExtendedStatus;
}

// Display mode for the changes tree view
export enum DisplayMode {
    List = 'list',
    Tree = 'tree'
}

// Superscript plus badge suffix for diff changes
const DIFF_BADGE_SUFFIX = '⁺';

// Shared utility functions for status handling
function getStatusText(status: ExtendedStatus): string {
    switch (status) {
        case ExtendedStatus.INDEX_MODIFIED:
        case ExtendedStatus.MODIFIED:
            return 'M';
        case ExtendedStatus.INDEX_ADDED:
        case ExtendedStatus.INTENT_TO_ADD:
            return 'A';
        case ExtendedStatus.INDEX_DELETED:
        case ExtendedStatus.DELETED:
        case ExtendedStatus.DELETED_BY_THEM:
        case ExtendedStatus.DELETED_BY_US:
            return 'D';
        case ExtendedStatus.INDEX_RENAMED:
        case ExtendedStatus.INTENT_TO_RENAME:
            return 'R';
        case ExtendedStatus.INDEX_COPIED:
            return 'C';
        case ExtendedStatus.TYPE_CHANGED:
            return 'T';
        case ExtendedStatus.UNTRACKED:
            return 'U';
        case ExtendedStatus.IGNORED:
            return 'I';
        case ExtendedStatus.ADDED_BY_US:
            return 'A';
        case ExtendedStatus.ADDED_BY_THEM:
            return 'A';
        case ExtendedStatus.BOTH_ADDED:
            return 'A';
        case ExtendedStatus.BOTH_DELETED:
            return 'D';
        case ExtendedStatus.BOTH_MODIFIED:
            return 'M';
        case ExtendedStatus.RESTORED:
            return 'O';
        default:
            return '?';
    }
}

function getStatusColor(status: ExtendedStatus): vscode.ThemeColor {
    switch (status) {
        case ExtendedStatus.INDEX_MODIFIED:
        case ExtendedStatus.MODIFIED:
        case ExtendedStatus.TYPE_CHANGED:
        case ExtendedStatus.INTENT_TO_RENAME:
        case ExtendedStatus.BOTH_MODIFIED:
            return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
        case ExtendedStatus.RESTORED:
            return new vscode.ThemeColor('diffEditor.unchangedRegionForeground');
        case ExtendedStatus.INDEX_ADDED:
        case ExtendedStatus.INTENT_TO_ADD:
        case ExtendedStatus.ADDED_BY_US:
        case ExtendedStatus.ADDED_BY_THEM:
        case ExtendedStatus.BOTH_ADDED:
            return new vscode.ThemeColor('gitDecoration.addedResourceForeground');
        case ExtendedStatus.INDEX_DELETED:
        case ExtendedStatus.DELETED:
        case ExtendedStatus.DELETED_BY_THEM:
        case ExtendedStatus.DELETED_BY_US:
        case ExtendedStatus.BOTH_DELETED:
            return new vscode.ThemeColor('gitDecoration.deletedResourceForeground');
        case ExtendedStatus.INDEX_RENAMED:
        case ExtendedStatus.INDEX_COPIED:
            return new vscode.ThemeColor('gitDecoration.renamedResourceForeground');
        case ExtendedStatus.UNTRACKED:
            return new vscode.ThemeColor('gitDecoration.untrackedResourceForeground');
        case ExtendedStatus.IGNORED:
            return new vscode.ThemeColor('gitDecoration.ignoredResourceForeground');
        default:
            return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
    }
}

function getStatusTooltip(status: ExtendedStatus): string {
    let tooltip: string;
    switch (status) {
        case ExtendedStatus.INDEX_MODIFIED:
        case ExtendedStatus.MODIFIED:
            tooltip = l10n('status.modified');
            break;
        case ExtendedStatus.INDEX_ADDED:
        case ExtendedStatus.INTENT_TO_ADD:
            tooltip = l10n('status.added');
            break;
        case ExtendedStatus.INDEX_DELETED:
        case ExtendedStatus.DELETED:
        case ExtendedStatus.DELETED_BY_THEM:
        case ExtendedStatus.DELETED_BY_US:
            tooltip = l10n('status.deleted');
            break;
        case ExtendedStatus.INDEX_RENAMED:
        case ExtendedStatus.INTENT_TO_RENAME:
            tooltip = l10n('status.renamed');
            break;
        case ExtendedStatus.INDEX_COPIED:
            tooltip = l10n('status.copied');
            break;
        case ExtendedStatus.TYPE_CHANGED:
            tooltip = l10n('status.typeChanged');
            break;
        case ExtendedStatus.UNTRACKED:
            tooltip = l10n('status.untracked');
            break;
        case ExtendedStatus.IGNORED:
            tooltip = l10n('status.ignored');
            break;
        case ExtendedStatus.ADDED_BY_US:
            tooltip = l10n('status.addedByUs');
            break;
        case ExtendedStatus.ADDED_BY_THEM:
            tooltip = l10n('status.addedByThem');
            break;
        case ExtendedStatus.BOTH_ADDED:
            tooltip = l10n('status.bothAdded');
            break;
        case ExtendedStatus.BOTH_DELETED:
            tooltip = l10n('status.bothDeleted');
            break;
        case ExtendedStatus.BOTH_MODIFIED:
            tooltip = l10n('status.bothModified');
            break;
        case ExtendedStatus.RESTORED:
            tooltip = l10n('status.restored');
            break;
        default:
            tooltip = l10n('status.unknown');
            break;
    }
    return `${tooltip}${DIFF_BADGE_SUFFIX}`;
}

// Message item for displaying info in the tree view
export class MessageItem extends vscode.TreeItem {
    constructor(message: string, command?: vscode.Command) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'message';
        this.command = command;
    }
}

export class RepositoryNode extends vscode.TreeItem {
    public readonly provider: ChangesTreeDataProvider;
    public readonly repository: Repository;
    private _isSubmodule: boolean;

    constructor(
        repository: Repository,
        provider: ChangesTreeDataProvider,
        ref: string,
        isSubmodule: boolean = false
    ) {
        super(path.basename(repository.rootUri.fsPath), vscode.TreeItemCollapsibleState.Collapsed);
        this.repository = repository;
        this.provider = provider;
        this._isSubmodule = isSubmodule;
        this.description = ref;
        this.iconPath = new vscode.ThemeIcon(isSubmodule ? 'repo-submodule' : 'repo');
        this.contextValue = 'repository';
        this.resourceUri = repository.rootUri;
    }

    get isSubmodule(): boolean {
        return this._isSubmodule;
    }

    set isSubmodule(value: boolean) {
        this._isSubmodule = value;
        this.iconPath = new vscode.ThemeIcon(value ? 'repo-submodule' : 'repo');
    }

    updateDescription(ref: string): void {
        this.description = ref;
    }
}

export class ChangesTreeDataProvider implements vscode.TreeDataProvider<ChangedFile | DirectoryNode | MessageItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ChangedFile | DirectoryNode | MessageItem | undefined | null | void> = new vscode.EventEmitter<ChangedFile | DirectoryNode | MessageItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChangedFile | DirectoryNode | MessageItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _decorationProvider: ChangesDecorationProvider;
    private _displayMode: DisplayMode = DisplayMode.List;
    private _currentDirectoryNodes: DirectoryNode[] = [];

    // Performance: Separate caches for different git operations
    // Cache for diffBetween(ref, 'HEAD') - invalidated only when ref or HEAD changes
    private _cachedDiffBetween: {
        changes: any[];
        ref: string;
        headCommit: string;
    } | undefined;

    // Cache for diffWith(ref) - invalidated when ref or working tree changes
    private _cachedDiffWith: {
        changes: any[];
        ref: string;
        indexCount: number;
        workingTreeCount: number;
        mergeCount: number;
    } | undefined;

    // Performance: Debounce rapid refreshes
    private _refreshTimeout: NodeJS.Timeout | undefined;

    constructor(
        private repository: Repository,
        private getRef: () => Promise<string>,
        private getDefaultAction: () => string,
        private getEnabled: () => boolean
    ) {
        this._decorationProvider = new ChangesDecorationProvider();
    }

    get displayMode(): DisplayMode {
        return this._displayMode;
    }

    setDisplayMode(mode: 'list' | 'tree'): void {
        this._displayMode = mode === 'list' ? DisplayMode.List : DisplayMode.Tree;
        this.refresh();
    }

    get decorationProvider(): ChangesDecorationProvider {
        return this._decorationProvider;
    }

    refresh(): void {
        // Performance: Debounce rapid refreshes (e.g., from multiple file changes)
        if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
        }

        this._refreshTimeout = setTimeout(() => {
            // Performance: Clear caches on explicit refresh
            this._cachedDiffBetween = undefined;
            this._cachedDiffWith = undefined;
            this._onDidChangeTreeData.fire();
            this._refreshTimeout = undefined;
        }, 100); // 100ms debounce
    }

    getTreeItem(element: ChangedFile | DirectoryNode | MessageItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ChangedFile | DirectoryNode | MessageItem): Promise<(ChangedFile | DirectoryNode | MessageItem)[]> {
        // MessageItems and ChangedFiles have no children
        if (element instanceof ChangedFile || element instanceof MessageItem) {
            return [];
        }

        // Check if the extension is enabled
        const isEnabled = this.getEnabled();
        if (!isEnabled) {
            // Clear all decorations when disabled
            this._decorationProvider.setChanges([]);
            return [new MessageItem(l10n('message.quickDiffDeactivated'), {
                command: 'gitbranchquickdiff.activate',
                title: l10n('command.activate')
            })];
        }

        const ref = await this.getRef();
        if (!ref) {
            return [];
        }

        try {
            // Performance: Smart caching with separate invalidation strategies
            const currentHeadCommit = this.repository.state.HEAD?.commit;
            const currentIndexCount = this.repository.state.indexChanges.length;
            const currentWorkingTreeCount = this.repository.state.workingTreeChanges.length;
            const currentMergeCount = this.repository.state.mergeChanges.length;

            // Check diffBetween cache - only invalidate when ref or HEAD changes
            let diffChanges: any[];
            const diffBetweenCacheValid = this._cachedDiffBetween !== undefined &&
                this._cachedDiffBetween.ref === ref &&
                this._cachedDiffBetween.headCommit === currentHeadCommit;

            if (diffBetweenCacheValid) {
                diffChanges = this._cachedDiffBetween!.changes;
            } else {
                // Get changes between ref and HEAD (committed differences)
                diffChanges = await this.repository.diffBetween(ref, 'HEAD');
                this._cachedDiffBetween = {
                    changes: diffChanges,
                    ref: ref,
                    headCommit: currentHeadCommit ?? ''
                };
            }

            // Check diffWith cache - invalidate when ref or working tree state changes
            let diffWithWorkingTree: any[];
            const diffWithCacheValid = this._cachedDiffWith !== undefined &&
                this._cachedDiffWith.ref === ref &&
                this._cachedDiffWith.indexCount === currentIndexCount &&
                this._cachedDiffWith.workingTreeCount === currentWorkingTreeCount &&
                this._cachedDiffWith.mergeCount === currentMergeCount;

            if (diffWithCacheValid) {
                diffWithWorkingTree = this._cachedDiffWith!.changes;
            } else {
                // Get changes between ref and working tree (to detect restored files)
                diffWithWorkingTree = await this.repository.diffWith(ref);
                this._cachedDiffWith = {
                    changes: diffWithWorkingTree,
                    ref: ref,
                    indexCount: currentIndexCount,
                    workingTreeCount: currentWorkingTreeCount,
                    mergeCount: currentMergeCount
                };
            }

            // Get all working tree changes (staged, unstaged, and untracked)
            const indexChanges = this.repository.state.indexChanges;
            const workingTreeChanges = this.repository.state.workingTreeChanges;
            const mergeChanges = this.repository.state.mergeChanges;

            // Performance: Track which files are in diff - build sets efficiently
            const diffChangeUris = new Set<string>(diffChanges.map(c => c.uri.toString()));
            const diffWithWorkingTreeUris = new Set<string>(diffWithWorkingTree.map(c => c.uri.toString()));

            // Track files that were added after ref (don't exist in ref)
            const addedAfterRefUris = new Set<string>();
            for (const change of diffChanges) {
                if (change.status === Status.INDEX_ADDED ||
                    change.status === Status.INTENT_TO_ADD) {
                    addedAfterRefUris.add(change.uri.toString());
                }
            }

            // Track all git statuses separately (staged, unstaged, merge)
            const indexStatusMap = new Map<string, Status>();
            const workingTreeStatusMap = new Map<string, Status>();
            const mergeStatusMap = new Map<string, Status>();

            for (const change of indexChanges) {
                indexStatusMap.set(change.uri.toString(), change.status);
            }
            for (const change of workingTreeChanges) {
                workingTreeStatusMap.set(change.uri.toString(), change.status);
            }
            for (const change of mergeChanges) {
                mergeStatusMap.set(change.uri.toString(), change.status);
            }

            // Combine all changes and deduplicate by URI
            const allChangesMap = new Map<string, { uri: vscode.Uri; originalUri: vscode.Uri; status: ExtendedStatus; indexStatus?: Status; workingTreeStatus?: Status; mergeStatus?: Status }>();

            // Add diff changes (between ref and HEAD) - check for restored files
            for (const change of diffChanges) {
                // Check if file exists on disk
                let fileExists = true;
                try {
                    await vscode.workspace.fs.stat(change.uri);
                } catch {
                    fileExists = false;
                }

                // Check if file was added after ref (doesn't exist in ref)
                const wasAddedAfterRef = change.status === Status.INDEX_ADDED || change.status === Status.INTENT_TO_ADD;

                // If file doesn't exist and is in worktree changes
                if (!fileExists && workingTreeStatusMap.has(change.uri.toString())) {
                    if (wasAddedAfterRef) {
                        // File was added after ref, then deleted in worktree
                        // This restores the state to match ref (not existing)
                        // Keep it in diff as RESTORED
                        allChangesMap.set(change.uri.toString(), {
                            uri: change.uri,
                            originalUri: change.originalUri,
                            status: ExtendedStatus.RESTORED,
                            indexStatus: indexStatusMap.get(change.uri.toString()),
                            workingTreeStatus: workingTreeStatusMap.get(change.uri.toString()),
                            mergeStatus: mergeStatusMap.get(change.uri.toString())
                        });
                        continue;
                    } else {
                        // File was in ref, modified in commits, deleted in worktree
                        // Skip here, will be added from workingTreeChanges (without diff badge)
                        diffChangeUris.delete(change.uri.toString());
                        continue;
                    }
                }

                // Determine status
                let status: ExtendedStatus;
                if (!fileExists) {
                    // File doesn't exist in worktree and not in workingTreeChanges
                    // This means it was deleted in a commit between ref and HEAD
                    status = ExtendedStatus.DELETED;
                } else if (!diffWithWorkingTreeUris.has(change.uri.toString()) &&
                    change.status !== Status.INDEX_ADDED &&
                    change.status !== Status.INTENT_TO_ADD) {
                    // File is different between ref and HEAD, but working tree matches ref
                    // This means the file was restored to the ref state
                    status = ExtendedStatus.RESTORED;
                } else {
                    status = toExtendedStatus(change.status);
                }

                allChangesMap.set(change.uri.toString(), {
                    uri: change.uri,
                    originalUri: change.originalUri,
                    status: status,
                    indexStatus: indexStatusMap.get(change.uri.toString()),
                    workingTreeStatus: workingTreeStatusMap.get(change.uri.toString()),
                    mergeStatus: mergeStatusMap.get(change.uri.toString())
                });
            }

            // Add index changes (staged) - check for restored files
            for (const change of indexChanges) {
                if (!allChangesMap.has(change.uri.toString())) {
                    // Check if file exists on disk
                    let fileExists = true;
                    try {
                        await vscode.workspace.fs.stat(change.uri);
                    } catch {
                        fileExists = false;
                    }

                    // If file doesn't exist and is in worktree changes, skip it here
                    // It will be added from workingTreeChanges instead (without the diff badge)
                    if (!fileExists && workingTreeStatusMap.has(change.uri.toString())) {
                        // Remove from diffChangeUris so it won't be marked as isInDiff
                        diffChangeUris.delete(change.uri.toString());
                        continue;
                    }

                    // Determine status
                    let status: ExtendedStatus;
                    if (!fileExists) {
                        // File doesn't exist in worktree and not in workingTreeChanges
                        // This means it was deleted/staged for deletion
                        status = ExtendedStatus.DELETED;
                    } else if (!diffWithWorkingTreeUris.has(change.uri.toString()) &&
                        change.status !== Status.INDEX_ADDED &&
                        change.status !== Status.INTENT_TO_ADD) {
                        // File is in index but not in diff between ref and working tree, and it's not a new file
                        // This means the working tree content matches the ref state (restored)
                        status = ExtendedStatus.RESTORED;
                    } else {
                        status = toExtendedStatus(change.status);
                    }

                    allChangesMap.set(change.uri.toString(), {
                        uri: change.uri,
                        originalUri: change.originalUri,
                        status: status,
                        indexStatus: change.status,
                        workingTreeStatus: workingTreeStatusMap.get(change.uri.toString()),
                        mergeStatus: mergeStatusMap.get(change.uri.toString())
                    });
                }
            }

            // Add working tree changes (unstaged)
            for (const change of workingTreeChanges) {
                if (!allChangesMap.has(change.uri.toString())) {
                    // Check if this is a "restored" file - in working tree but equal to ref
                    let status: ExtendedStatus;
                    if (!diffWithWorkingTreeUris.has(change.uri.toString()) &&
                        change.status !== Status.INDEX_ADDED &&
                        change.status !== Status.INTENT_TO_ADD &&
                        change.status !== Status.UNTRACKED) {
                        // File is in working tree but not in diff between ref and working tree, and it's not a new file
                        // This means the working tree content matches the ref state (restored)
                        status = ExtendedStatus.RESTORED;
                    } else {
                        status = toExtendedStatus(change.status);
                    }

                    allChangesMap.set(change.uri.toString(), {
                        uri: change.uri,
                        originalUri: change.originalUri,
                        status: status,
                        indexStatus: indexStatusMap.get(change.uri.toString()),
                        workingTreeStatus: change.status,
                        mergeStatus: mergeStatusMap.get(change.uri.toString())
                    });
                }
            }

            // Add merge changes
            for (const change of mergeChanges) {
                if (!allChangesMap.has(change.uri.toString())) {
                    // Check if file exists on disk
                    let fileExists = true;
                    try {
                        await vscode.workspace.fs.stat(change.uri);
                    } catch {
                        fileExists = false;
                    }

                    // Determine status
                    let status: ExtendedStatus;
                    if (!fileExists) {
                        // File doesn't exist in worktree - treat as deleted regardless of merge status
                        status = ExtendedStatus.DELETED;
                    } else if (!diffWithWorkingTreeUris.has(change.uri.toString()) &&
                        change.status !== Status.ADDED_BY_US &&
                        change.status !== Status.ADDED_BY_THEM &&
                        change.status !== Status.BOTH_ADDED) {
                        // File is in merge changes but not in diff between ref and working tree, and it's not a new file
                        // This means the working tree content matches the ref state (restored)
                        status = ExtendedStatus.RESTORED;
                    } else {
                        status = toExtendedStatus(change.status);
                    }

                    allChangesMap.set(change.uri.toString(), {
                        uri: change.uri,
                        originalUri: change.originalUri,
                        status: status,
                        indexStatus: indexStatusMap.get(change.uri.toString()),
                        workingTreeStatus: workingTreeStatusMap.get(change.uri.toString()),
                        mergeStatus: change.status
                    });
                }
            }

            const allChanges = Array.from(allChangesMap.values());

            // Create ChangedFile objects for all changes
            const changedFiles = allChanges.map(change => {
                const uri = change.uri;
                const relativePath = path.relative(this.repository.rootUri.fsPath, uri.fsPath);
                const fileName = path.basename(uri.fsPath);
                const dirName = path.dirname(relativePath);

                const statusText = getStatusText(change.status);

                // Build combined git status text from all available statuses
                const gitStatuses: string[] = [];
                if (change.indexStatus !== undefined) {
                    gitStatuses.push(getStatusText(toExtendedStatus(change.indexStatus)));
                }
                if (change.workingTreeStatus !== undefined) {
                    gitStatuses.push(getStatusText(toExtendedStatus(change.workingTreeStatus)));
                }
                if (change.mergeStatus !== undefined) {
                    gitStatuses.push(getStatusText(toExtendedStatus(change.mergeStatus)));
                }
                const gitStatusText = gitStatuses.length > 0 ? gitStatuses.join(', ') : undefined;

                // For color, prioritize in order: RESTORED > Deleted > Added (from diff) > git status (index/workingTree/merge) > ref status
                let colorStatus: ExtendedStatus;
                if (change.status == ExtendedStatus.RESTORED) {
                    // RESTORED takes highest priority (white/gray color)
                    colorStatus = ExtendedStatus.RESTORED;
                } else if (change.status === ExtendedStatus.DELETED ||
                    change.status === ExtendedStatus.INDEX_DELETED ||
                    change.status === ExtendedStatus.DELETED_BY_THEM ||
                    change.status === ExtendedStatus.DELETED_BY_US) {
                    // Deletion takes second priority
                    colorStatus = change.status;
                } else if (addedAfterRefUris.has(change.uri.toString())) {
                    // Added after ref takes third priority (doesn't exist in ref)
                    // Use INDEX_ADDED color (green) for these files
                    colorStatus = ExtendedStatus.INDEX_ADDED;
                } else if (change.indexStatus !== undefined) {
                    colorStatus = toExtendedStatus(change.indexStatus);
                } else if (change.workingTreeStatus !== undefined) {
                    colorStatus = toExtendedStatus(change.workingTreeStatus);
                } else if (change.mergeStatus !== undefined) {
                    colorStatus = toExtendedStatus(change.mergeStatus);
                } else {
                    colorStatus = change.status;
                }
                const color = getStatusColor(colorStatus);

                const isInDiff = diffChangeUris.has(change.uri.toString());

                // Check if file doesn't exist in ref (was added after ref)
                const existsInRef = !addedAfterRefUris.has(change.uri.toString());

                return new ChangedFile(
                    fileName,
                    dirName !== '.' ? dirName : '',
                    uri,
                    change.originalUri,
                    statusText,
                    gitStatusText,
                    '',
                    color,
                    change.status,
                    isInDiff,
                    existsInRef,
                    this._displayMode,
                    this.getDefaultAction()
                );
            });

            // Update the decoration provider with only diff changes (not working tree only)
            // Use the colors already calculated in the ChangedFile objects
            this._decorationProvider.setChanges(
                changedFiles
                    .filter(f => f.isInDiff)
                    .map(f => ({
                        uri: f.resourceUri,
                        status: f.status,
                        statusText: f.statusText,
                        color: f.color!
                    }))
            );

            // Return based on display mode
            if (this._displayMode === DisplayMode.List) {
                this._currentDirectoryNodes = [];
                // Sort by full path in list mode, with root files first
                changedFiles.sort((a, b) => {
                    // Root files (no directory) come before files in directories
                    if (!a.directory && b.directory) {
                        return -1;
                    }
                    if (a.directory && !b.directory) {
                        return 1;
                    }
                    // Both are root files or both are in directories - sort by full path
                    const pathA = a.directory ? `${a.directory}${path.sep}${a.fileName}` : a.fileName;
                    const pathB = b.directory ? `${b.directory}${path.sep}${b.fileName}` : b.fileName;
                    return pathA.localeCompare(pathB);
                });
                return changedFiles;
            } else {
                // Tree mode: build directory structure
                const treeNodes = this.buildTree(changedFiles, element);
                // Store top-level directory nodes
                if (!element) {
                    this._currentDirectoryNodes = treeNodes.filter(node => node instanceof DirectoryNode) as DirectoryNode[];
                }
                return treeNodes;
            }
        } catch (error) {
            console.error('Failed to get changes:', error);
            // Show message that ref was not found
            this._decorationProvider.setChanges([]);
            return [new MessageItem(l10n('message.refNotFound', ref), {
                command: 'gitbranchquickdiff.changeref',
                title: l10n('command.changeRef')
            })];
        }
    }

    private buildTree(files: ChangedFile[], parentNode?: DirectoryNode): (DirectoryNode | ChangedFile)[] {
        const parentPath = parentNode?.fullPath ?? '';
        const directoryMap = new Map<string, ChangedFile[]>();
        const rootFiles: ChangedFile[] = [];

        // Group files by their immediate parent directory relative to parentNode
        for (const file of files) {
            const relativePath = file.directory;

            // Skip files not in this parent directory
            if (parentPath) {
                if (!relativePath.startsWith(parentPath)) {
                    continue;
                }
            }

            // Get the remaining path after the parent
            const remainingPath = parentPath ? relativePath.substring(parentPath.length).replace(/^[\\\/]+/, '') : relativePath;

            if (!remainingPath) {
                // File is in the current directory
                rootFiles.push(file);
            } else {
                // File is in a subdirectory
                const parts = remainingPath.split(/[\\\/]/);
                const immediateDir = parts[0];
                const fullDirPath = parentPath ? `${parentPath}${path.sep}${immediateDir}` : immediateDir;

                if (!directoryMap.has(fullDirPath)) {
                    directoryMap.set(fullDirPath, []);
                }
                directoryMap.get(fullDirPath)!.push(file);
            }
        }

        // Check if explorer.compactFolders is enabled
        const compactFolders = vscode.workspace.getConfiguration('explorer').get<boolean>('compactFolders', true);

        // Create directory nodes
        const directoryNodes: DirectoryNode[] = [];
        for (const [fullPath, filesInDir] of directoryMap.entries()) {
            let displayPath = fullPath;
            let compactedFiles = filesInDir;

            // If compactFolders is enabled, check if we can compact this directory
            if (compactFolders) {
                let currentPath = fullPath;
                let currentFiles = filesInDir;

                // Keep compacting while the directory has no files at its level and only one subdirectory
                while (true) {
                    // Count subdirectories at this level
                    const subdirs = new Set<string>();
                    let filesAtThisLevel = 0;

                    for (const file of currentFiles) {
                        const relativePath = file.directory;
                        if (!relativePath.startsWith(currentPath)) {
                            continue;
                        }

                        const remainingPath = relativePath.substring(currentPath.length).replace(/^[\\\/]+/, '');
                        if (!remainingPath) {
                            // File is directly in this directory
                            filesAtThisLevel++;
                        } else {
                            // File is in a subdirectory
                            const parts = remainingPath.split(/[\\\/]/);
                            subdirs.add(parts[0]);
                        }
                    }

                    // Can only compact if no files at this level and exactly one subdirectory
                    if (filesAtThisLevel === 0 && subdirs.size === 1) {
                        const subdir = Array.from(subdirs)[0];
                        currentPath = `${currentPath}${path.sep}${subdir}`;
                        displayPath = currentPath;
                        // currentFiles stays the same - all files are still in subdirectories
                    } else {
                        break;
                    }
                }
            }

            const dirName = parentPath ? displayPath.substring(parentPath.length).replace(/^[\\\/]+/, '') : displayPath;
            directoryNodes.push(new DirectoryNode(dirName, displayPath, compactedFiles, this.repository));
        }

        // Sort directories alphabetically by label
        directoryNodes.sort((a, b) => a.label.localeCompare(b.label));

        // Sort files alphabetically by name
        rootFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));

        // Return directories first, then files (applies to both root and sub items)
        return [...directoryNodes, ...rootFiles];
    }
}

export class DirectoryNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fullPath: string,
        private readonly filesInDirectory: ChangedFile[],
        private readonly repository: Repository
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        this.contextValue = 'directory';
        this.iconPath = new vscode.ThemeIcon('folder');

        // Set resource URI for the directory
        this.resourceUri = vscode.Uri.file(path.join(repository.rootUri.fsPath, fullPath));

        // Count of changed files in this directory
        const fileCount = filesInDirectory.length;
        this.description = `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;

        this.tooltip = fullPath;
    }
}

interface ChangeInfo {
    uri: vscode.Uri;
    status: ExtendedStatus;
    statusText: string;
    color: vscode.ThemeColor;
}

export class ChangesDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    private changes = new Map<string, ChangeInfo>();

    setChanges(changes: ChangeInfo[]): void {
        console.log(`[ChangesDecorationProvider] setChanges called with ${changes.length} changes`);

        const newKeys = new Set<string>();
        const changedUris: vscode.Uri[] = [];

        // Update or add new changes
        for (const change of changes) {
            const key = change.uri.toString();
            newKeys.add(key);

            const existingChange = this.changes.get(key);
            const statusChanged = !existingChange ||
                existingChange.status !== change.status ||
                existingChange.statusText !== change.statusText;

            if (statusChanged) {
                this.changes.set(key, change);
                changedUris.push(change.uri);
                console.log(`[ChangesDecorationProvider] Updated change for ${key}: badge=${change.statusText}`);
            }
        }

        // Remove changes for files that are no longer changed
        const keysToRemove: string[] = [];
        for (const key of this.changes.keys()) {
            if (!newKeys.has(key)) {
                keysToRemove.push(key);
                changedUris.push(vscode.Uri.parse(key));
            }
        }

        for (const key of keysToRemove) {
            this.changes.delete(key);
            console.log(`[ChangesDecorationProvider] Removed change for ${key}`);
        }

        console.log(`[ChangesDecorationProvider] Total changes: ${this.changes.size}, changed: ${changedUris.length}`);

        // Only fire events for URIs that changed
        if (changedUris.length > 0) {
            this._onDidChangeFileDecorations.fire(changedUris);
        }
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const key = uri.toString();
        const change = this.changes.get(key);
        console.log(`[ChangesDecorationProvider] provideFileDecoration called for ${key}, found: ${change ? 'yes' : 'no'}`);

        if (!change) {
            return undefined;
        }

        // Return a new decoration object each time
        return {
            badge: `${change.statusText}${DIFF_BADGE_SUFFIX}`,
            color: change.color,
            tooltip: getStatusTooltip(change.status)
        };
    }
}

export class ChangedFile extends vscode.TreeItem {
    constructor(
        public readonly fileName: string,
        public readonly directory: string,
        public readonly resourceUri: vscode.Uri,
        public readonly originalUri: vscode.Uri,
        public readonly statusText: string,
        public readonly gitStatusText: string | undefined,
        public readonly statusIcon: string,
        public readonly color: vscode.ThemeColor | undefined,
        public readonly status: ExtendedStatus,
        public readonly isInDiff: boolean,
        public readonly existsInRef: boolean,
        displayMode: DisplayMode = DisplayMode.List,
        defaultAction: string = 'openChanges'
    ) {
        super(resourceUri, vscode.TreeItemCollapsibleState.None);

        this.label = fileName;
        this.tooltip = `${directory ? directory + path.sep : ''}${fileName}`;

        // Build status display
        let statusDisplay: string;
        if (isInDiff) {
            // File has changes in diff (ref vs HEAD)
            statusDisplay = `${statusText}${DIFF_BADGE_SUFFIX}`;
            if (gitStatusText) {
                statusDisplay += `, ${gitStatusText}`;
            }
        } else {
            // File only has worktree changes
            statusDisplay = statusText;
        }

        // Add status letter with bullet separator in description (appears on the right)
        // In tree mode, don't show directory since it's already visible in the tree structure
        if (displayMode === DisplayMode.List && directory) {
            this.description = `${directory} • ${statusDisplay}`;
        } else {
            this.description = `• ${statusDisplay}`;
        }

        // Add file icon with color
        this.iconPath = new vscode.ThemeIcon(
            'file',
            color
        );

        // Set default click command based on parameter
        // Pass minimal serializable data to avoid circular references
        if (defaultAction === 'openFile') {
            this.command = {
                command: 'gitbranchquickdiff.openFile',
                title: 'Open File',
                arguments: [{
                    resourceUri: this.resourceUri,
                    originalUri: this.originalUri,
                    status: this.status,
                    existsInRef: this.existsInRef
                }]
            };
        } else {
            this.command = {
                command: 'gitbranchquickdiff.openChange',
                title: 'Open Changes',
                arguments: [{
                    resourceUri: this.resourceUri,
                    originalUri: this.originalUri,
                    status: this.status,
                    existsInRef: this.existsInRef
                }]
            };
        }

        // Add context value for menu customization
        this.contextValue = `changedFile:${status}`;
    }
}

export async function openChange(git: API, repository: Repository, getRef: () => Promise<string>, uri: vscode.Uri, originalUri: vscode.Uri, status: ExtendedStatus, existsInRef: boolean = true) {
    const ref = await getRef();

    // Check if file exists on disk
    let fileExists = true;
    try {
        await vscode.workspace.fs.stat(uri);
    } catch {
        fileExists = false;
    }

    // Check if file is in Git's state (working tree, index, or merge)
    const isInGitState =
        repository.state.workingTreeChanges.some(c => c.uri.toString() === uri.toString()) ||
        repository.state.indexChanges.some(c => c.uri.toString() === uri.toString()) ||
        repository.state.mergeChanges.some(c => c.uri.toString() === uri.toString());

    if (status === ExtendedStatus.INDEX_DELETED || status === ExtendedStatus.DELETED || status === ExtendedStatus.DELETED_BY_THEM || status === ExtendedStatus.DELETED_BY_US) {
        if (isInGitState) {
            // File is in Git's working tree/index/merge state
            // Use Git extension's openChange command - it handles working tree deletions
            await vscode.commands.executeCommand('git.openChange', uri);
        } else {
            // File was deleted between ref and HEAD (committed deletion, not in working tree)
            // Just open the file content from ref (no "(deleted)" indication, but it's read-only)
            const sourceRef = existsInRef ? ref : 'HEAD';
            const gitUri = git.toGitUri(uri, sourceRef);
            await vscode.commands.executeCommand('vscode.open', gitUri);
        }
    } else if (status === ExtendedStatus.RESTORED && !fileExists && !existsInRef) {
        // File was added after ref, then deleted in worktree (restored to "not existing")
        // Use Git extension's openChange command like deleted files
        await vscode.commands.executeCommand('git.openChange', uri);
    } else if (status === ExtendedStatus.UNTRACKED || status === ExtendedStatus.INDEX_ADDED || status === ExtendedStatus.INTENT_TO_ADD) {
        // For untracked or newly added files, just open the file
        await vscode.commands.executeCommand('vscode.open', uri);
    } else if (status === ExtendedStatus.INDEX_RENAMED) {
        // For renamed files, use originalUri for the left side (old file from ref)
        try {
            const originalGitUri = git.toGitUri(originalUri, ref);
            const fileName = path.basename(uri.fsPath);
            await vscode.commands.executeCommand(
                'vscode.diff',
                originalGitUri,
                uri,
                `${fileName} (${ref} ↔ Working Tree)`
            );
        } catch (error) {
            // If file doesn't exist in ref, just open it
            await vscode.commands.executeCommand('vscode.open', uri);
        }
    } else {
        // Show diff between ref version and current version
        try {
            const gitUri = git.toGitUri(uri, ref);
            const fileName = path.basename(uri.fsPath);
            await vscode.commands.executeCommand(
                'vscode.diff',
                gitUri,
                uri,
                `${fileName} (${ref} ↔ Working Tree)`
            );
        } catch (error) {
            // If file doesn't exist in ref (new file), just open it
            await vscode.commands.executeCommand('vscode.open', uri);
        }
    }
}

export class MultiRepoTreeDataProvider implements vscode.TreeDataProvider<RepositoryNode | ChangedFile | DirectoryNode | MessageItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<RepositoryNode | ChangedFile | DirectoryNode | MessageItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _repos = new Map<Repository, { node: RepositoryNode; provider: ChangesTreeDataProvider; listenerDisposable: vscode.Disposable }>();
    private _submoduleDisplay: 'standalone' | 'integrated';

    // Maps parent repo → child (submodule) repos for integrated mode
    private _parentToChildren = new Map<Repository, Repository[]>();
    // Maps child repo → parent repo for integrated mode
    private _childToParent = new Map<Repository, Repository>();

    constructor(submoduleDisplay: 'standalone' | 'integrated' = 'standalone') {
        this._submoduleDisplay = submoduleDisplay;
    }

    addRepository(repo: Repository, provider: ChangesTreeDataProvider, ref: string): RepositoryNode {
        const node = new RepositoryNode(repo, provider, ref);

        // Listen to child provider's refresh events and forward them
        const listenerDisposable = provider.onDidChangeTreeData(() => {
            if (this._repos.size === 1) {
                // Single repo: refresh entire tree (no repo node level)
                this._onDidChangeTreeData.fire();
            } else {
                // Multi repo: refresh only this repo's subtree
                this._onDidChangeTreeData.fire(node);
            }
        });

        this._repos.set(repo, { node, provider, listenerDisposable });
        this._rebuildSubmoduleMap();
        this._onDidChangeTreeData.fire();
        return node;
    }

    removeRepository(repo: Repository): void {
        const entry = this._repos.get(repo);
        if (entry) {
            entry.listenerDisposable.dispose();
            this._repos.delete(repo);
            this._rebuildSubmoduleMap();
            this._onDidChangeTreeData.fire();
        }
    }

    private _rebuildSubmoduleMap(): void {
        this._parentToChildren.clear();
        this._childToParent.clear();

        const allRepos = [...this._repos.keys()];

        for (const repo of allRepos) {
            const submodules = repo.state.submodules;
            if (!submodules || submodules.length === 0) {
                continue;
            }

            for (const submodule of submodules) {
                // Resolve the submodule absolute path relative to the parent repo
                const submodulePath = path.resolve(repo.rootUri.fsPath, submodule.path);

                // Find a registered repo matching this submodule path
                const childRepo = allRepos.find(r => r.rootUri.fsPath === submodulePath);
                if (childRepo && childRepo !== repo) {
                    if (!this._parentToChildren.has(repo)) {
                        this._parentToChildren.set(repo, []);
                    }
                    this._parentToChildren.get(repo)!.push(childRepo);
                    this._childToParent.set(childRepo, repo);

                    // Update submodule icon on the node
                    const childEntry = this._repos.get(childRepo);
                    if (childEntry) {
                        childEntry.node.isSubmodule = true;
                    }
                }
            }
        }

        // Reset non-submodule repos' icons
        for (const [repo, entry] of this._repos) {
            if (!this._childToParent.has(repo)) {
                entry.node.isSubmodule = false;
            }
        }
    }

    /** Returns top-level repos (excludes submodules in integrated mode) */
    private _getTopLevelRepos(): Repository[] {
        if (this._submoduleDisplay === 'standalone') {
            return [...this._repos.keys()];
        }
        // Integrated mode: exclude repos that are children of another repo
        return [...this._repos.keys()].filter(r => !this._childToParent.has(r));
    }

    getProviderForUri(uri: vscode.Uri): ChangesTreeDataProvider | undefined {
        for (const [repo, entry] of this._repos) {
            if (uri.fsPath.startsWith(repo.rootUri.fsPath)) {
                return entry.provider;
            }
        }
        return undefined;
    }

    getProviderForRepo(repo: Repository): ChangesTreeDataProvider | undefined {
        return this._repos.get(repo)?.provider;
    }

    getNodeForRepo(repo: Repository): RepositoryNode | undefined {
        return this._repos.get(repo)?.node;
    }

    get repositories(): Repository[] {
        return [...this._repos.keys()];
    }

    get size(): number {
        return this._repos.size;
    }

    setSubmoduleDisplay(mode: 'standalone' | 'integrated'): void {
        this._submoduleDisplay = mode;
        this._rebuildSubmoduleMap();
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        for (const entry of this._repos.values()) {
            entry.provider.refresh();
        }
    }

    refreshRepo(repo: Repository): void {
        const entry = this._repos.get(repo);
        if (entry) {
            entry.provider.refresh();
        }
    }

    setDisplayMode(mode: 'list' | 'tree'): void {
        for (const entry of this._repos.values()) {
            entry.provider.setDisplayMode(mode);
        }
    }

    getTreeItem(element: RepositoryNode | ChangedFile | DirectoryNode | MessageItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RepositoryNode | ChangedFile | DirectoryNode | MessageItem): Promise<(RepositoryNode | ChangedFile | DirectoryNode | MessageItem)[]> {
        if (!element) {
            if (this._repos.size === 0) {
                return [];
            }
            const topLevel = this._getTopLevelRepos();
            if (topLevel.length === 1 && this._repos.size === 1) {
                // Single repo (no submodules at all): delegate directly (skip repo node)
                const entry = this._repos.get(topLevel[0])!;
                return entry.provider.getChildren();
            }
            // Multiple repos or has submodules: return repo nodes
            return topLevel.map(r => this._repos.get(r)!.node);
        }

        if (element instanceof RepositoryNode) {
            const children = await element.provider.getChildren();
            // In integrated mode, append submodule RepositoryNodes as children
            if (this._submoduleDisplay === 'integrated') {
                const subRepos = this._parentToChildren.get(element.repository);
                if (subRepos && subRepos.length > 0) {
                    const subNodes = subRepos
                        .map(r => this._repos.get(r)?.node)
                        .filter((n): n is RepositoryNode => n !== undefined);
                    return [...children, ...subNodes];
                }
            }
            return children;
        }

        if (element instanceof DirectoryNode) {
            // Find the provider for this directory by URI
            if (element.resourceUri) {
                const provider = this.getProviderForUri(element.resourceUri);
                if (provider) {
                    return provider.getChildren(element);
                }
            }
            return [];
        }

        // ChangedFile and MessageItem have no children
        return [];
    }
}
