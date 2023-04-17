# GitBranchQuickDiff README

Change the VSCode diff gutter to use another git ref as original file.

## Features

Specify any git ref (the default is the branch name `main`) as the original file for VSCode what lines are modified in the current editor.

Use commands `Use GitBranchQuickDiff` and `Use VSCode default quick diff` to toggle betweens the new diff gutter and the default diff gutter in your worspace settings.

Set the git ref to use in your workspace settings with `Set quick diff ref` and reset the ref define in your user settings with `Use default quick diff ref`.

## Requirements

This extention need Git.

## Extension Settings

Activate the use of ref in diff gutter with `gitbranchquickdiff.enabled` setting.

Set the ref to use with `gitbranchquickdiff.ref`.

## Known Issues

Sometime, when toggling back to VSCode default behavior, the windows need to be reloaded.

## Release Notes

### 0.1.0

Initial release of GitBranchQuickDiff
