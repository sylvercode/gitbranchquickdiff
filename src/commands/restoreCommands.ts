import * as path from 'path';
import * as child_process from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';
import { getCurrentMultiRepoProvider, getRegisteredGitApi } from '../quickdiff';
import { QUICKDIFF_SCHEME } from '../quickdiff';
import { ExtendedStatus, getCurrentRef, l10n } from '../utils';
import { ChangedFile, DirectoryNode } from '../views';

const execFile = util.promisify(child_process.execFile);

export async function restoreFileCommand(context: vscode.ExtensionContext, fileItem: ChangedFile) {
    const gitAPI = getRegisteredGitApi();
    if (!gitAPI) {
        vscode.window.showErrorMessage(l10n('error.gitExtensionNotFound'));
        return;
    }

    for (const repository of gitAPI.repositories) {
        if (fileItem.resourceUri.path.startsWith(repository.rootUri.path)) {
            const fileName = path.basename(fileItem.resourceUri.fsPath);
            const ref = await getCurrentRef(context, repository);
            const answer = await vscode.window.showWarningMessage(
                l10n('confirm.restoreFile', fileName, ref),
                { modal: true },
                l10n('confirm.restore')
            );

            if (answer === l10n('confirm.restore')) {
                try {
                    const isAdded = fileItem.status === ExtendedStatus.INDEX_ADDED ||
                        fileItem.status === ExtendedStatus.INTENT_TO_ADD ||
                        fileItem.status === ExtendedStatus.UNTRACKED ||
                        fileItem.status === ExtendedStatus.ADDED_BY_US ||
                        fileItem.status === ExtendedStatus.ADDED_BY_THEM ||
                        fileItem.status === ExtendedStatus.BOTH_ADDED;
                    const isRenamed = fileItem.status === ExtendedStatus.INDEX_RENAMED;

                    if (isAdded) {
                        await vscode.workspace.fs.delete(fileItem.resourceUri);
                    } else if (isRenamed) {
                        await vscode.workspace.fs.delete(fileItem.resourceUri);
                        const originalRelativePath = path.posix.relative(repository.rootUri.path, fileItem.originalUri.path);
                        try {
                            const { stdout } = await execFile('git', ['show', `${ref}:${originalRelativePath}`], {
                                cwd: repository.rootUri.fsPath,
                                encoding: 'buffer',
                                maxBuffer: 100 * 1024 * 1024
                            });
                            await vscode.workspace.fs.writeFile(fileItem.originalUri, stdout as Buffer);
                        } catch {
                            const content = await repository.show(ref, originalRelativePath);
                            await vscode.workspace.fs.writeFile(fileItem.originalUri, Buffer.from(content, 'binary'));
                        }
                    } else {
                        const isDeleted = fileItem.status === ExtendedStatus.INDEX_DELETED ||
                            fileItem.status === ExtendedStatus.DELETED ||
                            fileItem.status === ExtendedStatus.DELETED_BY_THEM ||
                            fileItem.status === ExtendedStatus.DELETED_BY_US;

                        if (isDeleted) {
                            const relativePath = path.posix.relative(repository.rootUri.path, fileItem.resourceUri.path);
                            try {
                                const { stdout } = await execFile('git', ['show', `${ref}:${relativePath}`], {
                                    cwd: repository.rootUri.fsPath,
                                    encoding: 'buffer',
                                    maxBuffer: 100 * 1024 * 1024
                                });
                                await vscode.workspace.fs.writeFile(fileItem.resourceUri, stdout as Buffer);
                            } catch {
                                const content = await repository.show(ref, relativePath);
                                await vscode.workspace.fs.writeFile(fileItem.resourceUri, Buffer.from(content, 'binary'));
                            }
                        } else {
                            const contentUri = fileItem.resourceUri.with({
                                scheme: QUICKDIFF_SCHEME,
                                query: JSON.stringify({ uri: fileItem.resourceUri.toString(), ref })
                            });
                            const doc = await vscode.workspace.openTextDocument(contentUri);
                            const content = doc.getText();
                            const existingDoc = await vscode.workspace.openTextDocument(fileItem.resourceUri);
                            const edit = new vscode.WorkspaceEdit();
                            edit.replace(fileItem.resourceUri, new vscode.Range(existingDoc.positionAt(0), existingDoc.positionAt(existingDoc.getText().length)), content);
                            await vscode.workspace.applyEdit(edit);
                            await existingDoc.save();
                        }
                    }

                    getCurrentMultiRepoProvider()?.refresh();
                    vscode.window.showInformationMessage(l10n('info.restoredFile', fileName, ref));
                } catch (error) {
                    vscode.window.showErrorMessage(l10n('error.restoreFailed', String(error)));
                }
            }
            return;
        }
    }
}

