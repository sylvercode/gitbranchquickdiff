import * as vscode from 'vscode';
import * as path from 'path';
import * as vscodeVariables from './vscode-variables';
import { Repository, Status, API } from './git';

// Display mode for the changes tree view
export enum DisplayMode {
    List = 'list',
    Tree = 'tree'
}

// Shared utility functions for status handling
function getStatusText(status: Status): string {
    switch (status) {
        case Status.MODIFIED:
            return 'M';
        case Status.INDEX_ADDED:
        case Status.INTENT_TO_ADD:
            return 'A';
        case Status.DELETED:
        case Status.DELETED_BY_THEM:
        case Status.DELETED_BY_US:
            return 'D';
        case Status.INDEX_RENAMED:
            return 'R';
        case Status.UNTRACKED:
            return 'U';
        case Status.IGNORED:
            return 'I';
        default:
            return '?';
    }
}

function getStatusColor(status: Status): vscode.ThemeColor {
    switch (status) {
        case Status.MODIFIED:
            return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
        case Status.INDEX_ADDED:
        case Status.INTENT_TO_ADD:
            return new vscode.ThemeColor('gitDecoration.addedResourceForeground');
        case Status.DELETED:
        case Status.DELETED_BY_THEM:
        case Status.DELETED_BY_US:
            return new vscode.ThemeColor('gitDecoration.deletedResourceForeground');
        case Status.INDEX_RENAMED:
            return new vscode.ThemeColor('gitDecoration.renamedResourceForeground');
        case Status.UNTRACKED:
            return new vscode.ThemeColor('gitDecoration.untrackedResourceForeground');
        case Status.IGNORED:
            return new vscode.ThemeColor('gitDecoration.ignoredResourceForeground');
        default:
            return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
    }
}

function getStatusTooltip(status: Status): string {
    switch (status) {
        case Status.MODIFIED:
            return 'Modified';
        case Status.INDEX_ADDED:
        case Status.INTENT_TO_ADD:
            return 'Added';
        case Status.DELETED:
        case Status.DELETED_BY_THEM:
        case Status.DELETED_BY_US:
            return 'Deleted';
        case Status.INDEX_RENAMED:
            return 'Renamed';
        case Status.UNTRACKED:
            return 'Untracked';
        case Status.IGNORED:
            return 'Ignored';
        default:
            return 'Unknown';
    }
}

// Message item for displaying info in the tree view
class MessageItem extends vscode.TreeItem {
    constructor(message: string, command?: vscode.Command) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'message';
        this.command = command;
    }
}

