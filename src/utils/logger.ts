import * as vscode from 'vscode';

export enum TraceLevel {
    Off = 'off',
    Error = 'error',
    Warn = 'warn',
    Info = 'info',
    Debug = 'debug',
    Trace = 'trace'
}

const LEVEL_PRIORITY: Record<TraceLevel, number> = {
    [TraceLevel.Off]: 0,
    [TraceLevel.Error]: 1,
    [TraceLevel.Warn]: 2,
    [TraceLevel.Info]: 3,
    [TraceLevel.Debug]: 4,
    [TraceLevel.Trace]: 5
};

let outputChannel: vscode.OutputChannel | undefined;

function getTraceLevel(): TraceLevel {
    return vscode.workspace.getConfiguration('gitbranchquickdiff')
        .get<TraceLevel>('traceLevel', TraceLevel.Off);
}

function isEnabled(level: TraceLevel): boolean {
    const configLevel = getTraceLevel();
    return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[configLevel];
}

function getChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('GitBranchQuickDiff');
    }
    return outputChannel;
}

function formatArgs(args: unknown[]): string {
    if (args.length === 0) {
        return '';
    }
    return ' ' + args.map(a => {
        if (a instanceof Error) {
            return a.stack ?? a.message;
        }
        if (typeof a === 'object' && a !== null) {
            try {
                return JSON.stringify(a);
            } catch {
                return String(a);
            }
        }
        return String(a);
    }).join(' ');
}

function log(level: TraceLevel, message: string, ...args: unknown[]): void {
    if (!isEnabled(level)) {
        return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const formatted = `${prefix} ${message}${formatArgs(args)}`;

    getChannel().appendLine(formatted);
}

/**
 * Logger for the GitBranchQuickDiff extension.
 * Output is written to the "GitBranchQuickDiff" output channel in VS Code.
 * The trace level is controlled by the `gitbranchquickdiff.traceLevel` setting.
 *
 * - `error`: Critical failures that prevent normal operation
 * - `warn`: Unexpected situations that are handled gracefully
 * - `info`: High-level operations (activation, configuration changes, repository events)
 * - `debug`: Detailed operational information (command execution, cache state)
 * - `trace`: Very detailed information (variable substitution, file-level operations)
 */
export const logger = {
    error: (message: string, ...args: unknown[]) => log(TraceLevel.Error, message, ...args),
    warn: (message: string, ...args: unknown[]) => log(TraceLevel.Warn, message, ...args),
    info: (message: string, ...args: unknown[]) => log(TraceLevel.Info, message, ...args),
    debug: (message: string, ...args: unknown[]) => log(TraceLevel.Debug, message, ...args),
    trace: (message: string, ...args: unknown[]) => log(TraceLevel.Trace, message, ...args),
    dispose: () => {
        outputChannel?.dispose();
        outputChannel = undefined;
    }
};
