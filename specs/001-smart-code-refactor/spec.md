# Feature Specification: SMART Code Refactor and Source Reorganization

**Feature Branch**: `001-smart-code-refactor`  
**Created**: 2026-03-23  
**Status**: Draft  
**Input**: User description: "I want to refactor the code of project. There is two big file changesTreeView.ts and gitbranchquickdiff.ts that has no clear responsability. Use the best pattern of SMART to make somethiong clean. Folder can be created in src and move any file in this folder to a sub folder to make the overall projec clear."

## Clarifications

### Session 2026-03-23

- Q: How deep should the subfolder hierarchy be under `src/`? → A: Shallow — one level of subfolders (e.g., `src/commands/`, `src/quickdiff/`, `src/views/`, `src/utils/`)
- Q: Where should cross-cutting concerns (localization, status mapping, logging) be placed? → A: In a dedicated `src/utils/` shared subfolder
- Q: Should `extension.ts` remain the sole activation entry point or should bootstrapping be distributed? → A: Single entry point — `extension.ts` delegates to extracted domain modules
- Q: Should very small extractions (~50 lines or fewer) get their own file or be grouped? → A: Pragmatic threshold — extractions under ~50 lines may be grouped with a closely related module in the same domain folder
- Q: Should subfolders use barrel `index.ts` files or direct file imports? → A: Barrel files — each subfolder has an `index.ts` re-exporting its public API; consumers import from the folder

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clarify Module Responsibilities (Priority: P1)

As a maintainer, I want each source module to have one clear responsibility so I can find and modify behavior without reading oversized mixed-purpose files.

**Why this priority**: Responsibility clarity is the foundation for all future maintenance, bug fixing, and feature work.

**Independent Test**: Review source structure and module descriptions to verify each module has a single purpose and no duplicate ownership of the same behavior.

**Acceptance Scenarios**:

1. **Given** the existing codebase has two large mixed-responsibility files, **When** the refactor is completed, **Then** each extracted module has a clearly named purpose and ownership boundary.
2. **Given** a maintainer needs to locate logic for a specific behavior, **When** they inspect the source tree, **Then** they can identify the owning module without scanning unrelated logic.

---

### User Story 2 - Organize Source by Feature Area (Priority: P2)

As a contributor, I want the source folder grouped into understandable subfolders so I can navigate the project quickly and add changes in the correct place.

**Why this priority**: Clear folder organization reduces onboarding time and lowers risk of placing new logic in inappropriate locations.

**Independent Test**: Validate that source files are grouped into meaningful subfolders with consistent naming and predictable placement rules.

**Acceptance Scenarios**:

1. **Given** the source folder is currently mostly flat, **When** the reorganization is complete, **Then** files are grouped into subfolders by purpose and existing source files are moved accordingly.
2. **Given** a new contributor opens the project, **When** they browse the source tree, **Then** they can understand where to place new logic for commands, tree rendering, git interaction, and shared utilities.

---

### User Story 3 - Define SMART Refactor Outcomes (Priority: P3)

As a project owner, I want refactor outcomes to be specific, measurable, achievable, relevant, and time-bounded so we can verify that cleanup work delivered real maintainability value.

**Why this priority**: SMART framing ensures refactoring is outcome-driven rather than subjective cleanup.

**Independent Test**: Compare resulting architecture and project documentation against defined measurable outcomes.

**Acceptance Scenarios**:

1. **Given** refactor goals are documented, **When** implementation work is reviewed, **Then** each goal can be evaluated against explicit success measures.
2. **Given** maintainers perform a post-refactor review, **When** they evaluate structure and boundaries, **Then** they can determine whether target outcomes were met without relying on personal preference.

### Edge Cases

