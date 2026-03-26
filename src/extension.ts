import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { registerProvider } from './quickdiff';
import { initLocalization } from './utils';

export function activate(context: vscode.ExtensionContext) {
	initLocalization(context);
	registerCommands(context);
	registerProvider(context);
}

// This method is called when your extension is deactivated
export function deactivate() { }