export async function restoreDirectoryCommand(context: vscode.ExtensionContext, directoryNode: unknown) {
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
            if (files.length === 0) {
                return;
            }

            const ref = await getCurrentRef(context, repository);
            const message = files.length === 1
                ? l10n('confirm.restoreDirectory.single', ref)
                : l10n('confirm.restoreDirectory.multiple', files.length, ref);

            const answer = await vscode.window.showWarningMessage(message, { modal: true }, l10n('confirm.restore'));
            if (answer !== l10n('confirm.restore')) {
                return;
            }

            let successCount = 0;
            let failCount = 0;
            for (const file of files) {
                try {
                    const isAdded = file.status === ExtendedStatus.INDEX_ADDED ||
                        file.status === ExtendedStatus.INTENT_TO_ADD ||
                        file.status === ExtendedStatus.UNTRACKED ||
                        file.status === ExtendedStatus.ADDED_BY_US ||
                        file.status === ExtendedStatus.ADDED_BY_THEM ||
                        file.status === ExtendedStatus.BOTH_ADDED;
                    const isRenamed = file.status === ExtendedStatus.INDEX_RENAMED;

                    if (isAdded) {
                        await vscode.workspace.fs.delete(file.resourceUri);
                    } else if (isRenamed) {
                        await vscode.workspace.fs.delete(file.resourceUri);
                        const originalRelativePath = path.posix.relative(repository.rootUri.path, file.originalUri.path);
                        try {
                            const { stdout } = await execFile('git', ['show', `${ref}:${originalRelativePath}`], {
                                cwd: repository.rootUri.fsPath,
                                encoding: 'buffer',
                                maxBuffer: 100 * 1024 * 1024
                            });
                            await vscode.workspace.fs.writeFile(file.originalUri, stdout as Buffer);
                        } catch {
                            const content = await repository.show(ref, originalRelativePath);
                            await vscode.workspace.fs.writeFile(file.originalUri, Buffer.from(content, 'binary'));
                        }
                    } else {
                        const isDeleted = file.status === ExtendedStatus.INDEX_DELETED ||
                            file.status === ExtendedStatus.DELETED ||
                            file.status === ExtendedStatus.DELETED_BY_THEM ||
                            file.status === ExtendedStatus.DELETED_BY_US;

                        if (isDeleted) {
                            const relativePath = path.posix.relative(repository.rootUri.path, file.resourceUri.path);
                            try {
                                const { stdout } = await execFile('git', ['show', `${ref}:${relativePath}`], {
                                    cwd: repository.rootUri.fsPath,
                                    encoding: 'buffer',
                                    maxBuffer: 100 * 1024 * 1024
                                });
                                await vscode.workspace.fs.writeFile(file.resourceUri, stdout as Buffer);
                            } catch {
                                const content = await repository.show(ref, relativePath);
                                await vscode.workspace.fs.writeFile(file.resourceUri, Buffer.from(content, 'binary'));
                            }
                        } else {
                            const contentUri = file.resourceUri.with({
                                scheme: QUICKDIFF_SCHEME,
                                query: JSON.stringify({ uri: file.resourceUri.toString(), ref })
                            });
                            const doc = await vscode.workspace.openTextDocument(contentUri);
                            const content = doc.getText();
                            const existingDoc = await vscode.workspace.openTextDocument(file.resourceUri);
                            const edit = new vscode.WorkspaceEdit();
                            edit.replace(file.resourceUri, new vscode.Range(existingDoc.positionAt(0), existingDoc.positionAt(existingDoc.getText().length)), content);
                            await vscode.workspace.applyEdit(edit);
                            await existingDoc.save();
                        }
                    }

                    successCount++;
                } catch (error) {
                    console.error(`Failed to restore ${file.resourceUri.fsPath}:`, error);
                    failCount++;
                }
            }

            currentMultiRepoProvider.refresh();
            if (failCount === 0) {
                const successMessage = successCount === 1
                    ? l10n('info.restoredFiles.single', ref)
                    : l10n('info.restoredFiles.multiple', successCount, ref);
                vscode.window.showInformationMessage(successMessage);
            } else {
                vscode.window.showWarningMessage(l10n('warning.restorePartialFailure', successCount, failCount));
            }
            return;
        }
    }
}
