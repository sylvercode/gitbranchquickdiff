import * as path from 'path';
import * as vscode from 'vscode';
import { API } from '../externals/git';
import { getCurrentMultiRepoProvider, getRegisteredGitApi } from '../quickdiff';
import { clearTagCache, ExtendedStatus, getCurrentRef, l10n, logger } from '../utils';
import { ChangedFile, DirectoryNode, openChange, RepositoryNode } from '../views';

type SerializableChangedFile = ChangedFile | {
    resourceUri: vscode.Uri;
    originalUri: vscode.Uri;
    status: ExtendedStatus;
    existsInRef?: boolean;
};

export function refreshChanges(repoNode?: RepositoryNode) {
    logger.debug('Refreshing changes');
    clearTagCache();

    const currentMultiRepoProvider = getCurrentMultiRepoProvider();
    if (!currentMultiRepoProvider) {
        return;
    }

    if (repoNode instanceof RepositoryNode) {
        currentMultiRepoProvider.refreshRepo(repoNode.repository);
    } else {
        currentMultiRepoProvider.refresh();
    }
}

export async function openChangeCommand(context: vscode.ExtensionContext, fileItem: SerializableChangedFile) {
    logger.debug('Opening change for:', fileItem.resourceUri.fsPath);
    const gitAPI = getRegisteredGitApi();
    if (!gitAPI) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    for (const repository of gitAPI.repositories) {
        if (fileItem.resourceUri.path.startsWith(repository.rootUri.path)) {
            await openChange(gitAPI, repository, () => getCurrentRef(context, repository), fileItem.resourceUri, fileItem.originalUri, fileItem.status, fileItem.existsInRef ?? true);
            return;
        }
    }
}

export async function openFileCommand(context: vscode.ExtensionContext, fileItem: SerializableChangedFile) {
    logger.debug('Opening file:', fileItem.resourceUri.fsPath);
    const resourceUri = fileItem.resourceUri;
    const status = fileItem.status;
    const existsInRef = fileItem.existsInRef ?? true;
    const gitAPI = getRegisteredGitApi();

    let fileExists = true;
    try {
        await vscode.workspace.fs.stat(resourceUri);
    } catch {
        fileExists = false;
    }

    if (status === ExtendedStatus.INDEX_DELETED ||
        status === ExtendedStatus.DELETED ||
        status === ExtendedStatus.DELETED_BY_THEM ||
        status === ExtendedStatus.DELETED_BY_US ||
        (status === ExtendedStatus.RESTORED && !fileExists && !existsInRef)) {
        if (!gitAPI) {
            vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
            return;
        }

        for (const repository of gitAPI.repositories) {
            if (resourceUri.path.startsWith(repository.rootUri.path)) {
                const isInGitState =
                    repository.state.workingTreeChanges.some(change => change.uri.toString() === resourceUri.toString()) ||
                    repository.state.indexChanges.some(change => change.uri.toString() === resourceUri.toString()) ||
                    repository.state.mergeChanges.some(change => change.uri.toString() === resourceUri.toString());

                if (isInGitState) {
                    await vscode.commands.executeCommand('git.openChange', resourceUri);
                } else {
                    const ref = existsInRef ? await getCurrentRef(context, repository) : 'HEAD';
                    await vscode.commands.executeCommand('vscode.open', gitAPI.toGitUri(resourceUri, ref));
                }
                return;
            }
        }
    } else {
        await vscode.commands.executeCommand('vscode.open', resourceUri);
    }
}

function buildChangesArray(files: ChangedFile[], gitApi: API, ref: string): [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined][] {
    const changes: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined][] = [];
    for (const file of files) {
        const gitUri = gitApi.toGitUri(file.resourceUri, ref);
        if (file.status === ExtendedStatus.INDEX_DELETED ||
            file.status === ExtendedStatus.DELETED ||
            file.status === ExtendedStatus.DELETED_BY_THEM ||
            file.status === ExtendedStatus.DELETED_BY_US) {
            changes.push([file.resourceUri, gitUri, undefined]);
        } else if (file.status === ExtendedStatus.UNTRACKED ||
            file.status === ExtendedStatus.INDEX_ADDED ||
            file.status === ExtendedStatus.INTENT_TO_ADD) {
            changes.push([file.resourceUri, undefined, file.resourceUri]);
        } else if (file.status === ExtendedStatus.INDEX_RENAMED) {
            changes.push([file.resourceUri, gitApi.toGitUri(file.originalUri, ref), file.resourceUri]);
        } else {
            changes.push([file.resourceUri, gitUri, file.resourceUri]);
        }
    }
    return changes;
}

