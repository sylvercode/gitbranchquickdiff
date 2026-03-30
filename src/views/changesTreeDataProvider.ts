import * as path from 'path';
import * as vscode from 'vscode';
import { API, Repository, Status } from '../externals/git';
import {
    DisplayMode,
    ExtendedStatus,
    getStatusColor,
    getStatusText,
    l10n,
    logger,
    toExtendedStatus
} from '../utils';
import { ChangesDecorationProvider } from './decorationProvider';
import { ChangedFile, DirectoryNode, MessageItem } from './nodes';
import { buildTree } from './treeBuilder';

export class ChangesTreeDataProvider implements vscode.TreeDataProvider<ChangedFile | DirectoryNode | MessageItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ChangedFile | DirectoryNode | MessageItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _decorationProvider: ChangesDecorationProvider;
    private _displayMode: DisplayMode = DisplayMode.List;
    private _currentDirectoryNodes: DirectoryNode[] = [];
    private _cachedDiffBetween: { changes: any[]; ref: string; headCommit: string } | undefined;
    private _cachedDiffWith: { changes: any[]; ref: string; indexCount: number; workingTreeCount: number; mergeCount: number } | undefined;
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

    get defaultAction(): string {
        return this.getDefaultAction();
    }

    refresh(): void {
        if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
        }

        this._refreshTimeout = setTimeout(() => {
            logger.trace('Refreshing changes tree for repository:', this.repository.rootUri.fsPath);
            this._cachedDiffBetween = undefined;
            this._cachedDiffWith = undefined;
            this._onDidChangeTreeData.fire();
            this._refreshTimeout = undefined;
        }, 100);
    }

    getTreeItem(element: ChangedFile | DirectoryNode | MessageItem): vscode.TreeItem {
        return element;
    }

    async getChangedFiles(): Promise<ChangedFile[] | null> {
        const ref = await this.getRef();
        if (!ref) {
            logger.debug('No ref available, returning null');
            return null;
        }

        logger.debug('Getting changed files for ref:', ref);
        try {
            const currentHeadCommit = this.repository.state.HEAD?.commit;
            const currentIndexCount = this.repository.state.indexChanges.length;
            const currentWorkingTreeCount = this.repository.state.workingTreeChanges.length;
            const currentMergeCount = this.repository.state.mergeChanges.length;

            let diffChanges: any[];
            const diffBetweenCacheValid = this._cachedDiffBetween !== undefined &&
                this._cachedDiffBetween.ref === ref &&
                this._cachedDiffBetween.headCommit === currentHeadCommit;

            if (diffBetweenCacheValid) {
                diffChanges = this._cachedDiffBetween!.changes;
                logger.trace('Using cached diffBetween result');
            } else {
                diffChanges = await this.repository.diffBetween(ref, 'HEAD');
                logger.trace('Fetched fresh diffBetween, changes:', diffChanges.length);
                this._cachedDiffBetween = {
                    changes: diffChanges,
                    ref,
                    headCommit: currentHeadCommit ?? ''
                };
            }

            let diffWithWorkingTree: any[];
            const diffWithCacheValid = this._cachedDiffWith !== undefined &&
                this._cachedDiffWith.ref === ref &&
                this._cachedDiffWith.indexCount === currentIndexCount &&
                this._cachedDiffWith.workingTreeCount === currentWorkingTreeCount &&
                this._cachedDiffWith.mergeCount === currentMergeCount;

            if (diffWithCacheValid) {
                diffWithWorkingTree = this._cachedDiffWith!.changes;
                logger.trace('Using cached diffWith result');
            } else {
                diffWithWorkingTree = await this.repository.diffWith(ref);
                logger.trace('Fetched fresh diffWith, changes:', diffWithWorkingTree.length);
                this._cachedDiffWith = {
                    changes: diffWithWorkingTree,
                    ref,
                    indexCount: currentIndexCount,
                    workingTreeCount: currentWorkingTreeCount,
                    mergeCount: currentMergeCount
                };
            }

            const indexChanges = this.repository.state.indexChanges;
            const workingTreeChanges = this.repository.state.workingTreeChanges;
            const mergeChanges = this.repository.state.mergeChanges;

            const diffChangeUris = new Set<string>(diffChanges.map(c => c.uri.toString()));
            const diffWithWorkingTreeUris = new Set<string>(diffWithWorkingTree.map(c => c.uri.toString()));
            const addedAfterRefUris = new Set<string>();
            for (const change of diffChanges) {
                if (change.status === Status.INDEX_ADDED || change.status === Status.INTENT_TO_ADD) {
                    addedAfterRefUris.add(change.uri.toString());
                }
            }

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

            const allChangesMap = new Map<string, { uri: vscode.Uri; originalUri: vscode.Uri; status: ExtendedStatus; indexStatus?: Status; workingTreeStatus?: Status; mergeStatus?: Status }>();

            for (const change of diffChanges) {
                let fileExists = true;
                try {
                    await vscode.workspace.fs.stat(change.uri);
                } catch {
                    fileExists = false;
                }

                const wasAddedAfterRef = change.status === Status.INDEX_ADDED || change.status === Status.INTENT_TO_ADD;

                if (!fileExists && workingTreeStatusMap.has(change.uri.toString())) {
                    if (wasAddedAfterRef) {
                        allChangesMap.set(change.uri.toString(), {
                            uri: change.uri,
                            originalUri: change.originalUri,
                            status: ExtendedStatus.RESTORED,
                            indexStatus: indexStatusMap.get(change.uri.toString()),
                            workingTreeStatus: workingTreeStatusMap.get(change.uri.toString()),
                            mergeStatus: mergeStatusMap.get(change.uri.toString())
                        });
                        continue;
                    }

                    diffChangeUris.delete(change.uri.toString());
                    continue;
                }

                let status: ExtendedStatus;
                if (!fileExists) {
                    status = ExtendedStatus.DELETED;
                } else if (!diffWithWorkingTreeUris.has(change.uri.toString()) &&
                    change.status !== Status.INDEX_ADDED &&
                    change.status !== Status.INTENT_TO_ADD) {
                    status = ExtendedStatus.RESTORED;
                } else {
                    status = toExtendedStatus(change.status);
                }

                allChangesMap.set(change.uri.toString(), {
                    uri: change.uri,
                    originalUri: change.originalUri,
                    status,
                    indexStatus: indexStatusMap.get(change.uri.toString()),
                    workingTreeStatus: workingTreeStatusMap.get(change.uri.toString()),
                    mergeStatus: mergeStatusMap.get(change.uri.toString())
                });
            }

            for (const change of indexChanges) {
                if (!allChangesMap.has(change.uri.toString())) {
                    let fileExists = true;
                    try {
                        await vscode.workspace.fs.stat(change.uri);
                    } catch {
                        fileExists = false;
                    }

                    if (!fileExists && workingTreeStatusMap.has(change.uri.toString())) {
                        diffChangeUris.delete(change.uri.toString());
                        continue;
                    }

                    let status: ExtendedStatus;
                    if (!fileExists) {
                        status = ExtendedStatus.DELETED;
                    } else if (!diffWithWorkingTreeUris.has(change.uri.toString()) &&
                        change.status !== Status.INDEX_ADDED &&
                        change.status !== Status.INTENT_TO_ADD) {
                        status = ExtendedStatus.RESTORED;
                    } else {
                        status = toExtendedStatus(change.status);
                    }

                    allChangesMap.set(change.uri.toString(), {
                        uri: change.uri,
                        originalUri: change.originalUri,
                        status,
                        indexStatus: change.status,
                        workingTreeStatus: workingTreeStatusMap.get(change.uri.toString()),
                        mergeStatus: mergeStatusMap.get(change.uri.toString())
                    });
                }
            }

            for (const change of workingTreeChanges) {
                if (!allChangesMap.has(change.uri.toString())) {
                    const status = !diffWithWorkingTreeUris.has(change.uri.toString()) &&
                        change.status !== Status.INDEX_ADDED &&
                        change.status !== Status.INTENT_TO_ADD &&
                        change.status !== Status.UNTRACKED
                        ? ExtendedStatus.RESTORED
                        : toExtendedStatus(change.status);

                    allChangesMap.set(change.uri.toString(), {
                        uri: change.uri,
                        originalUri: change.originalUri,
                        status,
                        indexStatus: indexStatusMap.get(change.uri.toString()),
                        workingTreeStatus: change.status,
                        mergeStatus: mergeStatusMap.get(change.uri.toString())
                    });
                }
            }

            for (const change of mergeChanges) {
                if (!allChangesMap.has(change.uri.toString())) {
                    let fileExists = true;
                    try {
                        await vscode.workspace.fs.stat(change.uri);
                    } catch {
                        fileExists = false;
                    }

                    let status: ExtendedStatus;
                    if (!fileExists) {
                        status = ExtendedStatus.DELETED;
                    } else if (!diffWithWorkingTreeUris.has(change.uri.toString()) &&
                        change.status !== Status.ADDED_BY_US &&
                        change.status !== Status.ADDED_BY_THEM &&
                        change.status !== Status.BOTH_ADDED) {
                        status = ExtendedStatus.RESTORED;
                    } else {
                        status = toExtendedStatus(change.status);
                    }

                    allChangesMap.set(change.uri.toString(), {
                        uri: change.uri,
                        originalUri: change.originalUri,
                        status,
                        indexStatus: indexStatusMap.get(change.uri.toString()),
                        workingTreeStatus: workingTreeStatusMap.get(change.uri.toString()),
                        mergeStatus: change.status
                    });
                }
            }

            const changedFiles = Array.from(allChangesMap.values()).map(change => {
                const relativePath = path.relative(this.repository.rootUri.fsPath, change.uri.fsPath);
                const fileName = path.basename(change.uri.fsPath);
                const dirName = path.dirname(relativePath);
                const statusText = getStatusText(change.status);

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

                let colorStatus: ExtendedStatus;
                if (change.status === ExtendedStatus.RESTORED) {
                    colorStatus = ExtendedStatus.RESTORED;
                } else if (change.status === ExtendedStatus.DELETED ||
                    change.status === ExtendedStatus.INDEX_DELETED ||
                    change.status === ExtendedStatus.DELETED_BY_THEM ||
                    change.status === ExtendedStatus.DELETED_BY_US) {
                    colorStatus = change.status;
                } else if (addedAfterRefUris.has(change.uri.toString())) {
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

                return new ChangedFile(
                    fileName,
                    dirName !== '.' ? dirName : '',
                    change.uri,
                    change.originalUri,
                    statusText,
                    gitStatusText,
                    '',
                    getStatusColor(colorStatus),
                    change.status,
                    diffChangeUris.has(change.uri.toString()),
                    !addedAfterRefUris.has(change.uri.toString()),
                    this._displayMode,
                    this.getDefaultAction()
                );
            });

            this._decorationProvider.setChanges(
                changedFiles
                    .filter(file => file.isInDiff)
                    .map(file => ({
                        uri: file.resourceUri,
                        status: file.status,
                        statusText: file.statusText,
                        color: file.color!
                    }))
            );

            logger.debug('Changed files found:', changedFiles.length);
            return changedFiles;
        } catch (error) {
            logger.error('Failed to get changes:', error);
            this._decorationProvider.setChanges([]);
            return null;
        }
    }

    async getChildren(element?: ChangedFile | DirectoryNode | MessageItem): Promise<(ChangedFile | DirectoryNode | MessageItem)[]> {
        if (element instanceof ChangedFile || element instanceof MessageItem) {
            return [];
        }

        if (!this.getEnabled()) {
            this._decorationProvider.setChanges([]);
            return [new MessageItem(l10n('message.quickDiffDeactivated'), {
                command: 'gitbranchquickdiff.activate',
                title: l10n('command.activate')
            })];
        }

        const changedFiles = await this.getChangedFiles();
        if (!changedFiles) {
            const ref = await this.getRef();
            this._decorationProvider.setChanges([]);
            if (ref) {
                return [new MessageItem(l10n('message.refNotFound', ref), {
                    command: 'gitbranchquickdiff.changeref',
                    title: l10n('command.changeRef')
                })];
            }
            return [];
        }

        if (this._displayMode === DisplayMode.List) {
            this._currentDirectoryNodes = [];
            changedFiles.sort((a, b) => {
                if (!a.directory && b.directory) {
                    return -1;
                }
                if (a.directory && !b.directory) {
                    return 1;
                }

                const pathA = a.directory ? `${a.directory}${path.sep}${a.fileName}` : a.fileName;
                const pathB = b.directory ? `${b.directory}${path.sep}${b.fileName}` : b.fileName;
                return pathA.localeCompare(pathB);
            });
            return changedFiles;
        }

        const treeNodes = buildTree(changedFiles, this.repository.rootUri.fsPath, element);
        if (!element) {
            this._currentDirectoryNodes = treeNodes.filter(node => node instanceof DirectoryNode) as DirectoryNode[];
        }
        return treeNodes;
    }
}

