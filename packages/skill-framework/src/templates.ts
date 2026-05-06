/**
 * Structured Output Templates
 * Templates for research artifacts with schema validation
 */

import { z } from 'zod'

// ============================================================================
// Template Types
// ============================================================================

export interface OutputTemplate {
  name: string
  description: string
  format: 'markdown' | 'json' | 'yaml'
  schema: z.ZodSchema
  example: string
  sections?: TemplateSection[]
}

export interface TemplateSection {
  name: string
  required: boolean
  description: string
  defaultContent?: string
}

// ============================================================================
// Experiment Log Template
// ============================================================================

export const ExperimentLogSchema = z.object({
  id: z.string().regex(/^exp-\d{8}-[\w-]+$/),
  hypothesis: z.string().min(10),
  status: z.enum(['planned', 'running', 'complete', 'abandoned']),
  trackerRunId: z.string().optional(),
  gitCommit: z.string().optional(),
  branch: z.string().optional(),

  setup: z.object({
    dataset: z.object({
      name: z.string(),
      version: z.string().optional(),
      split: z.string().optional(),
      preprocessing: z.string().optional(),
    }),
    model: z.object({
      architecture: z.string(),
      parameters: z.string().optional(),
      initialization: z.string().optional(),
    }),
    baselines: z.array(
      z.object({
        name: z.string(),
        justification: z.string(),
      })
    ),
    hyperparameters: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
        searchSpace: z.string().optional(),
      })
    ),
    seeds: z.array(z.number()).min(3),
    compute: z.object({
      hardware: z.string(),
      totalRuntime: z.string().optional(),
      budget: z.string().optional(),
    }),
  }),

  results: z
    .object({
      headlineTable: z.array(z.record(z.string())),
      statisticalTest: z.object({
        test: z.string(),
        pValue: z.number(),
        effectSize: z.number().optional(),
        confidenceLevel: z.number().optional(),
      }),
      plots: z.array(z.string()),
    })
    .optional(),

  observations: z.string().optional(),
  threatsToValidity: z.array(z.string()),
  nextSteps: z.string().optional(),
  artifacts: z.object({
    code: z.string().optional(),
    config: z.string().optional(),
    logs: z.string().optional(),
    checkpoint: z.string().optional(),
    rawOutputs: z.string().optional(),
  }),
})

export type ExperimentLog = z.infer<typeof ExperimentLogSchema>

export const EXPERIMENT_LOG_TEMPLATE: OutputTemplate = {
  name: 'experiment-log',
  description: 'Reproducible ML experiment documentation',
  format: 'markdown',
  schema: ExperimentLogSchema,
  sections: [
    {
      name: 'Header',
      required: true,
      description: 'Experiment ID, hypothesis, status, and tracking info',
    },
    {
      name: 'Setup',
      required: true,
      description: 'Dataset, model, baselines, hyperparameters, seeds, compute',
    },
    {
      name: 'Results',
      required: false,
      description: 'Headline table, statistical tests, plots',
    },
    {
      name: 'Observations',
      required: false,
      description: 'What did you learn? Unexpected behavior? Debugging notes?',
    },
    {
      name: 'Threats to Validity',
      required: true,
      description: 'Checklist of validity concerns',
    },
    {
      name: 'Next Steps',
      required: false,
      description: 'Follow-up experiments based on findings',
    },
    {
      name: 'Artifact Pointers',
      required: true,
      description: 'Links to code, config, logs, checkpoints',
    },
  ],
  example: `# exp-20240115-attention-ablation

**Hypothesis**: Removing the attention layer will decrease accuracy by >5%
**Status**: complete
**Tracker run ID**: wandb://team/project/run-abc123
**Git commit**: a1b2c3d
**Branch**: feature/attention-ablation

## 1. Setup

### Dataset
- Name: ImageNet-1k
- Version: 2012
- Split: 80/10/10
- Preprocessing: Standard augmentation

### Model
- Architecture: ResNet-50 + Attention
- Parameters: 25M
- Initialization: ImageNet pretrained

### Baselines
| Baseline | Justification |
|----------|---------------|
| ResNet-50 vanilla | Standard baseline |
| ResNet-50 + SE | Alternative attention |

### Hyperparameters
| Parameter | Value | Search space |
|-----------|-------|--------------|
| lr | 0.001 | [0.0001, 0.01] |
| batch_size | 64 | - |

### Seeds
- Seeds used: [42, 123, 456, 789, 1337]
- Seed selection: fixed set

### Compute
- Hardware: 4x A100 40GB
- Total runtime: 12 hours
- Budget: $200

## 2. Results

### Headline Table
| Method | Seed | Acc@1 | Acc@5 | Loss |
|--------|------|-------|-------|------|
| Ours | 42 | **78.2** | 94.1 | 0.85 |
| Ours | 123 | 77.8 | 93.9 | 0.87 |
| Baseline | 42 | 72.1 | 91.2 | 0.95 |

**Best result**: **bold**, statistically-tied: *italic*

### Statistical Test
- Test: Wilcoxon signed-rank
- p-value: 0.0012
- Effect size: 0.42
- Confidence level: 95%

### Plots
- figures/accuracy_curve.png
- figures/attention_maps.png

## 3. Observations
The attention mechanism significantly improves top-1 accuracy...

## 4. Threats to Validity
- [x] Hyperparameter tuning fair across methods
- [x] Compute budget equal
- [x] Seeds sufficient
- [ ] Test set not contaminated [VERIFY: check data splits]
- [x] Baselines are strong

## 5. Next Steps
- Try different attention mechanisms
- Scale to larger models

## 6. Artifact Pointers
- Code: https://github.com/...
- Config: configs/attention_ablation.yaml
- Logs: logs/exp-20240115/
- Model checkpoint: checkpoints/best.pt
- Raw outputs: results/predictions.csv
`,
}

