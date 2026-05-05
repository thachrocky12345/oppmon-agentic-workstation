# TAG-44: Skill Templates & Research Automation

## Description

**Suggested Points:** 8 (High — implementing structured output templates, experiment logging, citation verification, progressive disclosure workflows; enables reproducible research automation)

## Objective

Implement research automation templates and structured output patterns inspired by phd-ai-cybersec-skills, including experiment log templates, citation verification scripts, progressive disclosure workflows with phase gates, and grep-able markers for draft auditing.

## Requirements

### Experiment Log Template

```markdown
# exp-YYYYMMDD-{short-name}

**Hypothesis**: [one sentence - must be stated BEFORE running]
**Status**: planned | running | complete | abandoned
**Tracker run ID**: [wandb/mlflow link]
**Git commit**: [hash]
**Branch**: [feature branch name]

## 1. Setup

### Dataset
- Name:
- Version:
- Split: train/val/test ratio
- Preprocessing:

### Model
- Architecture:
- Parameters:
- Initialization:

### Baselines
| Baseline | Justification |
|----------|---------------|
| | |

### Hyperparameters
| Parameter | Value | Search space |
|-----------|-------|--------------|
| | | |

### Seeds
- Seeds used: [list minimum 3, preferred 5]
- Seed selection: [random | fixed set]

### Compute
- Hardware:
- Total runtime:
- Budget:

## 2. Results

### Headline Table
| Method | Seed | Metric A | Metric B | Metric C |
|--------|------|----------|----------|----------|
| | | | | |

**Best result**: **bold**, statistically-tied: *italic*

### Statistical Test
- Test: [Wilcoxon signed-rank | paired t-test]
- p-value:
- Effect size:
- Confidence level:

### Plots
- [path/to/figure1.png]
- [path/to/figure2.png]

## 3. Observations
[What did you learn? Unexpected behavior? Debugging notes?]

## 4. Threats to Validity
- [ ] Hyperparameter tuning fair across methods
- [ ] Compute budget equal
- [ ] Seeds sufficient
- [ ] Test set not contaminated
- [ ] Baselines are strong (not strawmen)
- [ ] [Domain-specific threats]

## 5. Next Steps
[Follow-up experiments based on findings]

## 6. Artifact Pointers
- Code: [path or URL]
- Config: [path]
- Logs: [path]
- Model checkpoint: [path]
- Raw outputs: [path]
```

### Progressive Disclosure Workflow

```typescript
interface SkillWorkflow {
  name: string
  phases: WorkflowPhase[]
  currentPhase: number
}

interface WorkflowPhase {
  name: string
  description: string
  inputs: string[]
  outputs: string[]
  validationCriteria: string[]
  requiresApproval: boolean  // Must user approve before next phase?
}

// Example: Literature Review Workflow
const literatureReviewWorkflow: SkillWorkflow = {
  name: 'literature-review',
  phases: [
    {
      name: 'Phase 1: Scope the Review',
      description: 'Define research question and search strategy',
      inputs: ['Topic area', 'Time constraints'],
      outputs: ['Research question (1 sentence)', 'Inclusion/exclusion criteria', 'Search strategy'],
      validationCriteria: [
        'Research question is falsifiable or answerable',
        'Criteria are specific enough to apply consistently',
        'Search strategy covers major venues',
      ],
      requiresApproval: true,
    },
    {
      name: 'Phase 2: Build the Corpus',
      description: 'Collect and catalog papers in structured format',
      inputs: ['Approved scope from Phase 1'],
      outputs: ['Structured table of papers'],
      validationCriteria: [
        'No fake citations (all papers exist)',
        'Each paper marked [READ] or [NOT READ]',
        'Table has required columns',
      ],
      requiresApproval: true,
    },
    {
      name: 'Phase 3: Synthesize',
      description: 'Identify themes, lineages, and gaps',
      inputs: ['Corpus table with [READ] papers'],
      outputs: ['Thematic groupings', 'Research gaps', 'Positioning statement'],
      validationCriteria: [
        'Organized by argument, not chronology',
        'Each theme has 3+ supporting papers',
        'Gaps are specific and actionable',
      ],
      requiresApproval: true,
    },
    {
      name: 'Phase 4: Draft Prose',
      description: 'Write related work section',
      inputs: ['Synthesis from Phase 3'],
      outputs: ['[DRAFT] Related work section'],
      validationCriteria: [
        'Section marked [DRAFT v1]',
        'All claims have citations',
        'Positioning is clear',
      ],
      requiresApproval: false,
    },
  ],
  currentPhase: 0,
}
```

