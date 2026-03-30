import * as path from 'path';
import * as vscode from 'vscode';
import { API } from '../externals/git';
import { logger } from '../utils';

export const QUICKDIFF_SCHEME = 'gitbranchquickdiff';

export class GitBranchQuickDiffContentProvider implements vscode.TextDocumentContentProvider {
    constructor(
        private context: vscode.ExtensionContext,
        private git: API
    ) {
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const query = JSON.parse(uri.query);
        const originalUri = vscode.Uri.parse(query.uri);
        const ref = query.ref;

        logger.trace('Providing content for:', originalUri.fsPath, 'at ref:', ref);
        for (const repository of this.git.repositories) {
            if (originalUri.fsPath.startsWith(repository.rootUri.fsPath)) {
                try {
                    const relativePath = path.relative(repository.rootUri.fsPath, originalUri.fsPath);
                    return await repository.show(ref, relativePath);
                } catch (error) {
                    logger.error(`Error getting content for ${originalUri.fsPath} at ${ref}:`, error);
                    return '';
                }
            }
        }

        return '';
    }
}