// ============================================================================
// Corpus Table Template
// ============================================================================

export const CorpusEntrySchema = z.object({
  id: z.number(),
  citationKey: z.string(),
  year: z.number(),
  venue: z.string(),
  type: z.enum(['empirical', 'theoretical', 'survey', 'SoK', 'position', 'tool']),
  method: z.string().optional(),
  dataset: z.string().optional(),
  keyClaim: z.string(),
  limitations: z.string().optional(),
  status: z.enum(['[READ]', '[NOT READ]']),
})

export type CorpusEntry = z.infer<typeof CorpusEntrySchema>

export const CORPUS_TABLE_TEMPLATE: OutputTemplate = {
  name: 'corpus-table',
  description: 'Literature review corpus in structured table format',
  format: 'markdown',
  schema: z.array(CorpusEntrySchema),
  example: `| ID | Citation key | Year | Venue | Type | Method | Dataset | Key claim | Limitations | Status |
|----|--------------|------|-------|------|--------|---------|-----------|-------------|--------|
| 1 | smith2020 | 2020 | NeurIPS | empirical | transformer | ImageNet | SOTA on image classification | Limited to vision | [READ] |
| 2 | jones2021 | 2021 | ICML | theoretical | PAC bounds | - | Proves generalization bound | Assumes i.i.d. | [NOT READ] |
| 3 | doe2019 | 2019 | ACL | empirical | BERT | GLUE | Pretrain+finetune works | English only | [READ] |
`,
}

// ============================================================================
// STRIDE Threat Model Template
// ============================================================================

export const ThreatEntrySchema = z.object({
  threat: z.enum([
    'Spoofing',
    'Tampering',
    'Repudiation',
    'Info Disclosure',
    'DoS',
    'Elevation',
  ]),
  property: z.string(),
  attackScenario: z.string(),
  likelihood: z.enum(['Low', 'Medium', 'High']),
  impact: z.enum(['Low', 'Medium', 'High']),
  mitigation: z.string(),
})

export type ThreatEntry = z.infer<typeof ThreatEntrySchema>

export const STRIDE_TABLE_TEMPLATE: OutputTemplate = {
  name: 'stride-table',
  description: 'STRIDE threat model analysis table',
  format: 'markdown',
  schema: z.array(ThreatEntrySchema),
  example: `| Threat | Property Violated | Attack Scenario | Likelihood | Impact | Mitigation |
|--------|------------------|-----------------|------------|--------|------------|
| Spoofing | Authentication | Attacker forges JWT token | Medium | High | Verify signature, check expiry |
| Tampering | Integrity | Modify request body in transit | Low | High | HMAC on payload, TLS |
| Repudiation | Non-repudiation | User denies action | Low | Medium | Audit logging |
| Info Disclosure | Confidentiality | API returns extra fields | Medium | High | Field-level access control |
| DoS | Availability | Flood API with requests | High | Medium | Rate limiting |
| Elevation | Authorization | Access admin endpoint | Low | Critical | RBAC, principle of least privilege |
`,
}

// ============================================================================
// Template Manager
// ============================================================================

export class TemplateManager {
  private templates: Map<string, OutputTemplate> = new Map()

  constructor() {
    // Register built-in templates
    this.register(EXPERIMENT_LOG_TEMPLATE)
    this.register(CORPUS_TABLE_TEMPLATE)
    this.register(STRIDE_TABLE_TEMPLATE)
  }

  /**
   * Register a new template
   * @param template - The template to register
   */
  register(template: OutputTemplate): void {
    this.templates.set(template.name, template)
  }

  /**
   * Get a template by name
   * @param name - Template name
   * @returns The template or undefined
   */
  get(name: string): OutputTemplate | undefined {
    return this.templates.get(name)
  }

  /**
   * List all registered templates
   * @returns Array of template names
   */
  list(): string[] {
    return Array.from(this.templates.keys())
  }

  /**
   * Validate data against a template's schema
   * @param templateName - Name of the template
   * @param data - Data to validate
   * @returns Validation result
   */
  validate(templateName: string, data: unknown): { valid: boolean; errors?: string[] } {
    const template = this.templates.get(templateName)
    if (!template) {
      return { valid: false, errors: [`Template '${templateName}' not found`] }
    }

    const result = template.schema.safeParse(data)
    if (result.success) {
      return { valid: true }
    }

    const errors = result.error.issues.map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })

    return { valid: false, errors }
  }

  /**
   * Generate a blank template
   * @param templateName - Name of the template
   * @returns Template example string
   */
  getExample(templateName: string): string | undefined {
    return this.templates.get(templateName)?.example
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate an experiment ID
 * @param shortName - Short descriptive name
 * @returns Formatted experiment ID
 */
export function generateExperimentId(shortName: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const slug = shortName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return `exp-${date}-${slug}`
}

/**
 * Parse a markdown table into array of objects
 * @param tableMarkdown - Markdown table string
 * @returns Array of row objects
 */
export function parseMarkdownTable(tableMarkdown: string): Record<string, string>[] {
  const lines = tableMarkdown.trim().split('\n')
  if (lines.length < 2) return []

  // Parse header
  const headers = lines[0]
    .split('|')
    .map((h) => h.trim())
    .filter((h) => h !== '')

  // Skip separator line
  const rows: Record<string, string>[] = []

  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '')

    if (cells.length === headers.length) {
      const row: Record<string, string> = {}
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = cells[j]
      }
      rows.push(row)
    }
  }

  return rows
}
