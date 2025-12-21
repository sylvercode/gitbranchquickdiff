import * as vscode from 'vscode';
import './vscode.proposed.quickDiffProvider';
import * as vscodeVariables from './vscode-variables';
import { getGitAPI } from './gitApi';
import * as git from './git';

export const EXTENTION_NAME = 'gitbranchquickdiff';

const ENABLED_CONFIG_NAME = 'enabled';
const REF_CONFIG_NAME = 'ref';

export function activate(context: vscode.ExtensionContext) {
    registerCommands(context);

    registerToGitExtention(context);
}

function registerCommands(context: vscode.ExtensionContext) {
    registerCommand(context, `${EXTENTION_NAME}.activate`, enableExtention);
    registerCommand(context, `${EXTENTION_NAME}.deactivate`, disableExtention);
    registerCommand(context, `${EXTENTION_NAME}.changeref`, changeRef);
    registerCommand(context, `${EXTENTION_NAME}.defaultref`, resetRefToDefault);
}

async function registerToGitExtention(context: vscode.ExtensionContext) {
    // Get the Git extension API
    const git = await getGitAPI();
    if (!git) {
        vscode.window.showErrorMessage('Git extension not found');
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
    for (const repository of git.repositories) {
        const provider = new CustomQuickDiffProvider(git, repository);

        // Register the Quick Diff Provider
        const disposable = vscode.window.registerQuickDiffProvider(
            { pattern: `${repository.rootUri.fsPath}/**` },
            provider,
            EXTENTION_NAME,
            EXTENTION_NAME,
            repository.rootUri
        );

        context.subscriptions.push(disposable);
    }

    // Listen for new repositories
    git.onDidOpenRepository(async (repository: git.Repository) => {
        const provider = new CustomQuickDiffProvider(git, repository);
        const disposable = vscode.window.registerQuickDiffProvider(
            { pattern: `${repository.rootUri.fsPath}/**` },
            provider,
            EXTENTION_NAME,
            EXTENTION_NAME,
            repository.rootUri
        );
        context.subscriptions.push(disposable);
    });
}

class CustomQuickDiffProvider implements vscode.QuickDiffProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;
    readonly id = EXTENTION_NAME;
    private _label: string = 'HEAD';

    get label(): string {
        return this._label;
    }

    constructor(
        private git: git.API,
        private repository: git.Repository) {
        // Initialize label
        this.updateLabel();

        // Listen for config changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(`${EXTENTION_NAME}.${REF_CONFIG_NAME}`)
                || e.affectsConfiguration(`${EXTENTION_NAME}.${ENABLED_CONFIG_NAME}`)) {
                this.updateLabel();
                this._onDidChange.fire(vscode.Uri.file(this.repository.rootUri.fsPath));
            }
        });
    }

    private async updateLabel() {
        this._label = await this.getCurrentRef();
    }

    async getCurrentRef(): Promise<string> {
        return await vscodeVariables.variables(
            this.repository,
            vscode.workspace.getConfiguration(EXTENTION_NAME).get<string>(REF_CONFIG_NAME) ?? "HEAD");
    }

    async provideOriginalResource(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        if (uri.scheme !== 'file') {
            return undefined;
        }

        const isEnabled = vscode.workspace.getConfiguration(EXTENTION_NAME).get<boolean>(ENABLED_CONFIG_NAME);
        if (!isEnabled) {
            return undefined;
        }

        // Check if file is in this repository
        const repoPath = this.repository.rootUri.fsPath;
        if (!uri.fsPath.startsWith(repoPath)) {
            return undefined;
        }

        // Get the custom reference from settings
        const ref = await this.getCurrentRef();
        return this.git.toGitUri(uri, ref);
    }
}

function registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) {
    context.subscriptions.push(
        vscode.commands.registerCommand(command, callback, thisArg));
}

function enableExtention() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update(ENABLED_CONFIG_NAME, true, false);
}

function disableExtention() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update(ENABLED_CONFIG_NAME, false, false);
}

function resetRefToDefault() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update(REF_CONFIG_NAME, undefined, false);
}

async function changeRef() {
    const input = await vscode.window.showInputBox({
        title: 'ref'
    });

    if (input) {
        vscode.workspace.getConfiguration(EXTENTION_NAME).update(REF_CONFIG_NAME, input, false);
    }
}
