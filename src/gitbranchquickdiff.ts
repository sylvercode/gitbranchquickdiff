import * as vscode from 'vscode';
import { GitExtension, Repository } from './git';
import * as vscodeVariables from './vscode-variables';

export const EXTENTION_NAME = 'gitbranchquickdiff';

const ENABLED_CONFIG_NAME = 'enabled';
const REF_CONFIG_NAME = 'ref';

class GdqbQuickDiffProviderInfo {
    constructor(public baseProvideOriginalResourceFunc: vscode.QuickDiffProvider["provideOriginalResource"] | undefined) {

    }
}

class GdqbGitInfo {
    readonly patchedQuickDiffProviderMap = new WeakMap<vscode.QuickDiffProvider, GdqbQuickDiffProviderInfo>();
    onDidOpenRepositoryRegistered = false;
};

const registeredGitExtention = new WeakMap<GitExtension, GdqbGitInfo>();

export function activate(context: vscode.ExtensionContext) {
    registerCommands(context);

    registerToGitExtention();
    // Maybe the Git extention is not activated. Register to get notify when it does.
    vscode.extensions.onDidChange(registerToGitExtention);

    console.log("Gdqb activated");
}

function registerCommands(context: vscode.ExtensionContext) {
    registerCommand(context, `${EXTENTION_NAME}.activate`, enableExtention);
    registerCommand(context, `${EXTENTION_NAME}.deactivate`, disableExtention);
    registerCommand(context, `${EXTENTION_NAME}.changeref`, changeRef);
    registerCommand(context, `${EXTENTION_NAME}.defaultref`, resetRefToDefault);
}

function registerToGitExtention() {
    const gitExport = getGitExport();
    if (!gitExport) {
        return;
    }

    // Check if we already registered to the Gir Extention
    let gdqbGitInfo = registeredGitExtention.get(gitExport);
    if (!gdqbGitInfo) {
        gdqbGitInfo = new GdqbGitInfo();
        registeredGitExtention.set(gitExport, gdqbGitInfo);

        // In case the extention is not enabled, register to get notify when it does
        gitExport.onDidChangeEnablement(registerToGitExtention);
    }

    if (!gitExport.enabled) {
        console.log("Git not enabled");
        return;
    }

    if (gdqbGitInfo.onDidOpenRepositoryRegistered) {
        return;
    }

    gitExport.getAPI(1)?.onDidOpenRepository(onOpenRepository);
    gdqbGitInfo.onDidOpenRepositoryRegistered = true;

    console.log("Git onDidOpenRepository registered");
}

function onOpenRepository(repository: Repository) {
    const gitInfo = getGitInfo();
    if (!gitInfo) {
        throw new Error("Rerpository opened without registering to git.");
    }

    const baseQuickDiffProvider = getGitQuickDiffProviderFromUndocumentedRepositoryApi(repository);
    if (!gitInfo.patchedQuickDiffProviderMap.has(baseQuickDiffProvider)) {
        const quickDiffProviderInfo = new GdqbQuickDiffProviderInfo(baseQuickDiffProvider.provideOriginalResource);
        gitInfo.patchedQuickDiffProviderMap.set(baseQuickDiffProvider, quickDiffProviderInfo);

        baseQuickDiffProvider.provideOriginalResource = provideOriginalResource;

        console.log("QuickDiffProvider Overrrided.");
    }
}

function getGitQuickDiffProviderFromUndocumentedRepositoryApi(repository: Repository) {
    const undocumentedRepository = (repository as any).repository;
    if (!undocumentedRepository ||
        undocumentedRepository.provideOriginalResource === undefined) {
        throw new Error("Faild to get QuickDiffProvider from undocumented git repository.");
    }
    return undocumentedRepository as vscode.QuickDiffProvider;
}

function getGitInfo() {
    const gitExport = getGitExport();
    if (!gitExport) {
        return;
    }

    return registeredGitExtention.get(gitExport);
}

function getGitExport() {
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!gitExtension?.isActive) {
        return;
    }

    return gitExtension.exports;
}

function getGitAPI() {
    const gitExport = getGitExport();
    if (!gitExport?.enabled) {
        return;
    }

    return gitExport.getAPI(1);
}

function registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) {
    context.subscriptions.push(
        vscode.commands.registerCommand(command, callback, thisArg));
}

function enableExtention() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update(ENABLED_CONFIG_NAME, true, false);
}

function disableExtention() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update(ENABLED_CONFIG_NAME, false, false);
}

function resetRefToDefault() {
    vscode.workspace.getConfiguration(EXTENTION_NAME).update(REF_CONFIG_NAME, undefined, false);
}

async function changeRef() {
    const input = await vscode.window.showInputBox({
        title: 'ref'
    });

    if (input) {
        vscode.workspace.getConfiguration(EXTENTION_NAME).update(REF_CONFIG_NAME, input, false);
    }
}

function provideOriginalResource(this: vscode.QuickDiffProvider, uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Uri> {
    const gbqdEnabled = vscode.workspace.getConfiguration(EXTENTION_NAME).get(ENABLED_CONFIG_NAME);
    if (gbqdEnabled) {
        const gbqdRef = vscodeVariables.variables(vscode.workspace.getConfiguration(EXTENTION_NAME).get<string>(REF_CONFIG_NAME) ?? "");
        if (gbqdRef?.length) {
            return getGitAPI()?.toGitUri(uri, gbqdRef);
        }
    }

    const gitInfo = getGitInfo();
    if (!gitInfo) {
        throw new Error("Rerpository opened without registering to git.");
    }

    const repoInfo = gitInfo.patchedQuickDiffProviderMap.get(this);
    if (!repoInfo) {
        throw new Error("Original resource asked whithout registering to repository.");
    }

    if (!repoInfo.baseProvideOriginalResourceFunc) {
        return undefined;
    }

    return repoInfo.baseProvideOriginalResourceFunc(uri, token);
}