export async function openChange(git: API, repository: Repository, getRef: () => Promise<string>, uri: vscode.Uri, originalUri: vscode.Uri, status: ExtendedStatus, existsInRef: boolean = true) {
    const ref = await getRef();

    let fileExists = true;
    try {
        await vscode.workspace.fs.stat(uri);
    } catch {
        fileExists = false;
    }

    const isInGitState =
        repository.state.workingTreeChanges.some(c => c.uri.toString() === uri.toString()) ||
        repository.state.indexChanges.some(c => c.uri.toString() === uri.toString()) ||
        repository.state.mergeChanges.some(c => c.uri.toString() === uri.toString());

    if (status === ExtendedStatus.INDEX_DELETED || status === ExtendedStatus.DELETED || status === ExtendedStatus.DELETED_BY_THEM || status === ExtendedStatus.DELETED_BY_US) {
        if (isInGitState) {
            await vscode.commands.executeCommand('git.openChange', uri);
        } else {
            const sourceRef = existsInRef ? ref : 'HEAD';
            await vscode.commands.executeCommand('vscode.open', git.toGitUri(uri, sourceRef));
        }
    } else if (status === ExtendedStatus.RESTORED && !fileExists && !existsInRef) {
        await vscode.commands.executeCommand('git.openChange', uri);
    } else if (status === ExtendedStatus.UNTRACKED || status === ExtendedStatus.INDEX_ADDED || status === ExtendedStatus.INTENT_TO_ADD) {
        await vscode.commands.executeCommand('vscode.open', uri);
    } else if (status === ExtendedStatus.INDEX_RENAMED) {
        try {
            const originalGitUri = git.toGitUri(originalUri, ref);
            const fileName = path.basename(uri.fsPath);
            await vscode.commands.executeCommand('vscode.diff', originalGitUri, uri, `${fileName} (${ref} ↔ Working Tree)`);
        } catch {
            await vscode.commands.executeCommand('vscode.open', uri);
        }
    } else {
        try {
            const gitUri = git.toGitUri(uri, ref);
            const fileName = path.basename(uri.fsPath);
            await vscode.commands.executeCommand('vscode.diff', gitUri, uri, `${fileName} (${ref} ↔ Working Tree)`);
        } catch {
            await vscode.commands.executeCommand('vscode.open', uri);
        }
    }
}
