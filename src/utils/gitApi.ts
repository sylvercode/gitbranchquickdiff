import * as vscode from 'vscode';
import { API, GitExtension, Repository } from '../externals/git';

export async function getGitAPI(): Promise<API | undefined> {
    try {
        const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
        if (gitExtension) {
            const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
            return git.getAPI(1);
        }
    } catch (error) {
        console.error('Failed to get git API:', error);
    }

    return undefined;
}

export async function getGitRepository(workspaceUri?: vscode.Uri): Promise<Repository | undefined> {
    const gitAPI = await getGitAPI();
    if (!gitAPI) {
        return undefined;
    }

    if (workspaceUri) {
        const repo = gitAPI.getRepository(workspaceUri);
        if (repo) {
            return repo;
        }
    }

    return gitAPI.repositories.length > 0 ? gitAPI.repositories[0] : undefined;
}
