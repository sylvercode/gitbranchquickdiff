import { execFile } from 'child_process';
import * as path from 'path';
import * as process from 'process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { Repository } from '../externals/git';
import { logger } from './logger';

const execFileAsync = promisify(execFile);

const lastTagCache = new Map<string, { tag: string; headCommit: string; timestamp: number }>();

function getCacheTTL(): number {
    const minutes = vscode.workspace.getConfiguration('gitbranchquickdiff').get<number>('tagCacheTTL', 1);
    return minutes === 0 ? Infinity : minutes * 60000;
}

export function variables(gitRepo: Repository, str: string, recursive = false) {
    logger.trace('Variable substitution started for:', str);
    return processVariables(gitRepo, str, recursive);
}

export function clearTagCache() {
    lastTagCache.clear();
}

async function processVariables(gitRepo: Repository, str: string, recursive = false): Promise<string> {
    const workspaces = vscode.workspace.workspaceFolders;
    const workspace = workspaces?.length ? workspaces[0] : null;
    const activeFile = vscode.window.activeTextEditor?.document;
    const absoluteFilePath = activeFile?.uri.fsPath;

    str = str.replace(/\${workspaceFolder}/g, workspace?.uri.fsPath ?? '');
    str = str.replace(/\${workspaceFolderBasename}/g, workspace?.name ?? '');
    str = str.replace(/\${file}/g, absoluteFilePath ?? '');

    let activeWorkspace = workspace;
    let relativeFilePath = absoluteFilePath;
    if (workspaces && absoluteFilePath) {
        for (const workspaceFolder of workspaces) {
            if (absoluteFilePath.replace(workspaceFolder.uri.fsPath, '') !== absoluteFilePath) {
                activeWorkspace = workspaceFolder;
                relativeFilePath = absoluteFilePath.replace(workspaceFolder.uri.fsPath, '').slice(path.sep.length);
                break;
            }
        }
    }

    const parsedPath = path.parse(absoluteFilePath ?? '');
    str = str.replace(/\${fileWorkspaceFolder}/g, activeWorkspace?.uri.fsPath ?? '');
    str = str.replace(/\${relativeFile}/g, relativeFilePath ?? '');
    str = str.replace(/\${relativeFileDirname}/g, relativeFilePath?.slice(0, relativeFilePath.lastIndexOf(path.sep)) ?? '');
    str = str.replace(/\${fileBasename}/g, parsedPath.base);
    str = str.replace(/\${fileBasenameNoExtension}/g, parsedPath.name);
    str = str.replace(/\${fileExtname}/g, parsedPath.ext);
    str = str.replace(/\${fileDirname}/g, parsedPath.dir.slice(parsedPath.dir.lastIndexOf(path.sep) + 1));
    str = str.replace(/\${cwd}/g, parsedPath.dir);
    str = str.replace(/\${pathSeparator}/g, path.sep);

    const lineNumber = ((vscode.window.activeTextEditor?.selection.start.line ?? -1) + 1);
    str = str.replace(/\${lineNumber}/g, `${lineNumber}`);
    str = str.replace(/\${selectedText}/g, vscode.window.activeTextEditor?.document.getText(new vscode.Range(vscode.window.activeTextEditor.selection.start, vscode.window.activeTextEditor.selection.end)) ?? '');
    str = str.replace(/\${env:(.*?)}/g, function (variable) {
        const variableName = variable.match(/\${env:(.*?)}/);
        if (variableName) {
            return process.env[variableName[1]] || '';
        }
        return '';
    });
    str = str.replace(/\${config:(.*?)}/g, function (variable) {
        const variableName = variable.match(/\${config:(.*?)}/);
        if (variableName) {
            return vscode.workspace.getConfiguration().get(variableName[1], '');
        }
        return '';
    });

    const lastTagMatches = str.matchAll(/\${git:lastTag(?::([^}]+))?}/g);
    for (const match of lastTagMatches) {
        let lastTag = '';
        const pattern = match[1];

        if (gitRepo && gitRepo.state.HEAD?.commit) {
            try {
                const currentHeadCommit = gitRepo.state.HEAD.commit;
                const cacheKey = `${gitRepo.rootUri.fsPath}:${pattern || 'all'}:${currentHeadCommit}`;
                const cached = lastTagCache.get(cacheKey);
                const now = Date.now();
                const cacheTTL = getCacheTTL();

                if (cached && (now - cached.timestamp) < cacheTTL && cached.headCommit === currentHeadCommit) {
                    lastTag = cached.tag;
                } else {
                    try {
                        const args = ['describe', '--tags', '--abbrev=0'];
                        if (pattern) {
                            args.push(`--match=${pattern}`);
                        }

                        logger.debug('Running git describe with args:', args.join(' '));
                        const { stdout } = await execFileAsync('git', args, {
                            cwd: gitRepo.rootUri.fsPath,
                            timeout: 5000
                        });

                        lastTag = stdout.trim();
                        logger.debug('Git describe result:', lastTag);
                    } catch (error: any) {
                        if (error.code !== 128) {
                            logger.warn(`git describe failed: ${error.message}`);
                        }
                    }

                    lastTagCache.set(cacheKey, { tag: lastTag, headCommit: currentHeadCommit, timestamp: now });
                }
            } catch (error) {
                logger.error('Failed to get last tag:', error);
            }
        }

        str = str.replace(match[0], lastTag);
    }

    if (gitRepo && gitRepo.state.HEAD?.upstream) {
        const upstream = gitRepo.state.HEAD.upstream;
        const trackingBranch = `${upstream.remote}/${upstream.name}`;
        str = str.replace(/\${git:track}/g, trackingBranch);
    }

    let pushBranch = '';
    if (gitRepo && gitRepo.state.HEAD) {
        try {
            const branchName = gitRepo.state.HEAD.name;
            if (branchName) {
                const pushRemote = await gitRepo.getConfig(`branch.${branchName}.pushRemote`);
                const pushBranchName = await gitRepo.getConfig(`branch.${branchName}.push`);

                if (pushRemote && pushBranchName) {
                    pushBranch = `${pushRemote}/${pushBranchName}`;
                } else if (gitRepo.state.HEAD.upstream) {
                    const upstream = gitRepo.state.HEAD.upstream;
                    pushBranch = `${upstream.remote}/${upstream.name}`;
                }
            }
        } catch (error) {
            logger.error('Failed to get push branch:', error);
        }
    }
    str = str.replace(/\${git:push}/g, pushBranch);

    if (recursive && str.match(/\${(workspaceFolder|workspaceFolderBasename|fileWorkspaceFolder|relativeFile|fileBasename|fileBasenameNoExtension|fileExtname|fileDirname|cwd|pathSeparator|lineNumber|selectedText|env:(.*?)|config:(.*?)|git:(lastTag(?::[^}]+)?|track|push))}/)) {
        str = await processVariables(gitRepo, str, recursive);
    }

    logger.trace('Variable substitution result:', str);
    return str;
}
