import * as vscode from 'vscode';
import { Status } from '../externals/git';
import { l10n } from './l10n';

export enum ExtendedStatus {
    INDEX_MODIFIED,
    INDEX_ADDED,
    INDEX_DELETED,
    INDEX_RENAMED,
    INDEX_COPIED,

    MODIFIED,
    DELETED,
    UNTRACKED,
    IGNORED,
    INTENT_TO_ADD,
    INTENT_TO_RENAME,
    TYPE_CHANGED,

    ADDED_BY_US,
    ADDED_BY_THEM,
    DELETED_BY_US,
    DELETED_BY_THEM,
    BOTH_ADDED,
    BOTH_DELETED,
    BOTH_MODIFIED,

    RESTORED
}

export enum DisplayMode {
    List = 'list',
    Tree = 'tree'
}

export const DIFF_BADGE_SUFFIX = '⁺';

export function toExtendedStatus(status: Status): ExtendedStatus {
    return status as unknown as ExtendedStatus;
}

export function getStatusText(status: ExtendedStatus): string {
    switch (status) {
        case ExtendedStatus.INDEX_MODIFIED:
        case ExtendedStatus.MODIFIED:
            return 'M';
        case ExtendedStatus.INDEX_ADDED:
        case ExtendedStatus.INTENT_TO_ADD:
            return 'A';
        case ExtendedStatus.INDEX_DELETED:
        case ExtendedStatus.DELETED:
        case ExtendedStatus.DELETED_BY_THEM:
        case ExtendedStatus.DELETED_BY_US:
            return 'D';
        case ExtendedStatus.INDEX_RENAMED:
        case ExtendedStatus.INTENT_TO_RENAME:
            return 'R';
        case ExtendedStatus.INDEX_COPIED:
            return 'C';
        case ExtendedStatus.TYPE_CHANGED:
            return 'T';
        case ExtendedStatus.UNTRACKED:
            return 'U';
        case ExtendedStatus.IGNORED:
            return 'I';
        case ExtendedStatus.ADDED_BY_US:
        case ExtendedStatus.ADDED_BY_THEM:
        case ExtendedStatus.BOTH_ADDED:
            return 'A';
        case ExtendedStatus.BOTH_DELETED:
            return 'D';
        case ExtendedStatus.BOTH_MODIFIED:
            return 'M';
        case ExtendedStatus.RESTORED:
            return 'O';
        default:
            return '?';
    }
}

export function getStatusColor(status: ExtendedStatus): vscode.ThemeColor {
    switch (status) {
        case ExtendedStatus.INDEX_MODIFIED:
        case ExtendedStatus.MODIFIED:
        case ExtendedStatus.TYPE_CHANGED:
        case ExtendedStatus.INTENT_TO_RENAME:
        case ExtendedStatus.BOTH_MODIFIED:
            return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
        case ExtendedStatus.RESTORED:
            return new vscode.ThemeColor('diffEditor.unchangedRegionForeground');
        case ExtendedStatus.INDEX_ADDED:
        case ExtendedStatus.INTENT_TO_ADD:
        case ExtendedStatus.ADDED_BY_US:
        case ExtendedStatus.ADDED_BY_THEM:
        case ExtendedStatus.BOTH_ADDED:
            return new vscode.ThemeColor('gitDecoration.addedResourceForeground');
        case ExtendedStatus.INDEX_DELETED:
        case ExtendedStatus.DELETED:
        case ExtendedStatus.DELETED_BY_THEM:
        case ExtendedStatus.DELETED_BY_US:
        case ExtendedStatus.BOTH_DELETED:
            return new vscode.ThemeColor('gitDecoration.deletedResourceForeground');
        case ExtendedStatus.INDEX_RENAMED:
        case ExtendedStatus.INDEX_COPIED:
            return new vscode.ThemeColor('gitDecoration.renamedResourceForeground');
        case ExtendedStatus.UNTRACKED:
            return new vscode.ThemeColor('gitDecoration.untrackedResourceForeground');
        case ExtendedStatus.IGNORED:
            return new vscode.ThemeColor('gitDecoration.ignoredResourceForeground');
        default:
            return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
    }
}

export function getStatusTooltip(status: ExtendedStatus): string {
    let tooltip: string;
    switch (status) {
        case ExtendedStatus.INDEX_MODIFIED:
        case ExtendedStatus.MODIFIED:
            tooltip = l10n('status.modified');
            break;
        case ExtendedStatus.INDEX_ADDED:
        case ExtendedStatus.INTENT_TO_ADD:
            tooltip = l10n('status.added');
            break;
        case ExtendedStatus.INDEX_DELETED:
        case ExtendedStatus.DELETED:
        case ExtendedStatus.DELETED_BY_THEM:
        case ExtendedStatus.DELETED_BY_US:
            tooltip = l10n('status.deleted');
            break;
        case ExtendedStatus.INDEX_RENAMED:
        case ExtendedStatus.INTENT_TO_RENAME:
            tooltip = l10n('status.renamed');
            break;
        case ExtendedStatus.INDEX_COPIED:
            tooltip = l10n('status.copied');
            break;
        case ExtendedStatus.TYPE_CHANGED:
            tooltip = l10n('status.typeChanged');
            break;
        case ExtendedStatus.UNTRACKED:
            tooltip = l10n('status.untracked');
            break;
        case ExtendedStatus.IGNORED:
            tooltip = l10n('status.ignored');
            break;
        case ExtendedStatus.ADDED_BY_US:
            tooltip = l10n('status.addedByUs');
            break;
        case ExtendedStatus.ADDED_BY_THEM:
            tooltip = l10n('status.addedByThem');
            break;
        case ExtendedStatus.BOTH_ADDED:
            tooltip = l10n('status.bothAdded');
            break;
        case ExtendedStatus.BOTH_DELETED:
            tooltip = l10n('status.bothDeleted');
            break;
        case ExtendedStatus.BOTH_MODIFIED:
            tooltip = l10n('status.bothModified');
            break;
        case ExtendedStatus.RESTORED:
            tooltip = l10n('status.restored');
            break;
        default:
            tooltip = l10n('status.unknown');
            break;
    }

    return `${tooltip}${DIFF_BADGE_SUFFIX}`;
}
