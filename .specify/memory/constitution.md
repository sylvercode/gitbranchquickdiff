<!--
  Sync Impact Report
  ==================
  Version change: N/A → 1.0.0 (initial ratification)
  Modified principles: N/A (first version)

  Added sections:
    - Core Principles (5 principles)
    - Technology Stack & Constraints
    - Development Workflow
    - Governance

  Removed sections: None

  Templates requiring updates:
    - .specify/templates/plan-template.md        ✅ no update needed
    - .specify/templates/spec-template.md         ✅ no update needed
    - .specify/templates/tasks-template.md        ✅ no update needed
    - No commands directory exists                ✅ N/A

  Follow-up TODOs: None
-->

# GitBranchQuickDiff Constitution

## Core Principles

### I. Proposed API Compatibility

The extension depends on VS Code's proposed `quickDiffProvider` API
(`enabledApiProposals: ["quickDiffProvider"]`). This is non-negotiable:

- All code MUST handle potential API instability and track upstream
  changes to the
  [quickDiffProvider proposal](https://github.com/microsoft/vscode/issues/169012).
- The extension MUST NOT be published to the Microsoft Marketplace;
  distribution is via VSIX only.
- Type definitions for the proposed API
  (`vscode.proposed.quickDiffProvider.d.ts`) MUST be kept in sync
  with the targeted VS Code engine version.
- Runtime activation MUST require
  `--enable-proposed-api=sylvercode.gitbranchquickdiff`.

### II. Multi-Repository by Default

Every feature MUST be designed for multi-repository and submodule
scenarios. Single-repository mode is a UX optimization, never the
sole design target.

- Per-repo settings (`ref`, `recentRefs`) MUST be stored as
  `Record<string, T>` keyed by `repo.rootUri.fsPath`.
- Global settings (`enabled`, `displayMode`, `defaultAction`,
  `submoduleDisplay`) MUST apply across all repositories.
- Submodule nesting MUST be supported with configurable display
  modes (`standalone`, `integrated`).
- Dynamic repository add/remove (`onDidOpenRepository`,
  `onDidCloseRepository`) MUST be handled at runtime.
- Workspace state migration MUST convert legacy single-repo
  formats to per-repo maps automatically.

### III. VS Code Extension Conventions

Follow VS Code extension patterns without exception:

- UI contributions (views, commands, menus, configuration) MUST
  be declared in `package.json`.
- Git operations MUST use the built-in Git extension API
  (`vscode.extensions.getExtension('vscode.git')`), not direct
  shell invocations, except where the API lacks required
  functionality (e.g., `git describe` for tag lookups).
- Activation MUST use `onStartupFinished` and wait for Git
  extension state `'initialized'` before registering providers.
- Tree views, file decorations, and commands MUST use standard
  VS Code APIs (`TreeDataProvider`, `FileDecorationProvider`,
  `registerCommand`).

### IV. Performance via State-Based Caching

Cache invalidation MUST be reactive to actual state changes, not
timer-based. Git operations MUST be minimized.

- `diffBetween` cache MUST invalidate only when ref or HEAD
  commit changes.
- `diffWith` cache MUST invalidate only when ref or working tree
  state changes (index/worktree/merge counts).
- Rapid repository state changes MUST be debounced (100ms).
- Tag lookup results MUST be cached with configurable TTL and
  invalidate on HEAD changes or explicit refresh.
- Timer-based cache expiry is acceptable only for tag lookups
  where the upstream state (remote tags) is not observable.

### V. Localization Ready

All user-facing strings MUST go through the l10n system:

- Package manifest strings MUST use `%key%` references resolved
  via `package.nls.json` and locale variants
  (`package.nls.{locale}.json`).
- Runtime strings MUST use `bundle.l10n.json` and locale variants
  (`bundle.l10n.{locale}.json`).
- New user-facing text MUST NOT be hardcoded in TypeScript source
  files; it MUST be added to the appropriate l10n bundle.

## Technology Stack & Constraints

- **Language**: TypeScript (strict mode via `tsconfig.json`)
- **Runtime**: VS Code Extension Host
- **Package Manager**: npm
- **Build Commands**:
  - `npm run watch` — TypeScript watch mode (`tsc -watch -p ./`)
  - `npm run compile` — One-time build (`tsc -p ./`)
- **Proposed API**: `quickDiffProvider` (declared in
  `enabledApiProposals` in `package.json`)
- **Distribution**: VSIX packages via GitHub Releases only
- **Architecture Documentation**: `docs/architecture.md` MUST be
  kept current with any structural changes
- **External Type Definitions**:
  - `src/externals/git.d.ts` — VS Code built-in Git extension types
    (MUST NOT be modified)
  - `src/externals/vscode.proposed.quickDiffProvider.d.ts` — Proposed API
    types (update only when targeting a new VS Code version)

## Development Workflow

- **Testing**: Manual testing only. No automated test framework.
  Manual verification MUST be performed before merging.
- **Architecture Documentation**: Any change to component
  structure, key patterns, or provider lifecycle MUST be reflected
  in `docs/architecture.md` before the change is considered
  complete.
- **Status Enum Safety**: `git.Status` enum has
  `INDEX_MODIFIED=0`; all status checks MUST use
  `!== undefined` (never truthy evaluation).
- **Provider Re-registration**: QuickDiffProviders MUST be
  disposed and re-registered (not updated in-place) on HEAD
  changes and configuration changes.
- **Decoration Conflict Avoidance**: Only diff changes (ref vs
  HEAD) receive explorer decorations. Worktree-only changes MUST
  NOT be decorated to avoid conflicts with the built-in Git
  extension.

## Governance

This constitution is the authoritative reference for all
development decisions on GitBranchQuickDiff. It supersedes
ad-hoc practices and informal conventions.

- **Amendments**: Any change to this constitution MUST be
  documented with a version bump, rationale, and migration plan
  if principles are removed or redefined.
- **Versioning**: Constitution versions follow semantic versioning:
  - MAJOR: Principle removals or backward-incompatible
    redefinitions.
  - MINOR: New principles or materially expanded guidance.
  - PATCH: Clarifications, wording, and non-semantic refinements.
- **Compliance Review**: All pull requests and code reviews MUST
  verify compliance with these principles. Deviations MUST be
  explicitly justified in the PR description.
- **Runtime Guidance**: Use `docs/architecture.md` for detailed
  implementation patterns and component documentation.

**Version**: 1.0.0 | **Ratified**: 2026-03-23 | **Last Amended**: 2026-03-23
