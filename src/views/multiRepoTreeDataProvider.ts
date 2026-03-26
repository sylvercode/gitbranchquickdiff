import * as path from 'path';
import * as vscode from 'vscode';
import { Repository } from '../externals/git';
import { DisplayMode, l10n } from '../utils';
import { ChangesTreeDataProvider } from './changesTreeDataProvider';
import { ChangedFile, DirectoryNode, MessageItem, RepositoryNode } from './nodes';

export class MultiRepoTreeDataProvider implements vscode.TreeDataProvider<RepositoryNode | ChangedFile | DirectoryNode | MessageItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<RepositoryNode | ChangedFile | DirectoryNode | MessageItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _repos = new Map<Repository, { node: RepositoryNode; provider: ChangesTreeDataProvider; listenerDisposable: vscode.Disposable; decorationDisposable?: vscode.Disposable }>();
    private _submoduleDisplay: 'standalone' | 'integrated';
    private _parentToChildren = new Map<Repository, Repository[]>();
    private _childToParent = new Map<Repository, Repository>();

    constructor(submoduleDisplay: 'standalone' | 'integrated' = 'standalone') {
        this._submoduleDisplay = submoduleDisplay;
    }

    addRepository(repo: Repository, provider: ChangesTreeDataProvider, ref: string, decorationDisposable?: vscode.Disposable): RepositoryNode {
        const node = new RepositoryNode(repo, provider, ref);
        const listenerDisposable = provider.onDidChangeTreeData(() => {
            if (this._getTopLevelRepos().length === 1) {
                this._onDidChangeTreeData.fire();
            } else if (this._submoduleDisplay === 'integrated' && this._childToParent.has(repo)) {
                const parentRepo = this._childToParent.get(repo)!;
                const parentEntry = this._repos.get(parentRepo);
                this._onDidChangeTreeData.fire(parentEntry ? parentEntry.node : node);
            } else {
                this._onDidChangeTreeData.fire(node);
            }
        });

        this._repos.set(repo, { node, provider, listenerDisposable, decorationDisposable });
        this._rebuildSubmoduleMap();
        this._onDidChangeTreeData.fire();
        return node;
    }

    removeRepository(repo: Repository): void {
        const entry = this._repos.get(repo);
        if (!entry) {
            return;
        }

        entry.listenerDisposable.dispose();
        entry.decorationDisposable?.dispose();
        entry.provider.decorationProvider.setChanges([]);
        this._repos.delete(repo);
        this._rebuildSubmoduleMap();
        this._onDidChangeTreeData.fire();
    }

    private _rebuildSubmoduleMap(): void {
        this._parentToChildren.clear();
        this._childToParent.clear();

        const allRepos = [...this._repos.keys()];
        for (const repo of allRepos) {
            const submodules = repo.state.submodules;
            if (!submodules?.length) {
                continue;
            }

            for (const submodule of submodules) {
                const submodulePath = path.resolve(repo.rootUri.fsPath, submodule.path);
                const childRepo = allRepos.find(candidate => candidate.rootUri.fsPath === submodulePath);
                if (childRepo && childRepo !== repo) {
                    if (!this._parentToChildren.has(repo)) {
                        this._parentToChildren.set(repo, []);
                    }
                    this._parentToChildren.get(repo)!.push(childRepo);
                    this._childToParent.set(childRepo, repo);

                    const childEntry = this._repos.get(childRepo);
                    if (childEntry) {
                        childEntry.node.isSubmodule = true;
                    }
                }
            }
        }

        for (const [repo, entry] of this._repos) {
            if (!this._childToParent.has(repo)) {
                entry.node.isSubmodule = false;
            }
        }
    }

    private _getTopLevelRepos(): Repository[] {
        if (this._submoduleDisplay === 'standalone') {
            return [...this._repos.keys()];
        }
        return [...this._repos.keys()].filter(repo => !this._childToParent.has(repo));
    }

    getProviderForUri(uri: vscode.Uri): ChangesTreeDataProvider | undefined {
        let bestMatch: ChangesTreeDataProvider | undefined;
        let bestLength = 0;
        for (const [repo, entry] of this._repos) {
            const rootPath = repo.rootUri.fsPath;
            if (uri.fsPath.startsWith(rootPath) && rootPath.length > bestLength) {
                bestMatch = entry.provider;
                bestLength = rootPath.length;
            }
        }
        return bestMatch;
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
        this._repos.get(repo)?.provider.refresh();
    }

    setDisplayMode(mode: 'list' | 'tree'): void {
        for (const entry of this._repos.values()) {
            entry.provider.setDisplayMode(mode);
        }
    }

    getTreeItem(element: RepositoryNode | ChangedFile | DirectoryNode | MessageItem): vscode.TreeItem {
        return element;
    }

    private _getSubmodulesAtLevel(parentRepo: Repository, directoryPath: string): RepositoryNode[] {
        if (this._submoduleDisplay !== 'integrated') {
            return [];
        }

        const subRepos = this._parentToChildren.get(parentRepo);
        if (!subRepos?.length) {
            return [];
        }

        const nodes: RepositoryNode[] = [];
        for (const subRepo of subRepos) {
            const relPath = path.relative(parentRepo.rootUri.fsPath, subRepo.rootUri.fsPath);

            let remaining: string;
            if (directoryPath) {
                if (!relPath.startsWith(directoryPath + path.sep) && !relPath.startsWith(directoryPath + '/')) {
                    continue;
                }
                remaining = relPath.substring(directoryPath.length + 1);
            } else {
                remaining = relPath;
            }

            if (!remaining.includes(path.sep) && !remaining.includes('/')) {
                const entry = this._repos.get(subRepo);
                if (entry) {
                    nodes.push(entry.node);
                }
            }
        }

        nodes.sort((a, b) => `${a.label ?? ''}`.localeCompare(`${b.label ?? ''}`));
        return nodes;
    }

    private _findParentRepoForDirectory(uri: vscode.Uri): Repository | undefined {
        if (this._submoduleDisplay !== 'integrated') {
            return undefined;
        }

        for (const [repo] of this._repos) {
            if (!this._childToParent.has(repo) && this._parentToChildren.has(repo) && uri.fsPath.startsWith(repo.rootUri.fsPath)) {
                const subRepos = this._parentToChildren.get(repo) || [];
                const isInsideSubmodule = subRepos.some(sub => uri.fsPath.startsWith(sub.rootUri.fsPath + path.sep) || uri.fsPath === sub.rootUri.fsPath);
                if (!isInsideSubmodule) {
                    return repo;
                }
            }
        }

        return undefined;
    }

    private _mergeWithSubmodules(
        children: (ChangedFile | DirectoryNode | MessageItem)[],
        subNodes: RepositoryNode[]
    ): (RepositoryNode | ChangedFile | DirectoryNode | MessageItem)[] {
        const dirLike: (DirectoryNode | RepositoryNode)[] = [];
        const rest: (ChangedFile | MessageItem)[] = [];

        for (const child of children) {
            if (child instanceof DirectoryNode) {
                dirLike.push(child);
            } else {
                rest.push(child);
            }
        }

        dirLike.push(...subNodes);
        dirLike.sort((a, b) => `${a.label ?? ''}`.localeCompare(`${b.label ?? ''}`));

        return [...dirLike, ...rest];
    }

    private async _filterNonEmptySubmodules(nodes: RepositoryNode[]): Promise<RepositoryNode[]> {
        const results: RepositoryNode[] = [];
        for (const node of nodes) {
            const files = await node.provider.getChangedFiles();
            if (files && files.length > 0) {
                results.push(node);
            }
        }
        return results;
    }

    get singleTopLevelRepo(): Repository | undefined {
        const topLevel = this._getTopLevelRepos();
        return topLevel.length === 1 ? topLevel[0] : undefined;
    }

    async getChildren(element?: RepositoryNode | ChangedFile | DirectoryNode | MessageItem): Promise<(RepositoryNode | ChangedFile | DirectoryNode | MessageItem)[]> {
        if (!element) {
            if (this._repos.size === 0) {
                return [new MessageItem(l10n('message.noRepositories'))];
            }

            const topLevel = this._getTopLevelRepos();
            if (topLevel.length === 1) {
                const repo = topLevel[0];
                const entry = this._repos.get(repo)!;
                const children = await entry.provider.getChildren();

                if (this._submoduleDisplay === 'integrated') {
                    const subRepos = this._parentToChildren.get(repo);
                    if (subRepos?.length) {
                        if (entry.provider.displayMode === DisplayMode.List) {
                            const allSubNodes = await this._filterNonEmptySubmodules(
                                subRepos.map(subRepo => this._repos.get(subRepo)?.node).filter((node): node is RepositoryNode => node !== undefined)
                            );
                            allSubNodes.sort((a, b) => `${a.label ?? ''}`.localeCompare(`${b.label ?? ''}`));
                            if (allSubNodes.length > 0) {
                                return [...children, ...allSubNodes];
                            }
                        } else {
                            const subNodes = await this._filterNonEmptySubmodules(this._getSubmodulesAtLevel(repo, ''));
                            if (subNodes.length > 0) {
                                return this._mergeWithSubmodules(children, subNodes);
                            }
                        }
                    }
                }

                return children;
            }

            return topLevel.map(repo => this._repos.get(repo)!.node);
        }

        if (element instanceof RepositoryNode) {
            const children = await element.provider.getChildren();
            if (this._submoduleDisplay === 'integrated') {
                const subRepos = this._parentToChildren.get(element.repository);
                if (subRepos?.length) {
                    if (element.provider.displayMode === DisplayMode.List) {
                        const allSubNodes = await this._filterNonEmptySubmodules(
                            subRepos.map(subRepo => this._repos.get(subRepo)?.node).filter((node): node is RepositoryNode => node !== undefined)
                        );
                        allSubNodes.sort((a, b) => `${a.label ?? ''}`.localeCompare(`${b.label ?? ''}`));
                        if (allSubNodes.length > 0) {
                            return [...children, ...allSubNodes];
                        }
                    } else {
                        const subNodes = await this._filterNonEmptySubmodules(this._getSubmodulesAtLevel(element.repository, ''));
                        if (subNodes.length > 0) {
                            return this._mergeWithSubmodules(children, subNodes);
                        }
                    }
                }
            }
            return children;
        }

        if (element instanceof DirectoryNode) {
            if (!element.resourceUri) {
                return [];
            }

            const parentRepo = this._findParentRepoForDirectory(element.resourceUri);
            if (parentRepo) {
                const provider = this.getProviderForUri(element.resourceUri);
                const children = provider ? await provider.getChildren(element) : [];
                const dirRelPath = path.relative(parentRepo.rootUri.fsPath, element.resourceUri.fsPath);
                const subNodes = await this._filterNonEmptySubmodules(this._getSubmodulesAtLevel(parentRepo, dirRelPath));
                if (subNodes.length > 0) {
                    return this._mergeWithSubmodules(children, subNodes);
                }
                return children;
            }

            const provider = this.getProviderForUri(element.resourceUri);
            return provider ? provider.getChildren(element) : [];
        }

        return [];
    }
}