export async function openDirectoryChangesCommand(context: vscode.ExtensionContext, directoryNode: unknown) {
    logger.debug('Opening directory changes');
    const gitAPI = getRegisteredGitApi();
    const currentMultiRepoProvider = getCurrentMultiRepoProvider();
    if (!gitAPI || !currentMultiRepoProvider || !(directoryNode instanceof DirectoryNode) || !directoryNode.resourceUri) {
        if (!gitAPI) {
            vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        }
        return;
    }

    for (const repository of gitAPI.repositories) {
        if (directoryNode.resourceUri.path.startsWith(repository.rootUri.path)) {
            const getFilesRecursive = async (node: unknown): Promise<ChangedFile[]> => {
                const children = await currentMultiRepoProvider.getChildren(node as any);
                const files: ChangedFile[] = [];
                for (const child of children) {
                    if (child instanceof DirectoryNode) {
                        files.push(...await getFilesRecursive(child));
                    } else if (child instanceof ChangedFile) {
                        files.push(child);
                    }
                }
                return files;
            };

            const files = await getFilesRecursive(directoryNode);
            const ref = await getCurrentRef(context, repository);
            const changes = buildChangesArray(files, gitAPI, ref);
            if (changes.length > 0) {
                await vscode.commands.executeCommand('vscode.changes', `${ref} ↔ Working Tree`, changes);
            }
            return;
        }
    }
}

export async function openAllChangesCommand(context: vscode.ExtensionContext, repoNode?: RepositoryNode) {
    logger.debug('Opening all changes');
    const gitAPI = getRegisteredGitApi();
    const currentMultiRepoProvider = getCurrentMultiRepoProvider();
    if (!gitAPI || !currentMultiRepoProvider) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    const getFilesRecursive = async (item: unknown): Promise<ChangedFile[]> => {
        if (item instanceof ChangedFile) {
            return [item];
        }
        if (item instanceof DirectoryNode) {
            const childItems = await currentMultiRepoProvider.getChildren(item);
            const files: ChangedFile[] = [];
            for (const child of childItems) {
                files.push(...await getFilesRecursive(child));
            }
            return files;
        }
        return [];
    };

    if (repoNode instanceof RepositoryNode) {
        const children = await currentMultiRepoProvider.getChildren(repoNode);
        const allFiles: ChangedFile[] = [];
        for (const item of children) {
            allFiles.push(...await getFilesRecursive(item));
        }

        const ref = await getCurrentRef(context, repoNode.repository);
        const changes = buildChangesArray(allFiles, gitAPI, ref);
        if (changes.length > 0) {
            await vscode.commands.executeCommand('vscode.changes', `${path.basename(repoNode.repository.rootUri.fsPath)}: ${ref} ↔ Working Tree`, changes);
        }
        return;
    }

    const allChanges: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined][] = [];
    const titleParts: string[] = [];
    for (const repo of currentMultiRepoProvider.repositories) {
        const node = currentMultiRepoProvider.getNodeForRepo(repo);
        if (!node) {
            continue;
        }

        const children = await currentMultiRepoProvider.getChildren(node);
        const files: ChangedFile[] = [];
        for (const child of children) {
            files.push(...await getFilesRecursive(child));
        }

        if (files.length > 0) {
            const ref = await getCurrentRef(context, repo);
            allChanges.push(...buildChangesArray(files, gitAPI, ref));
            titleParts.push(currentMultiRepoProvider.size > 1 ? `${path.basename(repo.rootUri.fsPath)}: ${ref}` : ref);
        }
    }

    if (allChanges.length > 0) {
        const title = titleParts.length === 1 ? `${titleParts[0]} ↔ Working Tree` : `${titleParts.join(', ')} ↔ Working Tree`;
        await vscode.commands.executeCommand('vscode.changes', title, allChanges);
    }
}
