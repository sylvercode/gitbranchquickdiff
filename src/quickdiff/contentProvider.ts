import * as path from 'path';
import * as vscode from 'vscode';
import { API } from '../externals/git';

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

        for (const repository of this.git.repositories) {
            if (originalUri.fsPath.startsWith(repository.rootUri.fsPath)) {
                try {
                    const relativePath = path.relative(repository.rootUri.fsPath, originalUri.fsPath);
                    return await repository.show(ref, relativePath);
                } catch (error) {
                    console.error(`[GitBranchQuickDiff] Error getting content for ${originalUri.fsPath} at ${ref}:`, error);
                    return '';
                }
            }
        }

        return '';
    }
}
