# GitBranchQuickDiff README

Change the VSCode diff gutter to use another git ref as original file.

## Features

Specify any git ref (the default is the branch named `main`) as the original file to use by VSCode to detect what lines are modified in the current editor.

Use commands `Use GitBranchQuickDiff` and `Use VSCode default quick diff` to toggle betweens the new diff gutter and the default diff gutter in your workspace settings.

Set the git ref to use in your workspace settings with `Set quick diff ref` and reset the ref defined in your user settings with `Revert quick diff ref to user setting`.

## Requirements

This extension need Git.

## Extension Settings

Activate the use of ref in diff gutter with `gitbranchquickdiff.enabled` setting.

Set the ref to use with `gitbranchquickdiff.ref`.

## Known Issues

Sometime, when toggling back to VSCode default behavior, the windows need to be reloaded.

## Release Notes

### 0.1.0

Initial release of GitBranchQuickDiff

### 0.1.1

BUG Correction
Enabled setting default is now `on`.
