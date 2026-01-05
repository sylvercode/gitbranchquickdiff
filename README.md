# GitBranchQuickDiff

Change the VSCode diff gutter to use another git ref as original file and add a tree view of changes since the ref.

## Proposed API

This extension uses the [quickDiffProvider](https://github.com/microsoft/vscode/issues/169012) VSCode [proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api).

So it cannot be published to the Microsoft Marketplace and must be installed using the `Install from VSIX` command with a [downloaded package](https://github.com/sylvercode/gitbranchquickdiff/releases).

Also `code` must be launched using `--enable-proposed-api=sylvercode.gitbranchquickdiff`; or you can add these lines in your `argv.json` using the `Preferences: Configure Runtime Arguments` command.

```json
"enable-proposed-api": [
   "sylvercode.gitbranchquickdiff"
]
```

## Features

Specify any git ref to use as base to display modifications since. These are shown in:

- New Quick Diff view in SCM panel.
- File coloration in Explorer View, SCM changes view and Editor Tabs.
- Gutter detection in editor of modified files.
- Badges in Explorer View, SCM changes view and Editor Tabs.

Badge decorations and tooltip status from the ref are marked with `⁺`.

Modifications in the current worktree that make them identical to the ref are marked with special status Restored `O⁺`.

A command in the new Quick Diff view restores the file to the ref state (modifications still need to be committed).

The gutter diff inline editor view shows the source of the original file (git worktree or the extension ref) or an editable field to choose the diff original file.

## Variable substitution

While specifying the ref, you can use variable substitution:

### Standard VS Code Variables

- `${workspaceFolderBasename}`

### Environment Variables

- `${env:VAR_NAME}` - Reference environment variables (e.g., `${env:HOME}`)

### Configuration Variables

- `${config:setting.name}` - Reference VS Code settings (e.g., `${config:editor.fontSize}`)

### Git-Specific Variables

- `${git:lastTag}` - The last reachable tag from current HEAD
- `${git:lastTag:RegEx}` - The last reachable tag matching a regex pattern (e.g., `${git:lastTag:^v[0-9].*}` for semver tags starting with 'v')
- `${git:track}` - The tracking branch in format `remote/branch`
- `${git:push}` - The push target branch

### Examples

- Compare with the last tag: `${git:lastTag}`
- Compare with the last version tag: `${git:lastTag:^v[0-9]}`
- Compare with tracking branch: `${git:track}`
- Use a custom environment variable: `${env:MY_BRANCH_REF}`

## Requirements

This extension requires Git.

## Extension Settings

|Name|Description|
|-|-|
|enabled|Use Git Branch Quick Diff as diff gutter instead of VSCode default. The file of the ref will be used as base for the comparison.|
|ref|Name of the ref to use for comparison. Variable substitution can be used.|
|displayMode|Display mode for the changes view: list or tree.|
|defaultAction|Default action when clicking on a changed file: open diff (openChanges) or open file directly (openFile).|
