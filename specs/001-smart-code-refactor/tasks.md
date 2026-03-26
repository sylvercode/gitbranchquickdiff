# Tasks: SMART Code Refactor and Source Reorganization

**Input**: Design documents from `/specs/001-smart-code-refactor/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/module-contracts.md, quickstart.md

**Tests**: No automated test tasks included. This feature uses manual verification per `quickstart.md` and constitution guidance.

**Organization**: Tasks are grouped by user story to enable independent implementation and validation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the target folder and module surface needed for the refactor.

- [x] T001 Create target source folders `src/commands/`, `src/quickdiff/`, `src/views/`, `src/utils/`, and `src/externals/`
- [x] T002 Create barrel files `src/commands/index.ts`, `src/quickdiff/index.ts`, `src/views/index.ts`, and `src/utils/index.ts`
- [x] T003 Move external type definitions from `src/git.d.ts` and `src/vscode.proposed.quickDiffProvider.d.ts` to `src/externals/git.d.ts` and `src/externals/vscode.proposed.quickDiffProvider.d.ts` without content changes
- [x] T004 Update type import paths in `src/gitbranchquickdiff.ts`, `src/changesTreeView.ts`, and `src/vscode-variables.ts` to reference `src/externals/` after T003 completes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract cross-cutting utilities that all feature modules depend on.

**CRITICAL**: Complete this phase before starting user story phases.

- [x] T005 Extract localization helpers into `src/utils/l10n.ts` from `src/l10n.ts`
- [x] T006 Extract Git extension API wrapper into `src/utils/gitApi.ts` from `src/gitApi.ts`
- [x] T007 Extract VS Code variable substitution logic into `src/utils/vscodeVariables.ts` from `src/vscode-variables.ts`
- [x] T008 Extract status mapping helpers into `src/utils/statusHelpers.ts` from `src/changesTreeView.ts`
- [x] T009 Extract workspace state constants/getters/migration into `src/utils/workspaceState.ts` from `src/gitbranchquickdiff.ts`
- [x] T010 Update and finalize utility exports in `src/utils/index.ts` for all shared utility APIs
- [x] T011 Update utility imports in `src/gitbranchquickdiff.ts` and `src/changesTreeView.ts` to consume `src/utils/index.ts`

**Checkpoint**: Shared utilities are stable and importable from a single utility barrel.

---

## Phase 3: User Story 1 - Clarify Module Responsibilities (Priority: P1) 🎯 MVP

**Goal**: Split oversized mixed-responsibility files into focused modules with single ownership boundaries.

**Independent Test**: A maintainer can locate ownership for command registration, quick diff resolution, tree composition, and workspace state without scanning unrelated logic.

### Implementation for User Story 1

- [x] T012 [P] [US1] Extract tree node classes (`RepositoryNode`, `DirectoryNode`, `ChangedFile`, `MessageItem`) into `src/views/nodes.ts`
- [x] T013 [P] [US1] Extract tree building and compact-folder logic into `src/views/treeBuilder.ts`
- [x] T014 [P] [US1] Extract `ChangesDecorationProvider` into `src/views/decorationProvider.ts`
- [x] T015 [US1] Extract `ChangesTreeDataProvider` and `openChange` into `src/views/changesTreeDataProvider.ts`
- [x] T016 [US1] Extract `MultiRepoTreeDataProvider` into `src/views/multiRepoTreeDataProvider.ts`
- [x] T017 [US1] Finalize public view exports in `src/views/index.ts`
- [x] T018 [P] [US1] Extract `CustomQuickDiffProvider` into `src/quickdiff/quickDiffProvider.ts`
- [x] T019 [P] [US1] Extract `GitBranchQuickDiffContentProvider` and `QUICKDIFF_SCHEME` into `src/quickdiff/contentProvider.ts`
- [x] T020 [US1] Extract provider lifecycle orchestration into `src/quickdiff/providerRegistration.ts`
- [x] T021 [US1] Finalize public quickdiff exports in `src/quickdiff/index.ts`
- [x] T022 [US1] Split command logic into `src/commands/refCommands.ts`, `src/commands/viewCommands.ts`, `src/commands/openCommands.ts`, and `src/commands/restoreCommands.ts`
- [x] T023 [US1] Implement command wiring in `src/commands/registerCommands.ts`
- [x] T024 [US1] Finalize public command exports in `src/commands/index.ts`
- [x] T025 [US1] Replace remaining mixed-responsibility logic in `src/gitbranchquickdiff.ts` and `src/changesTreeView.ts` with extracted modules, migrate all imports, and delete both legacy files once `npm run compile` passes without them

**Checkpoint**: User Story 1 is complete when the two oversized files no longer own unrelated concerns.

---

## Phase 4: User Story 2 - Organize Source by Feature Area (Priority: P2)

**Goal**: Enforce shallow domain-based source organization with predictable placement and imports.

**Independent Test**: A new contributor can identify the correct folder for commands, providers, view logic, and utilities by inspecting the top-level `src/` structure.

### Implementation for User Story 2

- [x] T026 [US2] Update activation flow in `src/extension.ts` to keep single entry-point delegation through `src/commands/index.ts` and `src/quickdiff/index.ts`
- [x] T027 [P] [US2] Convert imports in `src/commands/*.ts` to consume folder barrels (`src/views/index.ts`, `src/utils/index.ts`, `src/quickdiff/index.ts`) where applicable
- [x] T028 [P] [US2] Convert imports in `src/quickdiff/*.ts` and `src/views/*.ts` to consume folder barrels (`src/utils/index.ts`, `src/views/index.ts`) where applicable
- [x] T029 [US2] Remove obsolete root utility files `src/l10n.ts`, `src/gitApi.ts`, and `src/vscode-variables.ts` after migration to `src/utils/`
- [x] T030 [US2] Verify multi-repository and submodule behavior wiring in `src/quickdiff/providerRegistration.ts` and `src/views/multiRepoTreeDataProvider.ts` after file moves
- [x] T031 [US2] Resolve compile-time import and type issues across `src/**/*.ts` using `npm run compile`
- [x] T032 [US2] Verify folder dependency direction across `src/utils/`, `src/views/`, `src/quickdiff/`, and `src/commands/` so no circular imports violate the documented architecture

**Checkpoint**: User Story 2 is complete when all runtime code is organized under domain folders and compiles cleanly.

---

## Phase 5: User Story 3 - Define SMART Refactor Outcomes (Priority: P3)

**Goal**: Make refactor outcomes measurable and auditable against SMART criteria.

**Independent Test**: Reviewer can map each SMART objective to explicit evidence and validate behavioral parity without subjective interpretation.

### Implementation for User Story 3

- [x] T033 [US3] Add SMART objective-to-evidence traceability section in `specs/001-smart-code-refactor/spec.md` for SC-001 through SC-005, including explicit measurement notes for SC-001 and SC-004
- [x] T034 [US3] Update `specs/001-smart-code-refactor/contracts/module-contracts.md` so barrel import examples use folder barrels consistently and reflect the final public API boundaries
- [x] T035 [US3] Update module ownership guidance, target structure details, and navigation examples in `docs/architecture.md` to match extracted modules and use consistent responsibility domain terminology
- [x] T036 [US3] Add a post-refactor behavioral parity evidence checklist to `specs/001-smart-code-refactor/quickstart.md`, including timed ownership-locatability checks and cache/debounce verification
- [x] T037 [US3] Update `.specify/memory/constitution.md` to reflect `src/externals/git.d.ts` and `src/externals/vscode.proposed.quickDiffProvider.d.ts` after the type definition move

**Checkpoint**: User Story 3 is complete when SMART outcomes are documented with verifiable evidence paths.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final quality pass, validation, and cleanup across all stories.

- [x] T038 [P] Remove dead exports and stale references from `src/commands/index.ts`, `src/quickdiff/index.ts`, `src/views/index.ts`, and `src/utils/index.ts`
- [x] T039 Record line-count evidence for `src/gitbranchquickdiff.ts` and `src/changesTreeView.ts` versus their replacement modules to validate SC-001 in `specs/001-smart-code-refactor/quickstart.md`
- [x] T040 Run the manual verification checklist in `specs/001-smart-code-refactor/quickstart.md`, including timed ownership checks for SC-004 and behavior parity validation for SC-003, and record the results
- [x] T041 Run final compile validation with `npm run compile` and address remaining TypeScript issues in `src/**/*.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): no dependencies
- Foundational (Phase 2): depends on Setup completion; blocks all user stories
- User Story 1 (Phase 3): depends on Foundational completion
- User Story 2 (Phase 4): depends on User Story 1 extraction output and Foundational completion
- User Story 3 (Phase 5): depends on User Stories 1 and 2 for objective evidence
- Polish (Phase 6): depends on all user stories being complete

