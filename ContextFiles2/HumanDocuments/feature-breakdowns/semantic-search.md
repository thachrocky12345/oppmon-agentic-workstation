# Feature: Semantic Search ("Symantec Search")

## Overview
This feature improves provider search relevance using semantic matching. The BRD is minimal and requires the Loom and a linked Google Doc for actual requirements.

## Why it exists
Current search likely relies on literal or category matching. Semantic search is intended to improve discovery and matching quality by understanding intent.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Semantic Search.txt`
- BRD points to a Loom video and a "Default Sort" Google Doc; no written requirements are included in the text file.

## Current state (repo)
- Azure Cognitive Search is implemented in backend:
  - Query: `Lumy-Backend/apps/care_provider/queries.py` (`AzureCognitiveSearchQuery.search_care_provider`).
  - Mutation: `Lumy-Backend/apps/care_provider/mutations.py` (`AzureCognitiveSearchMutation`).
  - GraphQL wiring: `Lumy-Backend/apps/graphqlapp/queries.py`.
- No explicit frontend search integration is identified in the repo for semantic search.

## Missing pieces
- Product requirements from the Loom and Google Doc (ranking logic, UX rules, filters).
- Frontend integration path (search bar, SERP behavior, fallback logic).
- Instrumentation for search relevance and conversion.

## Next steps
1. Review Loom + Default Sort doc to capture ranking and UX requirements.
2. Define search contract: inputs, filters, response shape.
3. Locate or implement frontend search entry points using Azure search query.
4. Add telemetry for search conversions and relevance diagnostics.
