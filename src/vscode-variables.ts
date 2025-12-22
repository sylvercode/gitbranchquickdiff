import * as vscode from 'vscode';
import * as process from 'process';
import * as path from 'path';
import { Repository, RefType } from './git';

export function variables(gitRepo: Repository, str: string, recursive = false) {
    return processVariables(gitRepo, str, recursive);
}

async function processVariables(gitRepo: Repository, str: string, recursive = false): Promise<string> {
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

    // ${git:lastTag} - get the last tag
    // ${git:lastTag:RegEx} - get the last tag matching regex
    const lastTagMatches = str.matchAll(/\${git:lastTag(?::([^}]+))?}/g);
    for (const match of lastTagMatches) {
        let lastTag = '';
        const regexPattern = match[1]; // Capture the optional regex pattern

        if (gitRepo) {
            try {
                const tags = await gitRepo.getRefs({ pattern: 'refs/tags' });

                if (regexPattern) {
                    // Filter tags by regex pattern
                    try {
                        const regex = new RegExp(regexPattern);
                        const filteredTags = tags.filter(tag => tag.name && regex.test(tag.name));
                        if (filteredTags.length > 0 && filteredTags[0].name) {
                            lastTag = filteredTags[0].name!;
                        }
                    } catch (regexError) {
                        console.error('Invalid regex pattern for git:lastTag:', regexError);
                    }
                } else {
                    // No regex, use the last tag
                    if (tags.length > 0 && tags[0].name) {
                        lastTag = tags[0].name;
                    }
                }
            } catch (error) {
                console.error('Failed to get last tag:', error);
            }
        }

        str = str.replace(match[0], lastTag);
    }

    // ${git:track} - get the tracking branch
    if (gitRepo && gitRepo.state.HEAD?.upstream) {
        const upstream = gitRepo.state.HEAD.upstream;
        const trackingBranch = `${upstream.remote}/${upstream.name}`;
        str = str.replace(/\${git:track}/g, trackingBranch);
    }

    // ${git:push} - get the push branch
    let pushBranch = '';
    if (gitRepo && gitRepo.state.HEAD) {
        try {
            // Get push remote and branch from git config
            const branchName = gitRepo.state.HEAD.name;
            if (branchName) {
                const pushRemote = await gitRepo.getConfig(`branch.${branchName}.pushRemote`);
                const pushBranchName = await gitRepo.getConfig(`branch.${branchName}.push`);

                if (pushRemote && pushBranchName) {
                    pushBranch = `${pushRemote}/${pushBranchName}`;
                } else if (gitRepo.state.HEAD.upstream) {
                    // Fallback to upstream if push is not explicitly configured
                    const upstream = gitRepo.state.HEAD.upstream;
                    pushBranch = `${upstream.remote}/${upstream.name}`;
                }
            }
        } catch (error) {
            console.error('Failed to get push branch:', error);
        }
    }
    str = str.replace(/\${git:push}/g, pushBranch);

    if (recursive && str.match(/\${(workspaceFolder|workspaceFolderBasename|fileWorkspaceFolder|relativeFile|fileBasename|fileBasenameNoExtension|fileExtname|fileDirname|cwd|pathSeparator|lineNumber|selectedText|env:(.*?)|config:(.*?)|git:(lastTag(?::[^}]+)?|track|push))}/)) {
        str = await processVariables(gitRepo, str, recursive);
    }
    return str;
};
