export { getGitAPI, getGitRepository } from './gitApi';
export { initLocalization, l10n } from './l10n';
export { logger } from './logger';
export {
    DIFF_BADGE_SUFFIX,
    DisplayMode,
    ExtendedStatus,
    getStatusColor,
    getStatusText,
    getStatusTooltip,
    toExtendedStatus
} from './statusHelpers';
export {
    DEFAULT_ACTION_CONFIG_NAME,
    DEFAULT_DEFAULT_ACTION,
    DEFAULT_DISPLAY_MODE,
    DEFAULT_ENABLED,
    DEFAULT_REF,
    DEFAULT_SUBMODULE_DISPLAY,
    DISPLAY_MODE_CONFIG_NAME,
    EXTENSION_NAME as EXTENTION_NAME,
    getCurrentDefaultAction,
    getCurrentDisplayMode,
    getCurrentEnabled,
    getCurrentRef,
    getCurrentSubmoduleDisplay,
    getRawRef,
    MAX_RECENT_REFS,
    migrateWorkspaceState,
    REF_CONFIG_NAME,
    SUBMODULE_DISPLAY_CONFIG_NAME,
    WORKSPACE_STATE_KEY_DEFAULT_ACTION,
    WORKSPACE_STATE_KEY_DISPLAY_MODE,
    WORKSPACE_STATE_KEY_ENABLED,
    WORKSPACE_STATE_KEY_RECENT_REFS,
    WORKSPACE_STATE_KEY_REF,
    WORKSPACE_STATE_KEY_REFS,
    WORKSPACE_STATE_KEY_SUBMODULE_DISPLAY
} from './workspaceState';
export { clearTagCache, variables as vscodeVariables } from './vscodeVariables';
