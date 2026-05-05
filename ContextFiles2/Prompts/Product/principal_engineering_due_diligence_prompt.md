# Task: Principal Engineering Due Diligence & Discovery

You are a principal engineer. Perform initial due diligence and discovery for the requested features below. Produce a complete, implementation-ready document for product and junior engineers. No handwaving—every point must be fully explained.

## Inputs
- Repo root: `/mnt/c/Projects/ReallyGlobal`
- Project structure:
  - `RG-Frontend/` (Next.js 13 pages router)
  - `Lumy-Backend/` (Django 4.2)
  - `ContextFiles/` (architecture/reference docs)
- Feature requests:
  - Update Therapist URLs
  - Suicide Hotline Pages
  - Nav Bar UX/UI improvements

## Required BRDs (HumanDocuments)
Use the BRDs in `ContextFiles/HumanDocuments/Features/` (and `_extracted/` text versions if present) as the primary source of truth.
- `ContextFiles/HumanDocuments/Features/BRD - Update Therapist URLs.docx`
- `ContextFiles/HumanDocuments/Features/_extracted/BRD - Update Therapist URLs.txt`
- `ContextFiles/HumanDocuments/Features/BRD - Global Suicide & Crisis Hotline Pages - English V2.docx`
- `ContextFiles/HumanDocuments/Features/_extracted/BRD - Global Suicide & Crisis Hotline Pages - English V2.txt`
- `ContextFiles/HumanDocuments/Features/Improved Navigation.docx`
- `ContextFiles/HumanDocuments/Features/_extracted/Improved Navigation.txt`

## Requirements
- Identify what exists today and what’s missing for each feature.
- Cite exact files/paths where relevant (use clickable paths like `RG-Frontend/src/pages/...`).
- If a dependency or data model is missing, explain exactly what must be added.
- Provide clear next steps with sequence and ownership assumptions.
- The document must be detailed enough that:
  - Product understands scope, impacts, and constraints.
  - A junior engineer can start implementation with minimal questions.

## Deliverable (Markdown)
Produce a report with these sections per feature:

1) Overview
   - What the feature is
   - User goals
   - Success criteria (concrete, measurable)

2) Current State
   - Existing UI/UX elements
   - Existing backend endpoints, data models, services
   - Existing state management/data flow
   - Related configs, env vars, feature flags

3) Gaps / Missing Pieces
   - UI gaps
   - API gaps
   - Data/model gaps
   - Infra/config gaps
   - Security/auth gaps
   - Analytics/telemetry gaps

4) Proposed Implementation
   - Frontend changes (routes, components, state, data fetching)
   - Backend changes (models, migrations, serializers, views, permissions)
   - API contracts (request/response shapes, errors)
   - Data flow (from UI to persistence)
   - Edge cases and failure modes

5) Dependencies & Risks
   - External services
   - Performance considerations
   - Privacy/compliance
   - Migration concerns

6) Testing Plan
   - Backend tests (what, where, how)
   - Frontend checks (lint/typecheck/build)
   - Manual QA checklist

7) Estimate & Sequencing
   - Suggested milestones
   - Order of work
   - Parallelization opportunities

## Notes
- If anything is ambiguous, call it out explicitly and propose questions.
- Prefer accuracy over brevity; explain why each recommendation is made.
