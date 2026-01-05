import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface LocalizationStrings {
    [key: string]: string;
}

let localizedStrings: LocalizationStrings | null = null;

/**
 * Load localized strings based on VS Code's display language
 */
function loadLocalizedStrings(context: vscode.ExtensionContext): LocalizationStrings {
    const locale = vscode.env.language;
    const localizedFile = path.join(context.extensionPath, 'l10n', `bundle.l10n.${locale}.json`);
    const defaultFile = path.join(context.extensionPath, 'l10n', 'bundle.l10n.json');

    try {
        // Try to load locale-specific file
        if (fs.existsSync(localizedFile)) {
            return JSON.parse(fs.readFileSync(localizedFile, 'utf8'));
        }
    } catch (error) {
        console.error(`Failed to load localized strings for ${locale}:`, error);
    }

    try {
        // Fall back to default English
        if (fs.existsSync(defaultFile)) {
            return JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
        }
    } catch (error) {
        console.error('Failed to load default localized strings:', error);
    }

    // Return empty object if all else fails
    return {};
}

/**
 * Initialize localization system
 */
export function initLocalization(context: vscode.ExtensionContext): void {
    localizedStrings = loadLocalizedStrings(context);
}

/**
 * Get a localized string by key
 * @param key The localization key
 * @param args Optional arguments for string interpolation
 * @returns The localized string
 */
export function l10n(key: string, ...args: (string | number)[]): string {
    if (!localizedStrings) {
        console.error('Localization not initialized');
        return key;
    }

    let message = localizedStrings[key] || key;

    // Simple string interpolation: replace {0}, {1}, etc. with args
    args.forEach((arg, index) => {
        message = message.replace(new RegExp(`\\{${index}\\}`, 'g'), String(arg));
    });

    return message;
}
