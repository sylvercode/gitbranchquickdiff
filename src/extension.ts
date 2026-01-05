import * as vscode from 'vscode';
import * as gbqdController from './gitbranchquickdiff';
import { initLocalization } from './l10n';

export function activate(context: vscode.ExtensionContext) {
	initLocalization(context);
	gbqdController.activate(context);
}

// This method is called when your extension is deactivated
export function deactivate() { }