- What happens when behavior currently shared between the two large files appears to belong to multiple future modules?
- How does the project handle compatibility when file moves alter import paths and command wiring relationships?
- What happens when a moved module becomes too small or too tightly coupled to justify standalone placement?
- Cross-cutting concerns (logging, localization, shared status mapping) are placed in `src/utils/` to avoid circular ownership. If a utility evolves to serve only one domain, it may be relocated during review.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST split oversized mixed-responsibility source files into smaller modules where each module has one primary responsibility. Extractions under approximately 50 lines may be grouped with a closely related module in the same domain folder rather than requiring a standalone file.
- **FR-002**: The project MUST define and apply explicit responsibility boundaries for command handling, quick diff behavior, tree view composition, state management, and git interaction concerns.
- **FR-003**: The source structure MUST be reorganized into a shallow (one-level) hierarchy of clearly named subfolders directly under the source root (e.g., `commands/`, `quickdiff/`, `views/`, `utils/`) to reflect feature areas and shared concerns. No deeper nesting is required.
- **FR-004**: Existing user-visible behavior MUST remain functionally equivalent after refactoring and file movement.
- **FR-005**: The refactor MUST preserve command registration coverage so all previously available commands remain discoverable and executable. `extension.ts` MUST remain the single activation entry point, delegating to domain modules for command, provider, and state setup.
- **FR-006**: The refactor MUST preserve support for multi-repository workflows, including repository selection, provider registration, and refresh behavior.
- **FR-007**: The project MUST preserve compatibility of localization usage across moved modules.
- **FR-008**: The project MUST include maintainable module-level ownership guidance so contributors can determine where future changes belong.
- **FR-009**: The project MUST define SMART-aligned refactor objectives and map each objective to at least one verifiable outcome.
- **FR-010**: The project MUST include a migration-safe path for internal file movement so import relationships remain valid across the reorganized source tree. Each subfolder MUST expose an `index.ts` barrel file re-exporting its public API; consumers MUST import from the folder rather than from specific internal files.

### Key Entities *(include if feature involves data)*

- **Module Responsibility Boundary**: Defines the single primary concern owned by a module and what is explicitly out of scope for that module.
- **Source Folder Domain**: Logical grouping of modules under the source root (for example, command orchestration, providers, view models, shared utilities).
- **Refactor Objective**: A SMART-aligned objective statement tied to at least one measurable maintainability outcome.
- **Behavioral Parity Check**: Verifiable record that key existing behaviors remain available after reorganization.

### Assumptions

- The scope focuses on internal architecture and source layout clarity, not introducing new end-user features.
- Existing extension behavior and command semantics are expected to remain unchanged from the user perspective.
- The project can accept file moves and import path updates within the same source root.
- Current maintainers will validate behavioral parity using existing workflows after refactor completion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The two identified oversized files are each reduced to focused responsibilities, with no single refactored source file exceeding 40% of its original line count unless justified by a single concern.
- **SC-002**: At least 90% of source files under the source root are located in named subfolders aligned to documented responsibility domains.
- **SC-003**: 100% of previously available extension commands remain executable in manual verification after refactor.
- **SC-004**: Maintainers can locate the owning module for key behaviors (command registration, quick diff source resolution, tree node composition, and state persistence) in under 2 minutes per behavior during review.
- **SC-005**: Post-refactor maintainability review confirms all defined SMART objectives have measurable evidence and no unresolved ownership ambiguity for core behaviors.

## SMART Objective Traceability

| Success Criterion | Objective | Evidence path | Measurement note |
|---|---|---|---|
| SC-001 | Reduce oversized mixed-responsibility files into focused modules. | `specs/001-smart-code-refactor/quickstart.md` line-count evidence table, `docs/architecture.md` responsibility domains, `src/commands/`, `src/quickdiff/`, `src/views/`, `src/utils/` | Measure each original file against its replacement modules. The largest replacement for `gitbranchquickdiff.ts` and `changesTreeView.ts` must remain below 40% of the original line count unless explicitly justified. |
| SC-002 | Move runtime source into named responsibility domains under `src/`. | `docs/architecture.md` source layout, `src/commands/`, `src/quickdiff/`, `src/views/`, `src/utils/`, `src/externals/` | Count runtime source files under `src/` and confirm that the large majority reside inside a named domain folder rather than the root. |
| SC-003 | Preserve behavior and command availability after the refactor. | `specs/001-smart-code-refactor/quickstart.md` manual verification checklist, `src/commands/registerCommands.ts`, `package.json` command contributions | Command parity is verified by matching command registrations to the existing contribution surface and by running the manual verification checklist. |
| SC-004 | Make ownership of key behaviors quickly locatable. | `docs/architecture.md` navigation examples, `specs/001-smart-code-refactor/quickstart.md` timed ownership-locatability checklist | Time four lookup tasks: command registration, quick diff source resolution, tree node composition, and workspace-state persistence. Each lookup must complete in under 2 minutes. |
| SC-005 | Produce a reviewable and auditable maintainability outcome. | `docs/architecture.md`, `specs/001-smart-code-refactor/contracts/module-contracts.md`, `specs/001-smart-code-refactor/quickstart.md` | Reviewers should be able to map a core behavior to one owning module and one evidence path without subjective interpretation. |
