import * as vscode from 'vscode';
import * as gbqdController from './gitbranchquickdiff';

export function activate(context: vscode.ExtensionContext) {
	gbqdController.activate(context);
}

// This method is called when your extension is deactivated
export function deactivate() { }
