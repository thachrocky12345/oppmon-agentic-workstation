// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Workflow System Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  WorkflowManager,
  LITERATURE_REVIEW_WORKFLOW,
  EXPERIMENT_WORKFLOW,
} from '../workflow.js'

describe('WorkflowManager', () => {
  let manager: WorkflowManager

  beforeEach(() => {
    manager = new WorkflowManager()
    manager.registerWorkflow(LITERATURE_REVIEW_WORKFLOW)
    manager.registerWorkflow(EXPERIMENT_WORKFLOW)
  })

  describe('workflow registration', () => {
    it('registers workflows', () => {
      expect(manager.listWorkflows()).toContain('literature-review')
      expect(manager.listWorkflows()).toContain('experiment')
    })

    it('retrieves workflow by name', () => {
      const workflow = manager.getWorkflow('literature-review')
      expect(workflow).toBeDefined()
      expect(workflow?.phases.length).toBe(4)
    })

    it('returns undefined for non-existent workflow', () => {
      expect(manager.getWorkflow('non-existent')).toBeUndefined()
    })
  })

  describe('workflow sessions', () => {
    it('starts a workflow session', () => {
      const state = manager.startWorkflow('literature-review', 'session-1')

      expect(state.workflowName).toBe('literature-review')
      expect(state.currentPhase).toBe(0)
      expect(state.phaseStates.length).toBe(4)
      expect(state.phaseStates[0].status).toBe('in_progress')
    })

    it('throws for non-existent workflow', () => {
      expect(() => manager.startWorkflow('non-existent', 'session-1')).toThrow()
    })

    it('tracks current phase', () => {
      manager.startWorkflow('literature-review', 'session-1')
      const phase = manager.getCurrentPhase('session-1')

      expect(phase?.name).toBe('Phase 1: Scope the Review')
    })
  })

  describe('phase outputs', () => {
    it('records phase outputs', () => {
      manager.startWorkflow('literature-review', 'session-1')
      manager.recordPhaseOutputs('session-1', {
        researchQuestion: 'What is the impact of X?',
        criteria: ['Published after 2020', 'English only'],
      })

      const state = manager.getState('session-1')
      expect(state?.phaseStates[0].outputs.researchQuestion).toBe(
        'What is the impact of X?'
      )
    })
  })

  describe('phase validation', () => {
    it('validates phase and marks awaiting approval', () => {
      manager.startWorkflow('literature-review', 'session-1')

      const allPassed = manager.validatePhase('session-1', [
        { criterion: 'Research question is falsifiable', passed: true },
        { criterion: 'Criteria are specific', passed: true },
        { criterion: 'Search strategy covers venues', passed: true },
      ])

      expect(allPassed).toBe(true)

      const state = manager.getState('session-1')
      expect(state?.phaseStates[0].status).toBe('awaiting_approval')
    })

    it('does not advance on failed validation', () => {
      manager.startWorkflow('literature-review', 'session-1')

      const allPassed = manager.validatePhase('session-1', [
        { criterion: 'Research question is falsifiable', passed: true },
        { criterion: 'Criteria are specific', passed: false, notes: 'Too vague' },
        { criterion: 'Search strategy covers venues', passed: true },
      ])

      expect(allPassed).toBe(false)

      const state = manager.getState('session-1')
      expect(state?.phaseStates[0].status).toBe('in_progress')
    })
  })

  describe('phase approval', () => {
    it('blocks without approval when required', () => {
      manager.startWorkflow('literature-review', 'session-1')
      manager.validatePhase('session-1', [
        { criterion: 'Test', passed: true },
      ])

      // Try to advance without approval
      const advanced = manager.advancePhase('session-1')
      expect(advanced).toBe(false)
    })

    it('allows advancement after approval', () => {
      manager.startWorkflow('literature-review', 'session-1')
      manager.validatePhase('session-1', [
        { criterion: 'Test', passed: true },
      ])
      manager.approvePhase('session-1')

      const advanced = manager.advancePhase('session-1')
      expect(advanced).toBe(true)

      const state = manager.getState('session-1')
      expect(state?.currentPhase).toBe(1)
      expect(state?.phaseStates[1].status).toBe('in_progress')
    })
  })

  describe('workflow completion', () => {
    it('marks workflow complete after last phase', () => {
      manager.startWorkflow('literature-review', 'session-1')

      // Fast-forward through all phases
      for (let i = 0; i < 4; i++) {
        manager.validatePhase('session-1', [{ criterion: 'Test', passed: true }])
        manager.approvePhase('session-1')
        manager.advancePhase('session-1')
      }

      expect(manager.isComplete('session-1')).toBe(true)
    })
  })

  describe('workflow progress', () => {
    it('returns progress summary', () => {
      manager.startWorkflow('literature-review', 'session-1')
      manager.validatePhase('session-1', [{ criterion: 'Test', passed: true }])
      manager.approvePhase('session-1')
      manager.advancePhase('session-1')

      const progress = manager.getProgress('session-1')

      expect(progress?.currentPhase).toBe(1)
      expect(progress?.completedPhases).toBe(1)
      expect(progress?.totalPhases).toBe(4)
      expect(progress?.percentComplete).toBe(25)
    })

    it('indicates when approval is required', () => {
      manager.startWorkflow('literature-review', 'session-1')
      manager.validatePhase('session-1', [{ criterion: 'Test', passed: true }])

      const progress = manager.getProgress('session-1')
      expect(progress?.requiresApproval).toBe(true)
    })
  })

  describe('session cleanup', () => {
    it('ends session and removes state', () => {
      manager.startWorkflow('literature-review', 'session-1')
      manager.endSession('session-1')

      expect(manager.getState('session-1')).toBeUndefined()
    })
  })
})

describe('Built-in Workflows', () => {
  it('literature-review has 4 phases', () => {
    expect(LITERATURE_REVIEW_WORKFLOW.phases.length).toBe(4)
    expect(LITERATURE_REVIEW_WORKFLOW.phases[0].requiresApproval).toBe(true)
    expect(LITERATURE_REVIEW_WORKFLOW.phases[3].requiresApproval).toBe(false)
  })

  it('experiment has 5 phases', () => {
    expect(EXPERIMENT_WORKFLOW.phases.length).toBe(5)
    expect(EXPERIMENT_WORKFLOW.phases[0].name).toContain('Hypothesis')
  })
})
