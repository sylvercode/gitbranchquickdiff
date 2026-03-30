import * as vscode from 'vscode';
import { API, Repository } from '../externals/git';
import { EXTENTION_NAME, getCurrentEnabled, getCurrentRef, logger } from '../utils';
import { QUICKDIFF_SCHEME } from './contentProvider';

export class CustomQuickDiffProvider implements vscode.QuickDiffProvider {
    readonly id = EXTENTION_NAME;
    private _label = 'HEAD';

    get label(): string {
        return this._label;
    }

    constructor(
        private context: vscode.ExtensionContext,
        private git: API,
        private repository: Repository
    ) {
    }

    async updateLabel() {
        this._label = await getCurrentRef(this.context, this.repository);
        logger.trace('QuickDiff label updated to:', this._label);
    }

    async provideOriginalResource(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        if (uri.scheme !== 'file' || !getCurrentEnabled(this.context)) {
            return undefined;
        }

        const repoPath = this.repository.rootUri.fsPath;
        if (!uri.fsPath.startsWith(repoPath)) {
            return undefined;
        }

        const ref = await getCurrentRef(this.context, this.repository);
        logger.trace('Providing original resource for:', uri.fsPath, 'at ref:', ref);
        return uri.with({
            scheme: QUICKDIFF_SCHEME,
            query: JSON.stringify({ uri: uri.toString(), ref })
        });
    }
}
