import * as vscode from 'vscode';
import * as process from 'process';
import * as path from 'path';

export function variables(str: string, recursive = false) {
    let workspaces = vscode.workspace.workspaceFolders;
    let workspace = workspaces?.length ? workspaces[0] : null;
    let activeFile = vscode.window.activeTextEditor?.document;
    let absoluteFilePath = activeFile?.uri.fsPath;
    str = str.replace(/\${workspaceFolder}/g, workspace?.uri.fsPath ?? "");
    str = str.replace(/\${workspaceFolderBasename}/g, workspace?.name ?? "");
    str = str.replace(/\${file}/g, absoluteFilePath ?? "");
    let activeWorkspace = workspace;
    let relativeFilePath = absoluteFilePath;
    if (workspaces && absoluteFilePath) {
        for (let workspace of workspaces) {
            if (absoluteFilePath.replace(workspace.uri.fsPath, '') !== absoluteFilePath) {
                activeWorkspace = workspace;
                relativeFilePath = absoluteFilePath.replace(workspace.uri.fsPath, '').substr(path.sep.length);
                break;
            }
        }
    }
    let parsedPath = path.parse(absoluteFilePath ?? "");
    str = str.replace(/\${fileWorkspaceFolder}/g, activeWorkspace?.uri.fsPath ?? "");
    str = str.replace(/\${relativeFile}/g, relativeFilePath ?? "");
    str = str.replace(/\${relativeFileDirname}/g, relativeFilePath?.substr(0, relativeFilePath.lastIndexOf(path.sep)) ?? "");
    str = str.replace(/\${fileBasename}/g, parsedPath.base);
    str = str.replace(/\${fileBasenameNoExtension}/g, parsedPath.name);
    str = str.replace(/\${fileExtname}/g, parsedPath.ext);
    str = str.replace(/\${fileDirname}/g, parsedPath.dir.substr(parsedPath.dir.lastIndexOf(path.sep) + 1));
    str = str.replace(/\${cwd}/g, parsedPath.dir);
    str = str.replace(/\${pathSeparator}/g, path.sep);
    const linenb = (vscode.window.activeTextEditor?.selection.start.line ?? -1 + 1);
    str = str.replace(/\${lineNumber}/g, '' + linenb);
    str = str.replace(/\${selectedText}/g, vscode.window.activeTextEditor?.document.getText(new vscode.Range(vscode.window.activeTextEditor.selection.start, vscode.window.activeTextEditor.selection.end)) ?? "");
    str = str.replace(/\${env:(.*?)}/g, function (variable) {
        const varname = variable.match(/\${env:(.*?)}/);
        if (varname) {
            return process.env[varname[1]] || '';
        }
        return '';
    });
    str = str.replace(/\${config:(.*?)}/g, function (variable) {
        const varname = variable.match(/\${config:(.*?)}/);
        if (varname) {
            return vscode.workspace.getConfiguration().get(varname[1], '');
        }
        return '';
    });

    if (recursive && str.match(/\${(workspaceFolder|workspaceFolderBasename|fileWorkspaceFolder|relativeFile|fileBasename|fileBasenameNoExtension|fileExtname|fileDirname|cwd|pathSeparator|lineNumber|selectedText|env:(.*?)|config:(.*?))}/)) {
        str = variables(str, recursive);
    }
    return str;
};
