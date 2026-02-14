---
phase: quick/1-rebrand-envelope-budgeting-app-to-stash
plan: 1
subsystem: documentation
tags: [rebrand, documentation, package-metadata]
dependency_graph:
  requires: []
  provides: [stash-branding]
  affects: [package.json, documentation, planning-docs]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - package.json
    - README.md
    - docs/FRD.md
    - docs/TECHNICAL_DESIGN.md
    - docs/DEPLOYMENT.md
    - .planning/PROJECT.md
decisions: []
metrics:
  duration_minutes: 3
  completed_date: 2026-02-13
---

# Quick Task 1: Rebrand from Digital Envelopes to Stash

**One-liner:** Rebranded entire codebase from "Digital Envelopes" to "Stash" including package metadata, core documentation, and project planning files.

## Objective

Rebrand the envelope budgeting app from "Digital Envelopes" to "Stash" across all user-facing and developer-facing documentation, ensuring consistency in package metadata, documentation, and planning files.

## What Was Done

### Task 1: Package Metadata Update
- Changed package name from "dave-ramsey" to "stash" in package.json
- Updated package description to reference Stash
- Updated all repository URLs from `github.com/dweinbeck/dave-ramsey` to `github.com/dweinbeck/stash`
- Updated bugs and homepage URLs to match new repo name
- Commit: `52554ba`

### Task 2: Core Documentation Rebrand
- **README.md**: Updated title to "# Stash", replaced all "Digital Envelopes" references with "Stash", changed directory structure path from `dave-ramsey/` to `stash/`
- **docs/FRD.md**: Replaced all instances of "Digital Envelopes" with "Stash" across scenarios, requirements, and workflows
- **docs/TECHNICAL_DESIGN.md**: Updated system architecture description and directory structure to use Stash branding and `stash/` paths
- **docs/DEPLOYMENT.md**: Replaced "Digital Envelopes" with "Stash" in overview and all repo references
- Commit: `584523c`

### Task 3: Planning Documentation Update
- **PROJECT.md**: Updated title from "# Digital Envelopes" to "# Stash", replaced all app name references throughout the document
- Historical planning files in `.planning/phases/`, `.planning/milestones/`, and `.planning/research/` deliberately left unchanged as historical records
- Commit: `54a6c12`

## Verification Results

### Package Consistency
```bash
$ cat package.json | jq '.name, .repository.url, .bugs.url, .homepage'
"stash"
"git+https://github.com/dweinbeck/stash.git"
"https://github.com/dweinbeck/stash/issues"
"https://github.com/dweinbeck/stash#readme"
```
✓ All package.json fields reference "stash"

### Documentation Consistency
```bash
$ grep -r "Digital Envelopes" README.md docs/ .planning/PROJECT.md
# No results
```
✓ No "Digital Envelopes" references remain in target files

### New Branding Present
```bash
$ grep -r "^# Stash" README.md .planning/PROJECT.md
README.md:# Stash
.planning/PROJECT.md:# Stash
```
✓ Stash branding present in all main documentation files

### Build and Tests
```bash
$ npm run build
# TypeScript compilation succeeded with no errors

$ npm test
# 88 tests passed (3 test files)
```
✓ Build passes with no TypeScript errors
✓ All tests pass

## Deviations from Plan

None - plan executed exactly as written.

## Impact

- All user-facing documentation now consistently refers to "Stash" as the app name
- Package metadata correctly reflects the new branding and repository name
- Project structure documentation updated to reference `stash/` directory paths
- Historical planning documentation preserved as-is to maintain project history

## Self-Check: PASSED

### Created Files
No new files were created by this task.

### Modified Files
```bash
$ [ -f "/Users/dweinbeck/ai/dave-ramsey/package.json" ] && echo "FOUND: package.json" || echo "MISSING: package.json"
FOUND: package.json

$ [ -f "/Users/dweinbeck/ai/dave-ramsey/README.md" ] && echo "FOUND: README.md" || echo "MISSING: README.md"
FOUND: README.md

$ [ -f "/Users/dweinbeck/ai/dave-ramsey/docs/FRD.md" ] && echo "FOUND: docs/FRD.md" || echo "MISSING: docs/FRD.md"
FOUND: docs/FRD.md

$ [ -f "/Users/dweinbeck/ai/dave-ramsey/docs/TECHNICAL_DESIGN.md" ] && echo "FOUND: docs/TECHNICAL_DESIGN.md" || echo "MISSING: docs/TECHNICAL_DESIGN.md"
FOUND: docs/TECHNICAL_DESIGN.md

$ [ -f "/Users/dweinbeck/ai/dave-ramsey/docs/DEPLOYMENT.md" ] && echo "FOUND: docs/DEPLOYMENT.md" || echo "MISSING: docs/DEPLOYMENT.md"
FOUND: docs/DEPLOYMENT.md

$ [ -f "/Users/dweinbeck/ai/dave-ramsey/.planning/PROJECT.md" ] && echo "FOUND: .planning/PROJECT.md" || echo "MISSING: .planning/PROJECT.md"
FOUND: .planning/PROJECT.md
```
✓ All modified files exist

### Commits
```bash
$ git log --oneline --all | grep -q "52554ba" && echo "FOUND: 52554ba" || echo "MISSING: 52554ba"
FOUND: 52554ba

$ git log --oneline --all | grep -q "584523c" && echo "FOUND: 584523c" || echo "MISSING: 584523c"
FOUND: 584523c

$ git log --oneline --all | grep -q "54a6c12" && echo "FOUND: 54a6c12" || echo "MISSING: 54a6c12"
FOUND: 54a6c12
```
✓ All task commits exist in git history

## Next Steps

None - this was a standalone quick task. The rebrand is complete and all documentation is consistent with the new "Stash" branding.
