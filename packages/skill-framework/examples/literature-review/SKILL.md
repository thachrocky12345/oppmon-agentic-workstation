---
name: literature-review
description: |
  Use this skill when the user wants to survey a field, map related work,
  perform gap analysis, understand state of the art, or asks "what has been
  done on [topic]". Also use when building a research corpus or synthesizing
  multiple papers into themes.
version: "1.0.0"
author: team-research
category: research
triggers:
  - "survey a field"
  - "map related work"
  - "gap analysis"
  - "state of the art"
  - "what has been done on"
  - "literature review"
  - "related work section"
tags:
  - research
  - academic
  - writing
dependencies: []
mandatoryTools:
  - semantic-scholar
  - citation-manager
---

# Literature Review

## Process

### Phase 1: Scope the Review

Define your research question and search strategy.

1. Identify key terms and synonyms
2. Define inclusion/exclusion criteria
3. Select databases (Semantic Scholar, Google Scholar, ACM DL)
4. Set time bounds (last N years)

### Phase 2: Build the Corpus

Collect papers systematically and catalog them.

| ID | Citation key | Year | Venue | Type | Method | Dataset | Key claim | Limitations | Status |
|----|--------------|------|-------|------|--------|---------|-----------|-------------|--------|
| 1  | smith2020    | 2020 | NeurIPS | empirical | transformer | ImageNet | SOTA on X | Limited to Y | [READ] |
| 2  | jones2021    | 2021 | ICML | theoretical | analysis | - | Proves bound | Assumes Z | [NOT READ] |

### Phase 3: Synthesize

Identify themes, lineages, and gaps.

- Group papers by argument, not chronology
- Identify research lineages (who cites whom)
- Find gaps in current literature
- Position your work

### Phase 4: Draft Prose

Write the related work section.

## Anti-patterns to Flag

- Listing papers chronologically instead of thematically
- Generating fake citations or making up paper titles
- Citing papers without actually reading them
- Ignoring seminal works in the field
- Over-citing recent work while missing foundational papers

## Deliverables

- Structured corpus table with [READ]/[NOT READ] status
- Synthesis organized by themes
- Gap analysis document
- Research positioning statement
- [DRAFT] Related work section

## Examples

```python
# Search for papers using Semantic Scholar API
from semanticscholar import SemanticScholar

def search_papers(query: str, limit: int = 100) -> list:
    sch = SemanticScholar()
    results = sch.search_paper(query, limit=limit)
    return [
        {
            "title": p.title,
            "year": p.year,
            "citations": p.citationCount,
            "authors": [a.name for a in p.authors]
        }
        for p in results
    ]
```

```markdown
## Related Work [DRAFT v1]

Prior work on adversarial machine learning falls into three main themes:
attack methods, defense mechanisms, and theoretical analysis.

**Attack Methods.** Smith et al. [VERIFY: year?] introduced...
```
