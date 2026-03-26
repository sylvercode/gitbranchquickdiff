import * as path from 'path';
import * as vscode from 'vscode';
import { Repository } from '../externals/git';
import { DisplayMode, ExtendedStatus } from '../utils';
import type { ChangesTreeDataProvider } from './changesTreeDataProvider';

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
        this.iconPath = new vscode.ThemeIcon(isSubmodule ? 'file-symlink-directory' : 'repo');
        this.contextValue = 'repository';
        this.resourceUri = repository.rootUri;
    }

    get isSubmodule(): boolean {
        return this._isSubmodule;
    }

    set isSubmodule(value: boolean) {
        this._isSubmodule = value;
        this.iconPath = new vscode.ThemeIcon(value ? 'file-symlink-directory' : 'repo');
    }

    updateDescription(ref: string): void {
        this.description = ref;
    }
}

export class DirectoryNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fullPath: string,
        private readonly filesInDirectory: ChangedFile[],
        rootFsPath: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        this.contextValue = 'directory';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.resourceUri = vscode.Uri.file(path.join(rootFsPath, fullPath));

        const fileCount = filesInDirectory.length;
        this.description = `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;
        this.tooltip = fullPath;
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

        let statusDisplay: string;
        if (isInDiff) {
            statusDisplay = `${statusText}⁺`;
            if (gitStatusText) {
                statusDisplay += `, ${gitStatusText}`;
            }
        } else {
            statusDisplay = statusText;
        }

        if (displayMode === DisplayMode.List && directory) {
            this.description = `${directory} • ${statusDisplay}`;
        } else {
            this.description = `• ${statusDisplay}`;
        }

        this.iconPath = new vscode.ThemeIcon('file', color);

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

        this.contextValue = `changedFile:${status}`;
    }
}
