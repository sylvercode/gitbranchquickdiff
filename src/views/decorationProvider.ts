import * as vscode from 'vscode';
import { DIFF_BADGE_SUFFIX, ExtendedStatus, getStatusTooltip } from '../utils';

interface ChangeInfo {
    uri: vscode.Uri;
    status: ExtendedStatus;
    statusText: string;
    color: vscode.ThemeColor;
}

export class ChangesDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    private changes = new Map<string, ChangeInfo>();

    setChanges(changes: ChangeInfo[]): void {
        const newKeys = new Set<string>();
        const changedUris: vscode.Uri[] = [];

        for (const change of changes) {
            const key = change.uri.toString();
            newKeys.add(key);

            const existingChange = this.changes.get(key);
            const statusChanged = !existingChange ||
                existingChange.status !== change.status ||
                existingChange.statusText !== change.statusText;

            if (statusChanged) {
                this.changes.set(key, change);
                changedUris.push(change.uri);
            }
        }

        const keysToRemove: string[] = [];
        for (const key of this.changes.keys()) {
            if (!newKeys.has(key)) {
                keysToRemove.push(key);
                changedUris.push(vscode.Uri.parse(key));
            }
        }

        for (const key of keysToRemove) {
            this.changes.delete(key);
        }

        if (changedUris.length > 0) {
            this._onDidChangeFileDecorations.fire(changedUris);
        }
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const change = this.changes.get(uri.toString());
        if (!change) {
            return undefined;
        }

        return {
            badge: `${change.statusText}${DIFF_BADGE_SUFFIX}`,
            color: change.color,
            tooltip: getStatusTooltip(change.status)
        };
    }
}