export class ChangesTreeDataProvider implements vscode.TreeDataProvider<ChangedFile | DirectoryNode | MessageItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ChangedFile | DirectoryNode | MessageItem | undefined | null | void> = new vscode.EventEmitter<ChangedFile | DirectoryNode | MessageItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChangedFile | DirectoryNode | MessageItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _decorationProvider: ChangesDecorationProvider;
    private _displayMode: DisplayMode = DisplayMode.List;
    private _currentDirectoryNodes: DirectoryNode[] = [];

    constructor(
        private repository: Repository,
        private getRef: () => Promise<string>
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
        this._onDidChangeTreeData.fire();
    }

    getCurrentDirectoryNodes(): DirectoryNode[] {
        return this._currentDirectoryNodes;
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
        const isEnabled = vscode.workspace.getConfiguration('gitbranchquickdiff').get<boolean>('enabled', true);
        if (!isEnabled) {
            return [new MessageItem('Quick Diff is deactivated. Use the activate command to enable it.', {
                command: 'gitbranchquickdiff.activate',
                title: 'Activate'
            })];
        }

        const ref = await this.getRef();
        if (!ref) {
            return [];
        }

        try {
            // Get changes between ref and HEAD
            const diffChanges = await this.repository.diffBetween(ref, 'HEAD');

            // Get all working tree changes (staged, unstaged, and untracked)
            const indexChanges = this.repository.state.indexChanges;
            const workingTreeChanges = this.repository.state.workingTreeChanges;
            const mergeChanges = this.repository.state.mergeChanges;

            // Track which files are only in working tree (not in diff)
            const diffChangeUris = new Set<string>();
            for (const change of diffChanges) {
                diffChangeUris.add(change.uri.toString());
            }

            // Track worktree statuses
            const worktreeStatusMap = new Map<string, Status>();
            for (const change of indexChanges) {
                worktreeStatusMap.set(change.uri.toString(), change.status);
            }
            for (const change of workingTreeChanges) {
                worktreeStatusMap.set(change.uri.toString(), change.status);
            }
            for (const change of mergeChanges) {
                worktreeStatusMap.set(change.uri.toString(), change.status);
            }

            // Combine all changes and deduplicate by URI
            const allChangesMap = new Map<string, { uri: vscode.Uri; status: Status; worktreeStatus?: Status }>();

            // Add diff changes (between ref and HEAD)
            for (const change of diffChanges) {
                allChangesMap.set(change.uri.toString(), {
                    uri: change.uri,
                    status: change.status,
                    worktreeStatus: worktreeStatusMap.get(change.uri.toString())
                });
            }

            // Add index changes (staged)
            for (const change of indexChanges) {
                if (!allChangesMap.has(change.uri.toString())) {
                    allChangesMap.set(change.uri.toString(), {
                        uri: change.uri,
                        status: change.status,
                        worktreeStatus: change.status
                    });
                }
            }

            // Add working tree changes (unstaged)
            for (const change of workingTreeChanges) {
                if (!allChangesMap.has(change.uri.toString())) {
                    allChangesMap.set(change.uri.toString(), {
                        uri: change.uri,
                        status: change.status,
                        worktreeStatus: change.status
                    });
                }
            }

            // Add merge changes
            for (const change of mergeChanges) {
                if (!allChangesMap.has(change.uri.toString())) {
                    allChangesMap.set(change.uri.toString(), {
                        uri: change.uri,
                        status: change.status,
                        worktreeStatus: change.status
                    });
                }
            }

            const allChanges = Array.from(allChangesMap.values());

            // Update the decoration provider with only diff changes (not working tree only)
            this._decorationProvider.setChanges(
                allChanges
                    .filter(c => diffChangeUris.has(c.uri.toString()))
                    .map(c => ({
                        uri: c.uri,
                        status: c.status,
                        statusText: getStatusText(c.status),
                        color: getStatusColor(c.status)
                    }))
            );

            // Create ChangedFile objects for all changes
            const changedFiles = allChanges.map(change => {
                const uri = change.uri;
                const relativePath = path.relative(this.repository.rootUri.fsPath, uri.fsPath);
                const fileName = path.basename(uri.fsPath);
                const dirName = path.dirname(relativePath);

                const statusText = getStatusText(change.status);
                const worktreeStatusText = change.worktreeStatus ? getStatusText(change.worktreeStatus) : undefined;
                const color = getStatusColor(change.status);
                const isInDiff = diffChangeUris.has(change.uri.toString());

                return new ChangedFile(
                    fileName,
                    dirName !== '.' ? dirName : '',
                    uri,
                    statusText,
                    worktreeStatusText,
                    '',
                    color,
                    change.status,
                    isInDiff,
                    this._displayMode
                );
            });

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
            return [];
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
    status: Status;
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
            badge: `${change.statusText}⁺`,
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
        public readonly statusText: string,
        public readonly worktreeStatusText: string | undefined,
        public readonly statusIcon: string,
        public readonly color: vscode.ThemeColor | undefined,
        public readonly status: Status,
        public readonly isInDiff: boolean,
        displayMode: DisplayMode = DisplayMode.List
    ) {
        super(resourceUri, vscode.TreeItemCollapsibleState.None);

        this.label = fileName;
        this.tooltip = `${directory ? directory + path.sep : ''}${fileName}`;

        // Build status display
        let statusDisplay: string;
        if (isInDiff) {
            // File has changes in diff (ref vs HEAD)
            statusDisplay = `${statusText}⁺`;
            if (worktreeStatusText) {
                statusDisplay += `, ${worktreeStatusText}`;
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

        // Set default click command based on current setting
        const defaultAction = vscode.workspace.getConfiguration('gitbranchquickdiff').get<string>('defaultAction', 'openChanges');
        if (defaultAction === 'openFile') {
            this.command = {
                command: 'gitbranchquickdiff.openFile',
                title: 'Open File',
                arguments: [this]
            };
        } else {
            this.command = {
                command: 'gitbranchquickdiff.openChange',
                title: 'Open Changes',
                arguments: [this]
            };
        }

        // Add context value for menu customization
        this.contextValue = `changedFile:${status}`;
    }
}

export async function openChange(git: API, repository: Repository, getRef: () => Promise<string>, uri: vscode.Uri, status: Status) {
    const ref = await getRef();

    if (status === Status.DELETED || status === Status.DELETED_BY_THEM || status === Status.DELETED_BY_US) {
        // For deleted files, show the file from the ref
        const gitUri = git.toGitUri(uri, ref);
        await vscode.commands.executeCommand('vscode.open', gitUri);
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
