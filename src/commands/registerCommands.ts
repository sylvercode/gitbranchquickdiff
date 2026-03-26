import * as vscode from 'vscode';
import { EXTENTION_NAME } from '../utils';
import { ChangedFile, RepositoryNode } from '../views';
import { openAllChangesCommand, openChangeCommand, openDirectoryChangesCommand, openFileCommand, refreshChanges } from './openCommands';
import { changeRef, resetRef } from './refCommands';
import { restoreDirectoryCommand, restoreFileCommand } from './restoreCommands';
import { clearWorkspaceCache, disableExtension, enableExtension, setDefaultActionOpenChanges, setDefaultActionOpenFile, setListMode, setTreeMode, toggleSubmoduleDisplay } from './viewCommands';

function registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback, thisArg));
}

export function registerCommands(context: vscode.ExtensionContext) {
    registerCommand(context, `${EXTENTION_NAME}.activate`, () => enableExtension(context));
    registerCommand(context, `${EXTENTION_NAME}.deactivate`, () => disableExtension(context));
    registerCommand(context, `${EXTENTION_NAME}.changeref`, (repoNode?: RepositoryNode) => changeRef(context, repoNode));
    registerCommand(context, `${EXTENTION_NAME}.changerefPick`, () => changeRef(context));
    registerCommand(context, `${EXTENTION_NAME}.resetRef`, (repoNode?: RepositoryNode) => resetRef(context, repoNode));
    registerCommand(context, `${EXTENTION_NAME}.refreshChanges`, (repoNode?: RepositoryNode) => refreshChanges(repoNode));
    registerCommand(context, `${EXTENTION_NAME}.openChange`, (fileItem: ChangedFile) => openChangeCommand(context, fileItem));
    registerCommand(context, `${EXTENTION_NAME}.openFile`, (fileItem: ChangedFile) => openFileCommand(context, fileItem));
    registerCommand(context, `${EXTENTION_NAME}.openDirectoryChanges`, (directoryNode: unknown) => openDirectoryChangesCommand(context, directoryNode));
    registerCommand(context, `${EXTENTION_NAME}.openAllChanges`, (repoNode?: RepositoryNode) => openAllChangesCommand(context, repoNode));
    registerCommand(context, `${EXTENTION_NAME}.viewAsList`, () => setListMode(context));
    registerCommand(context, `${EXTENTION_NAME}.viewAsTree`, () => setTreeMode(context));
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenFile`, () => setDefaultActionOpenFile(context));
    registerCommand(context, `${EXTENTION_NAME}.setDefaultActionOpenChanges`, () => setDefaultActionOpenChanges(context));
    registerCommand(context, `${EXTENTION_NAME}.restoreFile`, (fileItem: ChangedFile) => restoreFileCommand(context, fileItem));
    registerCommand(context, `${EXTENTION_NAME}.restoreDirectory`, (directoryNode: unknown) => restoreDirectoryCommand(context, directoryNode));
    registerCommand(context, `${EXTENTION_NAME}.clearWorkspaceCache`, () => clearWorkspaceCache(context));
    registerCommand(context, `${EXTENTION_NAME}.toggleSubmoduleDisplay`, () => toggleSubmoduleDisplay(context));
}