### Grep-able Markers for Auditing

```typescript
// Marker types for draft content
const MARKERS = {
  DRAFT: '[DRAFT]',           // Entire section is AI-generated
  DRAFT_VERSION: '[DRAFT vN]', // Versioned draft
  VERIFY: '[VERIFY: reason]', // Specific claim needs verification
  NOT_READ: '[NOT READ]',     // Paper not yet reviewed
  TODO: '[TODO: task]',       // Action item
  VIVA: '[VIVA?]',           // Thesis defense vulnerability
} as const

interface MarkerScanner {
  // Find all markers in content
  scan(content: string): FoundMarker[]

  // Generate audit report
  generateReport(directory: string): AuditReport
}

interface FoundMarker {
  type: keyof typeof MARKERS
  location: { file: string; line: number }
  context: string  // Surrounding text
  reason?: string  // For VERIFY markers
}

// CLI command: tag audit --markers
async function auditMarkers(directory: string): Promise<void> {
  const report = await scanner.generateReport(directory)

  console.log('=== Draft Audit Report ===\n')

  console.log(`[VERIFY] markers: ${report.verify.length}`)
  report.verify.forEach(m => {
    console.log(`  ${m.location.file}:${m.location.line} - ${m.reason}`)
  })

  console.log(`\n[DRAFT] sections: ${report.draft.length}`)
  console.log(`[NOT READ] papers: ${report.notRead.length}`)
  console.log(`[TODO] items: ${report.todo.length}`)
  console.log(`[VIVA?] points: ${report.viva.length}`)
}
```

### Citation Verification

```typescript
interface CitationVerifier {
  // Verify BibTeX file
  verifyBibFile(path: string): VerificationResult

  // Check for common issues
  checkDuplicates(entries: BibEntry[]): BibEntry[]
  checkMissingFields(entries: BibEntry[]): FieldError[]
  checkTodoMarkers(entries: BibEntry[]): BibEntry[]
  checkMalformed(content: string): SyntaxError[]
}

interface VerificationResult {
  valid: boolean
  totalEntries: number
  errors: VerificationError[]
  warnings: VerificationWarning[]
}

// Required fields by entry type
const REQUIRED_FIELDS: Record<string, string[]> = {
  article: ['author', 'title', 'journal', 'year'],
  inproceedings: ['author', 'title', 'booktitle', 'year'],
  book: ['author', 'title', 'publisher', 'year'],
  techreport: ['author', 'title', 'institution', 'year'],
  misc: ['author', 'title', 'year'],
}

// CLI command: tag citations verify refs.bib
async function verifyCitations(bibPath: string): Promise<void> {
  const content = await fs.readFile(bibPath, 'utf-8')
  const result = verifier.verifyBibFile(bibPath)

  if (result.valid) {
    console.log(`✓ ${result.totalEntries} entries verified`)
  } else {
    console.log(`✗ ${result.errors.length} errors found:`)
    result.errors.forEach(e => console.log(`  - ${e.message}`))
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠ ${result.warnings.length} warnings:`)
    result.warnings.forEach(w => console.log(`  - ${w.message}`))
  }
}
```

### Structured Output Templates

```typescript
interface OutputTemplate {
  name: string
  format: 'markdown' | 'json' | 'yaml'
  schema: JSONSchema
  example: string
}

// Literature Review Corpus Table
const corpusTableTemplate: OutputTemplate = {
  name: 'corpus-table',
  format: 'markdown',
  schema: {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'citation_key', 'year', 'venue', 'type', 'key_claim', 'status'],
      properties: {
        id: { type: 'number' },
        citation_key: { type: 'string' },
        year: { type: 'number' },
        venue: { type: 'string' },
        type: { enum: ['empirical', 'theoretical', 'survey', 'SoK', 'position'] },
        method: { type: 'string' },
        dataset: { type: 'string' },
        key_claim: { type: 'string' },
        limitations: { type: 'string' },
        status: { enum: ['[READ]', '[NOT READ]'] },
      },
    },
  },
  example: `
| ID | Citation key | Year | Venue | Type | Method | Dataset | Key claim | Limitations | Status |
|----|--------------|------|-------|------|--------|---------|-----------|-------------|--------|
| 1  | smith2020    | 2020 | NeurIPS | empirical | transformer | ImageNet | SOTA on X | Limited to Y | [READ] |
| 2  | jones2021    | 2021 | ICML | theoretical | analysis | - | Proves bound | Assumes Z | [NOT READ] |
`,
}