### User Story Dependencies

- US1 (P1): first deliverable and MVP; no dependency on other user stories
- US2 (P2): depends on US1 module split being in place
- US3 (P3): depends on US1 and US2 completion to produce measurable evidence

### Dependency Graph

- Phase 1 -> Phase 2 -> US1 -> US2 -> US3 -> Phase 6

### Task-Specific Dependencies

- T004 depends on T003
- T025 depends on T015-T024 (inline compile step is part of T025; T031 is a separate Phase 4 full-pass compile)
- T032 depends on T026-T031
- T034-T037 depend on T033
- T039-T041 depend on T025 and T032-T037

---

## Parallel Opportunities

- Phase 1: T001 and T002 can run in close sequence before T003-T004
- Phase 2: utility extraction tasks can be split by utility file ownership, then merged via T010/T011
- US1: T012/T013/T014 and T018/T019 are parallelizable before orchestration/wiring tasks
- US2: T027 and T028 are parallelizable because they target different folder groups
- US3: T034 and T037 can run in parallel after T033 establishes the final outcome criteria
- Phase 6: T038 and T039 can run in parallel before T040-T041

### Parallel Example: User Story 1

- Execute T012, T013, and T014 in parallel for view-side primitives
- Execute T018 and T019 in parallel for quickdiff provider classes
- Merge outputs through T015, T016, T020, and T021

### Parallel Example: User Story 2

- Execute T027 for command imports and T028 for quickdiff/views imports in parallel
- Consolidate with T029-T032

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1 and Phase 2
2. Complete US1 extraction and wiring (T012-T025)
3. Validate maintainability checkpoint for ownership clarity
4. Compile and run manual verification subset for core flows

### Incremental Delivery

1. Deliver MVP with US1
2. Add US2 to finalize source organization and import conventions
3. Add US3 documentation and SMART evidence mapping
4. Complete final polish and full manual verification

### Execution Notes

- Keep behavior parity as a hard constraint while moving code
- Prefer small, reviewable commits per task group
- Run `npm run compile` after each major extraction batch to catch import regressions early
- Use the term `responsibility domain` consistently in updated documentation and task outputs
