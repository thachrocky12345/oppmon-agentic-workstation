# TAG-43: Skill Definition Framework

## Description

**Suggested Points:** 8 (High — implementing YAML frontmatter parser, intent-based trigger matching, skill loader/registry, and SKILL.md format validation; foundational for skill ecosystem)

## Objective

Implement a skill definition framework inspired by phd-ai-cybersec-skills, featuring YAML frontmatter metadata, intent-based trigger matching (not command syntax), structured SKILL.md format, and a skill registry for dynamic loading and discovery.

## Requirements

### Skill Definition Format (SKILL.md)

```yaml
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
---

# Literature Review

## Process

### Phase 1: Scope the Review
...

## Anti-patterns to Flag
- Listing papers chronologically instead of thematically
- Generating fake citations
...

## Deliverables
- Structured corpus table
- Synthesis by theme
- Gap analysis
```

### YAML Frontmatter Schema

```typescript
interface SkillFrontmatter {
  name: string              // lowercase-kebab-case
  description: string       // 200-300 words, contains trigger phrases
  version: string           // semver
  author: string            // team or individual
  category: SkillCategory   // research | security | development | operations
  triggers: string[]        // 5-8 explicit trigger phrases
  tags: string[]            // searchable tags
  dependencies?: string[]   // other skills this requires
  mandatoryTools?: string[] // tools always available when skill active
}

type SkillCategory =
  | 'research'
  | 'security'
  | 'development'
  | 'operations'
  | 'compliance'
  | 'automation'
```

### Intent-Based Trigger Matching

```typescript
/**
 * Trigger matching is intent-based, not command-based.
 * No /skill-name syntax required — Claude matches description to request.
 */
class TriggerMatcher {
  private skills: Map<string, SkillDefinition> = new Map()
  private embeddings: Map<string, number[]> = new Map()

  async matchSkills(userMessage: string): Promise<MatchedSkill[]> {
    const matches: MatchedSkill[] = []

    // Strategy 1: Exact trigger phrase matching
    for (const [name, skill] of this.skills) {
      for (const trigger of skill.triggers) {
        if (userMessage.toLowerCase().includes(trigger.toLowerCase())) {
          matches.push({
            skill: name,
            confidence: 1.0,
            matchType: 'exact',
            matchedTrigger: trigger,
          })
          break
        }
      }
    }

    // Strategy 2: Semantic similarity to description
    const messageEmbedding = await this.embed(userMessage)
    for (const [name, skill] of this.skills) {
      const descEmbedding = this.embeddings.get(name)!
      const similarity = cosineSimilarity(messageEmbedding, descEmbedding)

      if (similarity > 0.75) {
        const existing = matches.find(m => m.skill === name)
        if (!existing) {
          matches.push({
            skill: name,
            confidence: similarity,
            matchType: 'semantic',
          })
        }
      }
    }

    // Sort by confidence, return top matches
    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
  }
}
```

### Skill Loader & Registry

```typescript
class SkillRegistry {
  private skills: Map<string, LoadedSkill> = new Map()
  private watcher: FSWatcher | null = null

  async loadFromDirectory(skillsDir: string): Promise<void> {
    const skillFiles = await glob(`${skillsDir}/**/SKILL.md`)

    for (const file of skillFiles) {
      const content = await fs.readFile(file, 'utf-8')
      const { frontmatter, body } = parseFrontmatter(content)

      // Validate frontmatter schema
      const validated = validateSkillFrontmatter(frontmatter)
      if (!validated.valid) {
        console.warn(`Invalid skill ${file}: ${validated.errors}`)
        continue
      }

      const skill: LoadedSkill = {
        path: file,
        frontmatter: validated.data,
        body,
        loadedAt: new Date(),
      }

      this.skills.set(validated.data.name, skill)
    }

    // Pre-compute embeddings for semantic matching
    await this.computeEmbeddings()
  }

  enableHotReload(): void {
    this.watcher = watch(this.skillsDir, async (eventType, filename) => {
      if (filename?.endsWith('SKILL.md')) {
        await this.reloadSkill(filename)
        this.emit('skill:reloaded', filename)
      }
    })
  }

  getSkill(name: string): LoadedSkill | undefined {
    return this.skills.get(name)
  }

  listSkills(category?: SkillCategory): SkillSummary[] {
    return Array.from(this.skills.values())
      .filter(s => !category || s.frontmatter.category === category)
      .map(s => ({
        name: s.frontmatter.name,
        description: s.frontmatter.description.slice(0, 200),
        category: s.frontmatter.category,
        triggers: s.frontmatter.triggers,
      }))
  }
}
```

### Skill Body Parser

