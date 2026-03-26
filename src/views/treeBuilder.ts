import * as path from 'path';
import * as vscode from 'vscode';
import { ChangedFile, DirectoryNode } from './nodes';

export function buildTree(files: ChangedFile[], rootFsPath: string, parentNode?: DirectoryNode): (DirectoryNode | ChangedFile)[] {
    const parentPath = parentNode?.fullPath ?? '';
    const directoryMap = new Map<string, ChangedFile[]>();
    const rootFiles: ChangedFile[] = [];

    for (const file of files) {
        const relativePath = file.directory;
        if (parentPath && !relativePath.startsWith(parentPath)) {
            continue;
        }

        const remainingPath = parentPath ? relativePath.substring(parentPath.length).replace(/^[\\/]+/, '') : relativePath;
        if (!remainingPath) {
            rootFiles.push(file);
        } else {
            const parts = remainingPath.split(/[\\/]/);
            const immediateDir = parts[0];
            const fullDirPath = parentPath ? `${parentPath}${path.sep}${immediateDir}` : immediateDir;

            if (!directoryMap.has(fullDirPath)) {
                directoryMap.set(fullDirPath, []);
            }
            directoryMap.get(fullDirPath)!.push(file);
        }
    }

    const compactFolders = vscode.workspace.getConfiguration('explorer').get<boolean>('compactFolders', true);
    const directoryNodes: DirectoryNode[] = [];

    for (const [fullPath, filesInDir] of directoryMap.entries()) {
        let displayPath = fullPath;
        const compactedFiles = filesInDir;

        if (compactFolders) {
            let currentPath = fullPath;
            const currentFiles = filesInDir;

            while (true) {
                const subdirs = new Set<string>();
                let filesAtThisLevel = 0;

                for (const file of currentFiles) {
                    const relativePath = file.directory;
                    if (!relativePath.startsWith(currentPath)) {
                        continue;
                    }

                    const remainingPath = relativePath.substring(currentPath.length).replace(/^[\\/]+/, '');
                    if (!remainingPath) {
                        filesAtThisLevel++;
                    } else {
                        subdirs.add(remainingPath.split(/[\\/]/)[0]);
                    }
                }

                if (filesAtThisLevel === 0 && subdirs.size === 1) {
                    currentPath = `${currentPath}${path.sep}${Array.from(subdirs)[0]}`;
                    displayPath = currentPath;
                } else {
                    break;
                }
            }
        }

        const dirName = parentPath ? displayPath.substring(parentPath.length).replace(/^[\\/]+/, '') : displayPath;
        directoryNodes.push(new DirectoryNode(dirName, displayPath, compactedFiles, rootFsPath));
    }

    directoryNodes.sort((a, b) => a.label.localeCompare(b.label));
    rootFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));

    return [...directoryNodes, ...rootFiles];
}
