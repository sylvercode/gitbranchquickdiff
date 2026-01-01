import * as vscode from 'vscode';
import * as path from 'path';
import * as vscodeVariables from './vscode-variables';
import { Repository, Status, API } from './git';

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

export class ChangesTreeDataProvider implements vscode.TreeDataProvider<ChangedFile> {
    private _onDidChangeTreeData: vscode.EventEmitter<ChangedFile | undefined | null | void> = new vscode.EventEmitter<ChangedFile | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChangedFile | undefined | null | void> = this._onDidChangeTreeData.event;

    private _decorationProvider: ChangesDecorationProvider;

    constructor(
        private repository: Repository,
        private getRef: () => Promise<string>
    ) {
        this._decorationProvider = new ChangesDecorationProvider();
    }

    get decorationProvider(): ChangesDecorationProvider {
        return this._decorationProvider;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ChangedFile): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ChangedFile): Promise<ChangedFile[]> {
        if (element) {
            return [];
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

            return allChanges.map(change => {
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
                    isInDiff
                );
            });
        } catch (error) {
            console.error('Failed to get changes:', error);
            return [];
        }
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
        public readonly isInDiff: boolean
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
        if (directory) {
            this.description = `${directory} • ${statusDisplay}`;
        } else {
            this.description = `• ${statusDisplay}`;
        }

        // Add file icon with color
        this.iconPath = new vscode.ThemeIcon(
            'file',
            color
        );

        // Command to open the file diff
        this.command = {
            command: 'gitbranchquickdiff.openChange',
            title: 'Open Changes',
            arguments: [resourceUri, status]
        };

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
