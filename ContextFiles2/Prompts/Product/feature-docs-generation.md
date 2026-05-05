# Prompt: Product Feature Traceability Docs

You are an agent in `C:\Projects\ReallyGlobal`. Your task is to turn human product feature requirements into traceable documentation that lets other agents map a product term to code.

## Scope and inputs
- Primary input folder: `C:\Projects\ReallyGlobal\ContextFiles\HumanDocuments\Features`
- Also consider existing docs and code to discover additional features in use.
- If a feature appears in code or docs but is not in the new features list, document it too.

## Deliverables (write markdown files)

### 1) Master indexes
- `ContextFiles/ProductFeatures/product-features-index.md`
  - Master list of product features (human-facing), each linking to its product doc.
- `ContextFiles/ProductFeatures/product-modules-index.md`
  - Master list of product modules (domain areas), each linking to its module doc.

### 2) Product feature docs
- One file per feature at:
  - `ContextFiles/ProductFeatures/features/<feature-name>.md`
- Each doc must include:
  - Purpose (plain language)
  - User journey / key actions
  - Glossary terms used in UI and docs
  - Entry points (screens/routes/API endpoints)
  - Data entities involved (if known)
  - Cross-links to technical docs

### 3) Technical feature docs
- One file per feature at:
  - `ContextFiles/ProductFeatures/technical/<feature-name>-technical.md`
- Each doc must include:
  - Screens/routes
  - Frontend components/modules
  - Backend apps/modules
  - APIs / GraphQL operations
  - Key files and directories
  - Tests (if any)
  - Config/env flags (if any)
  - Known risks or open questions

## Rules
- Use clear file names (kebab-case).
- Prefer linking to existing source files rather than duplicating content.
- Keep each doc concise; add links to code and docs for detail.
- Only include claims you can trace to a file or code reference.
- If unsure, mark as “Unknown” and add a TODO line.

## Process
- Read all feature lists in `ContextFiles\HumanDocuments\Features`.
- Scan code and docs to discover additional features in use.
- Create or update the two master indexes.
- Create or update product + technical docs for each feature.

## Output requirements
- Report: list of new/updated files + a short summary of what features were added.
- Do not include secrets or environment values.
