import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logger } from './logger';

interface LocalizationStrings {
    [key: string]: string;
}

let localizedStrings: LocalizationStrings | null = null;

function loadLocalizedStrings(context: vscode.ExtensionContext): LocalizationStrings {
    const locale = vscode.env.language;
    const localizedFile = path.join(context.extensionPath, 'l10n', `bundle.l10n.${locale}.json`);
    const defaultFile = path.join(context.extensionPath, 'l10n', 'bundle.l10n.json');

    try {
        if (fs.existsSync(localizedFile)) {
            return JSON.parse(fs.readFileSync(localizedFile, 'utf8'));
        }
    } catch (error) {
        logger.error(`Failed to load localized strings for ${locale}:`, error);
    }

    try {
        if (fs.existsSync(defaultFile)) {
            return JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
        }
    } catch (error) {
        logger.error('Failed to load default localized strings:', error);
    }

    return {};
}

export function initLocalization(context: vscode.ExtensionContext): void {
    localizedStrings = loadLocalizedStrings(context);
}

export function l10n(key: string, ...args: (string | number)[]): string {
    if (!localizedStrings) {
        logger.error('Localization not initialized');
        return key;
    }

    let message = localizedStrings[key] || key;
    args.forEach((arg, index) => {
        message = message.replace(new RegExp(`\\{${index}\\}`, 'g'), String(arg));
    });

    return message;
}
