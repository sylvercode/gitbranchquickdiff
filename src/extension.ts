import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { registerProvider } from './quickdiff';
import { initLocalization, logger } from './utils';

export function activate(context: vscode.ExtensionContext) {
	initLocalization(context);
	logger.info('Activating GitBranchQuickDiff extension');
	registerCommands(context);
	registerProvider(context);
}

// This method is called when your extension is deactivated
export function deactivate() {
	logger.info('Deactivating GitBranchQuickDiff extension');
	logger.dispose();
}