// Threat Model Table
const threatModelTemplate: OutputTemplate = {
  name: 'stride-table',
  format: 'markdown',
  schema: {
    type: 'array',
    items: {
      type: 'object',
      required: ['threat', 'property', 'attack_scenario', 'mitigation'],
      properties: {
        threat: { enum: ['Spoofing', 'Tampering', 'Repudiation', 'Info Disclosure', 'DoS', 'Elevation'] },
        property: { type: 'string' },
        attack_scenario: { type: 'string' },
        likelihood: { enum: ['Low', 'Medium', 'High'] },
        impact: { enum: ['Low', 'Medium', 'High'] },
        mitigation: { type: 'string' },
      },
    },
  },
  example: `
| Threat | Property Violated | Attack Scenario | Likelihood | Impact | Mitigation |
|--------|------------------|-----------------|------------|--------|------------|
| Spoofing | Authentication | Attacker forges JWT | Medium | High | Verify signature, check expiry |
| Tampering | Integrity | Modify request body | Low | High | HMAC on payload |
`,
}
```

## Implementation Notes
- Backend: Templates in `packages/skill-framework/src/templates/`
- Frontend: Template browser, form-based generation
- CLI: `tag template list`, `tag template create`, `tag audit`
- Database: template_instances table for tracking generated artifacts

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/skill-framework/src/__tests__/workflow.test.ts` | `tracks current phase` | Phase index correct |
| `packages/skill-framework/src/__tests__/workflow.test.ts` | `validates phase outputs` | Criteria checked |
| `packages/skill-framework/src/__tests__/workflow.test.ts` | `blocks without approval` | Cannot advance |
| `packages/skill-framework/src/__tests__/markers.test.ts` | `finds all marker types` | All detected |
| `packages/skill-framework/src/__tests__/markers.test.ts` | `extracts VERIFY reason` | Reason parsed |
| `packages/skill-framework/src/__tests__/markers.test.ts` | `generates audit report` | Counts correct |
| `packages/skill-framework/src/__tests__/citations.test.ts` | `detects duplicate keys` | Duplicates found |
| `packages/skill-framework/src/__tests__/citations.test.ts` | `detects missing fields` | Errors listed |
| `packages/skill-framework/src/__tests__/citations.test.ts` | `handles malformed BibTeX` | Graceful error |
| `packages/skill-framework/src/__tests__/templates.test.ts` | `validates against schema` | Invalid rejected |

### Test Coverage Requirements
- All workflow phases tested
- All marker types detected
- Citation edge cases covered

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `phase progression` | Lit review workflow | 1. Complete Phase 1 2. Approve 3. Advance | Phase 2 active |
| `marker audit` | Files with markers | 1. Run audit | All markers found |
| `citation verify` | refs.bib with issues | 1. Verify | Errors reported |
| `template generation` | Template selected | 1. Fill form 2. Generate | Valid output |
| `experiment log` | Experiment complete | 1. Generate log | All fields present |

### End-to-End Flows
- Start literature review → Phase 1 outputs → Approve → Phase 2 → ... → Draft with markers
- Run experiment → Generate log → Verify citations → Audit markers → Pre-submission check

## Acceptance Criteria
1. Experiment log template with all required sections
2. Progressive disclosure workflow with phase gates
3. Phase approval mechanism (user confirms before advancing)
4. Grep-able markers ([DRAFT], [VERIFY], [NOT READ], [VIVA?])
5. Marker scanner and audit report generator
6. Citation verification for BibTeX files
7. Structured output templates with schema validation
8. CLI commands for template and audit operations

## Review Checklist
- [ ] Are experiment log fields sufficient for reproducibility?
- [ ] Do phase gates block unauthorized progression?
- [ ] Are all marker types grep-able and documented?
- [ ] Does citation verifier handle edge cases?
- [ ] Are templates easy to extend?
- [ ] Is the audit report actionable?

## Dependencies
- Depends on: Day 43 (Skill framework)
- Blocks: Day 48 (Integration testing)

## Risk Factors
- **Template rigidity** — Mitigation: Allow custom fields, optional sections
- **Marker noise** — Mitigation: Clear docs on when to use each type
- **Citation parser limits** — Mitigation: Use established BibTeX library
- **Workflow state loss** — Mitigation: Persist phase state in database
