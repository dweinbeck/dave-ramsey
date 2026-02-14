---
phase: quick/1-rebrand-envelope-budgeting-app-to-stash
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - README.md
  - docs/FRD.md
  - docs/TECHNICAL_DESIGN.md
  - docs/DEPLOYMENT.md
  - .planning/PROJECT.md
autonomous: true

must_haves:
  truths:
    - "All references to 'Digital Envelopes' have been replaced with 'Stash'"
    - "Package name reflects the new branding"
    - "Documentation consistently refers to 'Stash' as the app name"
  artifacts:
    - path: "package.json"
      provides: "Package metadata with updated name and repository URL"
      contains: "stash"
    - path: "README.md"
      provides: "Project README with Stash branding"
      contains: "# Stash"
    - path: "docs/FRD.md"
      provides: "Functional requirements using Stash terminology"
      contains: "Stash"
    - path: ".planning/PROJECT.md"
      provides: "Project documentation using Stash branding"
      contains: "# Stash"
  key_links:
    - from: "package.json"
      to: "README.md"
      via: "consistent branding"
      pattern: "stash"
    - from: "docs/*.md"
      to: ".planning/PROJECT.md"
      via: "consistent terminology"
      pattern: "Stash"
---

<objective>
Rebrand the envelope budgeting app from "Digital Envelopes" to "Stash".

Purpose: Update all app name references throughout the codebase to reflect the new "Stash" branding. This ensures consistency across package metadata, documentation, and planning files.

Output: Fully rebranded codebase with "Stash" as the app name, replacing all instances of "Digital Envelopes" and updating the package name from "dave-ramsey" to "stash".
</objective>

<execution_context>
@/Users/dweinbeck/.claude/get-shit-done/workflows/execute-plan.md
@/Users/dweinbeck/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/dweinbeck/ai/dave-ramsey/package.json
@/Users/dweinbeck/ai/dave-ramsey/README.md
@/Users/dweinbeck/ai/dave-ramsey/docs/FRD.md
@/Users/dweinbeck/ai/dave-ramsey/docs/TECHNICAL_DESIGN.md
@/Users/dweinbeck/ai/dave-ramsey/docs/DEPLOYMENT.md
@/Users/dweinbeck/ai/dave-ramsey/.planning/PROJECT.md
@/Users/dweinbeck/ai/dave-ramsey/CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update package metadata and repository name references</name>
  <files>package.json</files>
  <action>
Update package.json to rebrand from "dave-ramsey" to "stash":
- Change `name` field from "dave-ramsey" to "stash"
- Update `description` to reference "Stash" as the app name
- Update `repository.url` to reflect new repo name (git+https://github.com/dweinbeck/stash.git)
- Update `bugs.url` to use new repo name (https://github.com/dweinbeck/stash/issues)
- Update `homepage` to use new repo name (https://github.com/dweinbeck/stash#readme)

Do NOT modify version, scripts, dependencies, or devDependencies.
  </action>
  <verify>
cat package.json | grep -E '"name"|"description"|"repository"|"bugs"|"homepage"'
Verify all references to "dave-ramsey" are replaced with "stash"
  </verify>
  <done>package.json contains "stash" as package name and all repository URLs reference the stash repo</done>
</task>

<task type="auto">
  <name>Task 2: Update core documentation (README, FRD, TECHNICAL_DESIGN, DEPLOYMENT)</name>
  <files>README.md, docs/FRD.md, docs/TECHNICAL_DESIGN.md, docs/DEPLOYMENT.md</files>
  <action>
Replace all instances of "Digital Envelopes" with "Stash" in the following files:

**README.md:**
- Update title from "# Digital Envelopes" to "# Stash"
- Replace "Digital Envelopes is" with "Stash is" in Description section
- Replace "Digital Envelopes targets" with "Stash targets"
- Update directory path in Project Structure from "dave-ramsey/" to "stash/"
- Keep all technical content, examples, and structure intact — only rebrand the app name

**docs/FRD.md:**
- Replace "Digital Envelopes" with "Stash" in all scenario descriptions (S1, S2, S3, S4, etc.)
- Keep all functional requirements, user personas, and scenarios intact
- Only change the app name references

**docs/TECHNICAL_DESIGN.md:**
- Replace "Digital Envelopes is" with "Stash is" in System Architecture section
- Update directory path from "dave-ramsey/" to "stash/" in Directory Structure
- Keep all technical architecture, patterns, and implementation details intact

**docs/DEPLOYMENT.md:**
- Replace "Digital Envelopes is" with "Stash is" in Overview section
- Update "dave-ramsey repository" references to "stash repository"
- Keep all deployment instructions, environment variables, and configuration intact
  </action>
  <verify>
grep -l "Digital Envelopes" README.md docs/*.md
# Should return no results

grep -l "Stash" README.md docs/*.md
# Should return all four files

grep -l "dave-ramsey/" README.md docs/*.md
# Should return no results (replaced with stash/)
  </verify>
  <done>All user-facing documentation uses "Stash" branding consistently, with no remaining "Digital Envelopes" references</done>
</task>

<task type="auto">
  <name>Task 3: Update planning documentation</name>
  <files>.planning/PROJECT.md</files>
  <action>
Update .planning/PROJECT.md to use "Stash" branding:
- Replace "# Digital Envelopes" with "# Stash" in the title
- Replace all instances of "Digital Envelopes" in the "What This Is" section and throughout the document
- Keep all requirements, current state, context, and technical details intact
- Only change app name references from "Digital Envelopes" to "Stash"

Note: Do NOT update historical planning files in .planning/phases/, .planning/milestones/, or .planning/research/ — these are historical records and should remain as-is. Only update the main PROJECT.md file which serves as the current project overview.
  </action>
  <verify>
grep "Digital Envelopes" .planning/PROJECT.md
# Should return no results

head -n 1 .planning/PROJECT.md
# Should show "# Stash"
  </verify>
  <done>.planning/PROJECT.md uses "Stash" branding consistently while preserving all project state and requirements</done>
</task>

</tasks>

<verification>
After completing all tasks, verify the rebrand is complete:

1. **Package consistency:**
   ```bash
   cat package.json | jq '.name, .repository.url, .bugs.url, .homepage'
   ```
   All should reference "stash"

2. **Documentation consistency:**
   ```bash
   grep -r "Digital Envelopes" README.md docs/ .planning/PROJECT.md
   ```
   Should return no results

3. **New branding present:**
   ```bash
   grep -r "^# Stash" README.md .planning/PROJECT.md
   ```
   Should return two matches (one in each file)

4. **Build still passes:**
   ```bash
   npm run build
   ```
   Should complete with no errors (package name change doesn't affect TypeScript compilation)
</verification>

<success_criteria>
- All instances of "Digital Envelopes" replaced with "Stash" in package.json, README.md, docs/*.md, and .planning/PROJECT.md
- Package name changed from "dave-ramsey" to "stash" in package.json
- Repository URLs updated to reference github.com/dweinbeck/stash
- Directory path references updated from "dave-ramsey/" to "stash/"
- Build passes with no TypeScript errors
- Historical planning documentation (.planning/phases/, .planning/milestones/, .planning/research/) left untouched
- CLAUDE.md project instructions remain intact (mentions "dave-ramsey" as legacy repo context)
</success_criteria>

<output>
After completion, create `.planning/quick/1-rebrand-envelope-budgeting-app-to-stash/1-SUMMARY.md`
</output>
