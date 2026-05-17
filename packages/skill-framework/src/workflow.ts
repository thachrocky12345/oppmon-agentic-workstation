// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Progressive Disclosure Workflow System
 * Enables multi-phase workflows with phase gates and approval requirements
 */

import { z } from 'zod'

// ============================================================================
// Workflow Types
// ============================================================================

export const WorkflowPhaseSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  validationCriteria: z.array(z.string()),
  requiresApproval: z.boolean().default(false),
})

export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>

export const SkillWorkflowSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  phases: z.array(WorkflowPhaseSchema).min(1),
})

export type SkillWorkflow = z.infer<typeof SkillWorkflowSchema>

export interface WorkflowState {
  workflowName: string
  currentPhase: number
  phaseStates: PhaseState[]
  startedAt: Date
  completedAt?: Date
}

export interface PhaseState {
  phase: number
  status: 'pending' | 'in_progress' | 'awaiting_approval' | 'approved' | 'completed'
  startedAt?: Date
  completedAt?: Date
  outputs: Record<string, unknown>
  validationResults: ValidationCheckResult[]
}

export interface ValidationCheckResult {
  criterion: string
  passed: boolean
  notes?: string
}

// ============================================================================
// Workflow Manager
// ============================================================================

export class WorkflowManager {
  private workflows: Map<string, SkillWorkflow> = new Map()
  private activeStates: Map<string, WorkflowState> = new Map()

  /**
   * Register a workflow definition
   * @param workflow - The workflow to register
   */
  registerWorkflow(workflow: SkillWorkflow): void {
    const validation = SkillWorkflowSchema.safeParse(workflow)
    if (!validation.success) {
      throw new Error(`Invalid workflow: ${validation.error.message}`)
    }
    this.workflows.set(workflow.name, workflow)
  }

  /**
   * Get a registered workflow
   * @param name - Workflow name
   * @returns The workflow or undefined
   */
  getWorkflow(name: string): SkillWorkflow | undefined {
    return this.workflows.get(name)
  }

  /**
   * List all registered workflows
   * @returns Array of workflow names
   */
  listWorkflows(): string[] {
    return Array.from(this.workflows.keys())
  }

  /**
   * Start a new workflow session
   * @param workflowName - Name of the workflow to start
   * @param sessionId - Unique session identifier
   * @returns The initial workflow state
   */
  startWorkflow(workflowName: string, sessionId: string): WorkflowState {
    const workflow = this.workflows.get(workflowName)
    if (!workflow) {
      throw new Error(`Workflow '${workflowName}' not found`)
    }

    const state: WorkflowState = {
      workflowName,
      currentPhase: 0,
      phaseStates: workflow.phases.map((_, index) => ({
        phase: index,
        status: index === 0 ? 'in_progress' : 'pending',
        outputs: {},
        validationResults: [],
        startedAt: index === 0 ? new Date() : undefined,
      })),
      startedAt: new Date(),
    }

    this.activeStates.set(sessionId, state)
    return state
  }

  /**
   * Get the current state of a workflow session
   * @param sessionId - Session identifier
   * @returns The workflow state or undefined
   */
  getState(sessionId: string): WorkflowState | undefined {
    return this.activeStates.get(sessionId)
  }

  /**
   * Get the current phase definition
   * @param sessionId - Session identifier
   * @returns The current phase or undefined
   */
  getCurrentPhase(sessionId: string): WorkflowPhase | undefined {
    const state = this.activeStates.get(sessionId)
    if (!state) return undefined

    const workflow = this.workflows.get(state.workflowName)
    if (!workflow) return undefined

    return workflow.phases[state.currentPhase]
  }

  /**
   * Record outputs for the current phase
   * @param sessionId - Session identifier
   * @param outputs - Key-value outputs
   */
  recordPhaseOutputs(sessionId: string, outputs: Record<string, unknown>): void {
    const state = this.activeStates.get(sessionId)
    if (!state) throw new Error('Session not found')

    const phaseState = state.phaseStates[state.currentPhase]
    phaseState.outputs = { ...phaseState.outputs, ...outputs }
  }

  /**
   * Validate the current phase
   * @param sessionId - Session identifier
   * @param results - Validation results for each criterion
   * @returns True if all validations passed
   */
  validatePhase(sessionId: string, results: ValidationCheckResult[]): boolean {
    const state = this.activeStates.get(sessionId)
    if (!state) throw new Error('Session not found')

    const phaseState = state.phaseStates[state.currentPhase]
    phaseState.validationResults = results

    const allPassed = results.every((r) => r.passed)

    if (allPassed) {
      const workflow = this.workflows.get(state.workflowName)!
      const phase = workflow.phases[state.currentPhase]

      if (phase.requiresApproval) {
        phaseState.status = 'awaiting_approval'
      } else {
        phaseState.status = 'completed'
        phaseState.completedAt = new Date()
      }
    }

    return allPassed
  }

  /**
   * Approve the current phase (if it requires approval)
   * @param sessionId - Session identifier
   * @returns True if approval succeeded
   */
  approvePhase(sessionId: string): boolean {
    const state = this.activeStates.get(sessionId)
    if (!state) throw new Error('Session not found')

    const phaseState = state.phaseStates[state.currentPhase]

    if (phaseState.status !== 'awaiting_approval') {
      return false
    }

    phaseState.status = 'approved'
    phaseState.completedAt = new Date()
    return true
  }

