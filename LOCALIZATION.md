# Localization Guide

This extension supports multiple languages through VS Code's localization system.

## Available Languages

- **English** (default) - `en`
- **French** - `fr`

## File Structure

The localization system uses three types of files:

### 1. Package Localization (`package.nls*.json`)

These files localize the extension's metadata, configuration, commands, and views shown in VS Code's UI.

- `package.nls.json` - Default English strings
- `package.nls.fr.json` - French translations

These files contain keys referenced in `package.json` using the `%key%` syntax.

### 2. Runtime Localization (`l10n/bundle.l10n*.json`)

These files localize runtime messages shown to users (error messages, prompts, confirmations, etc.).

- `l10n/bundle.l10n.json` - Default English strings
- `l10n/bundle.l10n.fr.json` - French translations

### 3. Localization API (`src/l10n.ts`)

The `l10n.ts` module provides the localization system for runtime strings.

Usage in TypeScript:
```typescript
import { l10n } from './l10n';

// Simple string
const message = l10n('error.gitExtensionNotFound');

// String with interpolation
const message = l10n('confirm.restoreFile', fileName, ref);
// Will replace {0} with fileName and {1} with ref
```

## Adding a New Language

To add a new language (e.g., Spanish):

1. Create `package.nls.es.json` with translations of all keys from `package.nls.json`
2. Create `l10n/bundle.l10n.es.json` with translations of all keys from `l10n/bundle.l10n.json`
3. The extension will automatically load the correct language based on VS Code's `vscode.env.language`

## String Interpolation

Runtime strings support placeholder replacement using `{0}`, `{1}`, etc.

Example:
```json
{
  "confirm.restoreFile": "Restore \"{0}\" to the state of {1}?"
}
```

Used as:
```typescript
l10n('confirm.restoreFile', fileName, ref)
// Results in: Restore "myfile.txt" to the state of main?
```

## Testing Localizations

1. Change VS Code's display language:
   - Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Run "Configure Display Language"
   - Select your language (e.g., Français)
   - Restart VS Code

2. The extension will automatically load the appropriate localization files

## Translation Guidelines

- Keep translations concise and clear
- Maintain the same tone and formality as the English version
- Preserve placeholder positions (`{0}`, `{1}`, etc.)
- Test UI strings to ensure they fit in the available space
- Use proper quotation marks for the target language (e.g., « » for French)