```typescript
interface ParsedSkillBody {
  sections: SkillSection[]
  antiPatterns: string[]
  deliverables: string[]
  examples: Example[]
}

interface SkillSection {
  title: string
  level: number  // 1-6 for h1-h6
  content: string
  subsections: SkillSection[]
}

function parseSkillBody(markdown: string): ParsedSkillBody {
  const ast = parseMarkdown(markdown)

  // Extract sections by heading level
  const sections = extractSections(ast)

  // Find anti-patterns section
  const antiPatternsSection = sections.find(s =>
    s.title.toLowerCase().includes('anti-pattern') ||
    s.title.toLowerCase().includes('pitfall') ||
    s.title.toLowerCase().includes('avoid')
  )
  const antiPatterns = antiPatternsSection
    ? extractListItems(antiPatternsSection.content)
    : []

  // Find deliverables section
  const deliverablesSection = sections.find(s =>
    s.title.toLowerCase().includes('deliverable') ||
    s.title.toLowerCase().includes('output')
  )
  const deliverables = deliverablesSection
    ? extractListItems(deliverablesSection.content)
    : []

  // Extract code examples
  const examples = extractCodeBlocks(ast)

  return { sections, antiPatterns, deliverables, examples }
}
```

## Implementation Notes
- Backend: New `packages/skill-framework/` package
- Frontend: Skill browser UI in admin
- CLI: `tag skill list`, `tag skill validate`, `tag skill test`
- Database: skills table with frontmatter fields, body stored as text

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/skill-framework/src/__tests__/frontmatter.test.ts` | `parses valid YAML frontmatter` | All fields extracted |
| `packages/skill-framework/src/__tests__/frontmatter.test.ts` | `rejects missing required fields` | Validation error |
| `packages/skill-framework/src/__tests__/frontmatter.test.ts` | `validates name is kebab-case` | Reject camelCase |
| `packages/skill-framework/src/__tests__/trigger.test.ts` | `matches exact trigger phrase` | Confidence 1.0 |
| `packages/skill-framework/src/__tests__/trigger.test.ts` | `matches semantic similarity` | Confidence > 0.75 |
| `packages/skill-framework/src/__tests__/trigger.test.ts` | `returns top 3 matches sorted` | Correct order |
| `packages/skill-framework/src/__tests__/registry.test.ts` | `loads skills from directory` | All skills loaded |
| `packages/skill-framework/src/__tests__/registry.test.ts` | `hot reloads on file change` | Skill updated |
| `packages/skill-framework/src/__tests__/parser.test.ts` | `extracts anti-patterns section` | List items found |
| `packages/skill-framework/src/__tests__/parser.test.ts` | `extracts deliverables` | List items found |

### Test Coverage Requirements
- 100% coverage on frontmatter validation
- All trigger matching strategies tested
- Edge cases for malformed SKILL.md files

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `skill loading` | Skills directory | 1. Load all 2. Query | All accessible |
| `trigger matching` | 5 skills loaded | 1. "help me review literature" | literature-review matched |
| `semantic matching` | Skills with embeddings | 1. Novel phrasing | Correct skill matched |
| `hot reload` | Skill loaded | 1. Edit file 2. Wait | Skill updated |
| `validation` | Invalid SKILL.md | 1. Load | Error logged, skipped |
| `category filtering` | Mixed skills | 1. List research only | Only research skills |

### End-to-End Flows
- User message → Trigger matching → Skill loaded → Context injected → Response
- Skill file edited → Hot reload → New version active

## Acceptance Criteria
1. YAML frontmatter parser with schema validation
2. Intent-based trigger matching (exact + semantic)
3. Skill registry with hot reload support
4. SKILL.md body parser extracting sections
5. Anti-patterns and deliverables extraction
6. Category-based skill filtering
7. CLI commands for skill management
8. Embedding pre-computation for semantic matching

## Review Checklist
- [ ] Is frontmatter schema well-documented?
- [ ] Does trigger matching have reasonable latency (<100ms)?
- [ ] Are embeddings cached and persisted?
- [ ] Does hot reload handle concurrent access?
- [ ] Are invalid skills gracefully skipped?
- [ ] Is the SKILL.md format documented for skill authors?

## Dependencies
- Depends on: Day 36 (Memory for embeddings), Day 37 (Tool system)
- Blocks: Day 44 (Skill templates), Day 47 (Security guardrails)

## Risk Factors
- **Trigger collision** — Mitigation: Confidence scoring, disambiguation UI
- **Embedding drift** — Mitigation: Re-embed on skill update
- **Hot reload race** — Mitigation: Read-write locks on registry
- **Large skill set** — Mitigation: Lazy loading, category filtering