  /**
   * Advance to the next phase
   * @param sessionId - Session identifier
   * @returns True if advanced successfully
   */
  advancePhase(sessionId: string): boolean {
    const state = this.activeStates.get(sessionId)
    if (!state) throw new Error('Session not found')

    const currentPhaseState = state.phaseStates[state.currentPhase]

    // Can only advance if current phase is completed or approved
    if (!['completed', 'approved'].includes(currentPhaseState.status)) {
      return false
    }

    const workflow = this.workflows.get(state.workflowName)!

    // Check if there are more phases
    if (state.currentPhase >= workflow.phases.length - 1) {
      // Workflow complete
      state.completedAt = new Date()
      return true
    }

    // Advance to next phase
    state.currentPhase++
    const nextPhaseState = state.phaseStates[state.currentPhase]
    nextPhaseState.status = 'in_progress'
    nextPhaseState.startedAt = new Date()

    return true
  }

  /**
   * Check if a workflow session is complete
   * @param sessionId - Session identifier
   * @returns True if all phases are complete
   */
  isComplete(sessionId: string): boolean {
    const state = this.activeStates.get(sessionId)
    return state?.completedAt !== undefined
  }

  /**
   * Get a summary of workflow progress
   * @param sessionId - Session identifier
   * @returns Progress summary
   */
  getProgress(sessionId: string): WorkflowProgress | undefined {
    const state = this.activeStates.get(sessionId)
    if (!state) return undefined

    const workflow = this.workflows.get(state.workflowName)!
    const completedPhases = state.phaseStates.filter(
      (p) => p.status === 'completed' || p.status === 'approved'
    ).length

    return {
      workflowName: state.workflowName,
      currentPhase: state.currentPhase,
      currentPhaseName: workflow.phases[state.currentPhase].name,
      totalPhases: workflow.phases.length,
      completedPhases,
      percentComplete: Math.round((completedPhases / workflow.phases.length) * 100),
      isComplete: state.completedAt !== undefined,
      requiresApproval:
        state.phaseStates[state.currentPhase].status === 'awaiting_approval',
    }
  }

  /**
   * End a workflow session
   * @param sessionId - Session identifier
   */
  endSession(sessionId: string): void {
    this.activeStates.delete(sessionId)
  }
}

export interface WorkflowProgress {
  workflowName: string
  currentPhase: number
  currentPhaseName: string
  totalPhases: number
  completedPhases: number
  percentComplete: number
  isComplete: boolean
  requiresApproval: boolean
}

// ============================================================================
// Pre-defined Workflows
// ============================================================================

export const LITERATURE_REVIEW_WORKFLOW: SkillWorkflow = {
  name: 'literature-review',
  description: 'Systematic literature review workflow',
  phases: [
    {
      name: 'Phase 1: Scope the Review',
      description: 'Define research question and search strategy',
      inputs: ['Topic area', 'Time constraints'],
      outputs: [
        'Research question (1 sentence)',
        'Inclusion/exclusion criteria',
        'Search strategy',
      ],
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
}

export const EXPERIMENT_WORKFLOW: SkillWorkflow = {
  name: 'experiment',
  description: 'Reproducible experiment workflow',
  phases: [
    {
      name: 'Phase 1: Hypothesis',
      description: 'State hypothesis before running experiment',
      inputs: ['Research question'],
      outputs: ['Hypothesis (1 sentence)', 'Expected outcome'],
      validationCriteria: [
        'Hypothesis is falsifiable',
        'Hypothesis stated BEFORE running experiment',
      ],
      requiresApproval: true,
    },
    {
      name: 'Phase 2: Setup',
      description: 'Document experimental setup',
      inputs: ['Hypothesis'],
      outputs: [
        'Dataset description',
        'Model architecture',
        'Baselines',
        'Hyperparameters',
        'Seeds',
      ],
      validationCriteria: [
        'At least 3 seeds specified',
        'Baselines are justified',
        'Compute budget documented',
      ],
      requiresApproval: true,
    },
    {
      name: 'Phase 3: Run',
      description: 'Execute experiment and collect results',
      inputs: ['Setup documentation'],
      outputs: ['Raw results', 'Tracker run ID', 'Git commit'],
      validationCriteria: [
        'All seeds run',
        'Results logged to tracker',
        'Code committed',
      ],
      requiresApproval: false,
    },
    {
      name: 'Phase 4: Analyze',
      description: 'Analyze results with statistical rigor',
      inputs: ['Raw results'],
      outputs: ['Headline table', 'Statistical tests', 'Plots'],
      validationCriteria: [
        'Statistical test appropriate',
        'p-value and effect size reported',
        'Best result bolded, ties italicized',
      ],
      requiresApproval: true,
    },
    {
      name: 'Phase 5: Document',
      description: 'Write up findings',
      inputs: ['Analysis'],
      outputs: ['Observations', 'Threats to validity', 'Next steps'],
      validationCriteria: [
        'Threats to validity addressed',
        'Artifact pointers complete',
      ],
      requiresApproval: false,
    },
  ],
}
