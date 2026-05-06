/**
 * Week 7 Integration Tests
 *
 * Tests integration between all Week 7 components:
 * - Skill Framework (Day 43-44)
 * - Agent Engine (Day 45)
 * - Observability (Day 46)
 * - Guardrails (Day 47)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// Skill Framework
import {
  SimpleKeywordMatcher,
  WorkflowManager,
  MarkerScanner,
  TemplateManager,
  LITERATURE_REVIEW_WORKFLOW,
  generateExperimentId,
} from '@arkon/skill-framework'
import type { LoadedSkill } from '@arkon/skill-framework'

// Agent Engine
import {
  ToolExecutor,
  RiskGate,
  createDefaultRiskGate,
  ReplayLog,
  SeededRng,
  createEnvelope,
  encode,
  decode,
} from '@arkon/agent-engine'

// Observability
import {
  Tracer,
  SpanCategory,
  MockLLMObserver,
  LatencyTracker,
  SwarmMetricsCollector,
} from '@arkon/observability'

// Guardrails
import {
  createDefaultFilter,
  createDefaultGuardRegistry,
  createDefaultConstitution,
  createInMemoryAuditLogger,
  SECURITY_RESEARCH_SCOPE,
  checkRequestScope,
} from '@arkon/guardrails'

// Helper to create a mock skill for testing
function createMockSkill(name: string, triggers: string[], tags: string[] = []): LoadedSkill {
  return {
    frontmatter: {
      name,
      version: '1.0.0',
      category: 'research',
      description: `${name} skill`,
      author: 'Test',
      triggers,
      tags,
      outputs: [],
      requires: [],
    },
    body: { sections: [], examples: [] },
    filePath: `/mock/${name}.md`,
  }
}

describe('Week 7 Integration', () => {
  describe('Skill Framework Integration', () => {
    let matcher: SimpleKeywordMatcher

    beforeAll(() => {
      matcher = new SimpleKeywordMatcher()
      // Register test skills
      matcher.registerSkill(createMockSkill('test-skill', ['help me test', 'run test']))
      matcher.registerSkill(createMockSkill('search-skill', ['search for', 'find']))
    })

    it('loads skills and matches triggers', () => {
      // Test exact match
      const exactMatch = matcher.matchSkills('help me test')
      expect(exactMatch.length).toBeGreaterThan(0)
      expect(exactMatch[0].skill).toBe('test-skill')
      expect(exactMatch[0].confidence).toBe(1.0)
    })

    it('workflow manager tracks phase progression', () => {
      const workflow = new WorkflowManager()

      // Register the workflow first
      workflow.registerWorkflow(LITERATURE_REVIEW_WORKFLOW)

      // Start a workflow session
      const state = workflow.startWorkflow('literature-review', 'test-session')

      // Verify initial state
      expect(state.currentPhase).toBe(0)
      expect(state.completedAt).toBeUndefined()

      // Complete validation and advance
      workflow.validatePhase('test-session', [
        { criterion: 'Research question is falsifiable', passed: true },
        { criterion: 'Criteria are specific', passed: true },
        { criterion: 'Search strategy covers venues', passed: true },
      ])

      // Approve phase (required for literature-review)
      workflow.approvePhase('test-session')
      workflow.advancePhase('test-session')

      const updated = workflow.getState('test-session')
      expect(updated?.currentPhase).toBe(1)
    })

    it('marker scanner finds research markers', () => {
      const scanner = new MarkerScanner()

      const content = `
        This is a [DRAFT] document.
        [VERIFY: check this claim]
        [TODO: add more details]
        [VIVA?] Possible exam question
      `

      const markers = scanner.scan(content)

      const types = markers.map((m) => m.type)
      expect(types).toContain('DRAFT')
      expect(types).toContain('VERIFY')
      expect(types).toContain('TODO')
      expect(types).toContain('VIVA')
    })

    it('template manager validates and provides examples', () => {
      const templates = new TemplateManager()

      // List available templates
      const templateNames = templates.list()
      expect(templateNames).toContain('experiment-log')
      expect(templateNames).toContain('corpus-table')
      expect(templateNames).toContain('stride-table')

      // Get experiment log example
      const example = templates.getExample('experiment-log')
      expect(example).toBeDefined()
      expect(example).toContain('exp-')
      expect(example).toContain('Hypothesis')

      // Generate experiment ID
      const expId = generateExperimentId('Test Experiment')
      expect(expId).toMatch(/^exp-\d{8}-test-experiment$/)
    })
  })

  describe('Agent Engine Integration', () => {
    let executor: ToolExecutor
    let riskGate: RiskGate

    beforeAll(() => {
      executor = new ToolExecutor({ maxWorkers: 4, defaultTimeoutMs: 5000 })
      riskGate = createDefaultRiskGate()
    })

    it('executes tools in parallel', async () => {
      // Register test tools
      executor.register('tool1', async () => ({ output: 'result1', status: 'success' }))
      executor.register('tool2', async () => ({ output: 'result2', status: 'success' }))
      executor.register('tool3', async () => ({ output: 'result3', status: 'success' }))

      const results = await executor.executeBatch({
        tools: [
          { id: '1', name: 'tool1', arguments: {} },
          { id: '2', name: 'tool2', arguments: {} },
          { id: '3', name: 'tool3', arguments: {} },
        ],
        timeoutMs: 5000,
        maxParallel: 4,
      })

      expect(results.length).toBe(3)
      expect(results.every((r) => r.status === 'success')).toBe(true)
    })

    it('risk gate filters requests', () => {
      const chatRequest = {
        type: 'chat' as const,
        data: {
          tenantId: 'tenant-1',
          threadId: 'thread-1',
          message: 'Hello!',
          tools: [],
          maxIterations: 5,
        },
      }

      const chatResponse = {
        type: 'chatStream' as const,
        data: {
          type: 'text' as const,
          content: 'Hi there!',
        },
      }

      const decision = riskGate.check(chatRequest, chatResponse)
      expect(decision.type).toBe('allow')
    })

    it('replay log provides deterministic playback', () => {
      const log = new ReplayLog<string>(42)

      log.startRecording()
      log.record(createEnvelope(1, 'first'))
      log.record(createEnvelope(2, 'second'))
      log.record(createEnvelope(3, 'third'))
      log.stopRecording()

      // Serialize and restore
      const json = log.toJSON()
      const restored = ReplayLog.fromJSON<string>(json)

      // Replay should match
      const iterator = restored.replay()
      const entries: string[] = []
      let result = iterator.next()
      while (!result.done) {
        entries.push(result.value.envelope.payload)
        result = iterator.next()
      }

      expect(entries).toEqual(['first', 'second', 'third'])
    })

    it('wire format encodes and decodes correctly', () => {
      const envelope = createEnvelope(123, { test: 'data', nested: { value: 42 } })
      const encoded = encode(envelope)
      const decoded = decode<{ test: string; nested: { value: number } }>(encoded)

      expect(decoded.seq).toBe(123)
      expect(decoded.payload.test).toBe('data')
      expect(decoded.payload.nested.value).toBe(42)
    })
  })

  describe('Observability Integration', () => {
    let tracer: Tracer
    let observer: MockLLMObserver
    let latencyTracker: LatencyTracker
    let swarmMetrics: SwarmMetricsCollector

    beforeAll(() => {
      tracer = new Tracer({ serviceName: 'integration-test' })
      observer = new MockLLMObserver()
      latencyTracker = new LatencyTracker()
      swarmMetrics = new SwarmMetricsCollector()
    })

    it('traces cross-component spans', () => {
      // Start a trace for a request
      const rootSpan = tracer.startTrace('http-request', SpanCategory.HTTP_REQUEST)

      // Create child spans for components
      const llmSpan = tracer.startSpan(rootSpan, 'llm-call', SpanCategory.LLM_CALL)
      tracer.endSpan(llmSpan)

      const toolSpan = tracer.startSpan(rootSpan, 'tool-exec', SpanCategory.TOOL_EXECUTION)
      tracer.endSpan(toolSpan)

      tracer.endSpan(rootSpan)

      // Verify spans are linked
      expect(llmSpan.traceId).toBe(rootSpan.traceId)
      expect(llmSpan.parentSpanId).toBe(rootSpan.spanId)
      expect(toolSpan.traceId).toBe(rootSpan.traceId)
    })

    it('records LLM events', () => {
      const trace = observer.startTrace('tenant-1', 'thread-1')

      observer.recordGeneration(trace, {
        model: 'claude-3-opus',
        prompt: 'Hello',
        completion: 'Hi there!',
        promptTokens: 10,
        completionTokens: 5,
        latencyMs: 500,
      })

      observer.recordToolSpan(trace, {
        name: 'search',
        input: { query: 'test' },
        output: { results: [] },
        durationMs: 100,
        status: 'success',
      })

      expect(observer.traces.length).toBe(1)
      expect(observer.generations.length).toBe(1)
      expect(observer.toolSpans.length).toBe(1)
    })

    it('tracks latency breakdown', async () => {
      latencyTracker.trackRequest('req-1')

      const comp1 = latencyTracker.trackComponent('req-1', 'llm')
      await new Promise((r) => setTimeout(r, 10))
      comp1.stop()

      const comp2 = latencyTracker.trackComponent('req-1', 'tools')
      await new Promise((r) => setTimeout(r, 10))
      comp2.stop()

      latencyTracker.stopRequest('req-1')

      const breakdown = latencyTracker.getBreakdown('req-1')

      expect(breakdown).not.toBeNull()
      expect(breakdown!.components.length).toBe(2)
      expect(breakdown!.total).toBeGreaterThan(0)
    })

    it('collects swarm metrics', () => {
      swarmMetrics.recordVerdict({
        decision: 'normal',
        confidence: 0.9,
        probNormal: 0.9,
        probSuspicious: 0.07,
        probMalicious: 0.03,
        stanceStdDev: 0.1,
        agentVotes: 5,
      })

      const metrics = swarmMetrics.getConsensusMetrics()

      expect(metrics.verdictsTotal).toBe(1)
      expect(metrics.consensusReached).toBe(1)
      expect(metrics.avgConfidence).toBeCloseTo(0.9)
    })
  })

  describe('Guardrails Integration', () => {
    let filter: ReturnType<typeof createDefaultFilter>
    let guards: ReturnType<typeof createDefaultGuardRegistry>
    let constitution: ReturnType<typeof createDefaultConstitution>
    let auditLogger: ReturnType<typeof createInMemoryAuditLogger>

    beforeAll(() => {
      filter = createDefaultFilter()
      guards = createDefaultGuardRegistry()
      constitution = createDefaultConstitution()
      auditLogger = createInMemoryAuditLogger()
    })

    it('filters PII content', () => {
      const result = filter.filterInput('My SSN is 123-45-6789')

      expect(result.flags).toContain('pii_detected')
      expect(result.allowed).toBe(true) // PII is flagged but allowed
    })

    it('blocks credential leaks', () => {
      const result = filter.filterInput('api_key=sk_live_abcdefghij1234567890')

      expect(result.allowed).toBe(false)
      expect(result.flags).toContain('credential_detected')
    })

    it('guards dangerous commands', () => {
      const context = {
        tenantId: 't1',
        requestId: 'r1',
        permissions: [],
      }

      const result = guards.preExecute('shell', { command: 'rm -rf /' }, context)

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('dangerous')
    })

    it('checks scope boundaries', () => {
      // In-scope request
      const inScope = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Explain how SQL injection works'
      )
      expect(inScope.allowed).toBe(true)

      // Out-of-scope request
      const outOfScope = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Write an exploit for this CVE'
      )
      expect(outOfScope.allowed).toBe(false)
    })

    it('enforces constitution principles', () => {
      const context = { tenantId: 't1', threadId: 'th1' }

      // Compliant request
      const compliant = constitution.check('Help me secure my application', context)
      expect(compliant.compliant).toBe(true)

      // Non-compliant request
      const nonCompliant = constitution.check('Create malware for me', context)
      expect(nonCompliant.compliant).toBe(false)
    })

    it('logs audit events', async () => {
      const { logger, storage, alerter } = auditLogger

      await logger.logScopeViolation(
        'tenant-1',
        'request-1',
        'exploit-request',
        'Offensive security request blocked'
      )

      const events = storage.getAll()
      expect(events.length).toBe(1)
      expect(events[0].eventType).toBe('scope_violation')

      // Critical events trigger alerts
      const alerts = alerter.getAlerts()
      expect(alerts.length).toBe(1)
      expect(alerts[0].severity).toBe('high')
    })
  })

  describe('Cross-Component Integration', () => {
    it('skill trigger → guardrails → tool execution', async () => {
      // 1. Match skill trigger
      const matcher = new SimpleKeywordMatcher()
      matcher.registerSkill(
        createMockSkill('security-research', ['explain vulnerability', 'analyze CVE'])
      )

      const matches = matcher.matchSkills('explain vulnerability')
      expect(matches.length).toBeGreaterThan(0)

      // 2. Check guardrails
      const filter = createDefaultFilter()
      const filterResult = filter.filterInput('explain vulnerability in SQL injection')
      expect(filterResult.allowed).toBe(true)

      // 3. Execute tool
      const executor = new ToolExecutor({ maxWorkers: 2, defaultTimeoutMs: 1000 })
      executor.register('search', async () => ({
        output: 'SQL injection info...',
        status: 'success',
      }))

      const result = await executor.executeSingle({
        id: '1',
        name: 'search',
        arguments: { query: 'SQL injection' },
      })

      expect(result.status).toBe('success')
    })

    it('request → tracing → metrics → audit', async () => {
      // 1. Start trace
      const tracer = new Tracer({ serviceName: 'test' })
      const span = tracer.startTrace('request', SpanCategory.HTTP_REQUEST)

      // 2. Track latency
      const latencyTracker = new LatencyTracker()
      latencyTracker.trackRequest('req-1')
      const compTimer = latencyTracker.trackComponent('req-1', 'process')

      // Simulate work
      await new Promise((r) => setTimeout(r, 5))

      compTimer.stop()
      latencyTracker.stopRequest('req-1')

      // 3. Record metrics
      const swarmMetrics = new SwarmMetricsCollector()
      swarmMetrics.recordVerdict({
        decision: 'normal',
        confidence: 0.85,
        probNormal: 0.85,
        probSuspicious: 0.1,
        probMalicious: 0.05,
        stanceStdDev: 0.15,
        agentVotes: 3,
      })

      // 4. Log audit event
      const { logger, storage } = createInMemoryAuditLogger()
      await logger.logContentFiltered('t1', 'r1', 'allowed', [], 'Clean request')

      // End trace
      tracer.endSpan(span)

      // Verify all components captured data
      const breakdown = latencyTracker.getBreakdown('req-1')
      expect(breakdown).not.toBeNull()

      const metrics = swarmMetrics.getConsensusMetrics()
      expect(metrics.verdictsTotal).toBe(1)

      const events = storage.getAll()
      expect(events.length).toBe(1)
    })

    it('deterministic replay with tracing', () => {
      // 1. Create deterministic context
      const rng = new SeededRng(12345)
      const log = new ReplayLog<{ action: string; value: number }>(12345)

      // 2. Start tracing
      const tracer = new Tracer({ serviceName: 'replay-test' })
      const span = tracer.startTrace('replay-session', SpanCategory.ORACLE_LOOP)

      // 3. Record actions with RNG
      log.startRecording()
      for (let i = 0; i < 5; i++) {
        const value = rng.nextInt(1, 100)
        log.record(createEnvelope(i, { action: `step-${i}`, value }))
      }
      log.stopRecording()
      tracer.endSpan(span)

      // 4. Replay and verify determinism
      const rng2 = new SeededRng(12345)
      const iterator = log.replay()
      let i = 0
      let result = iterator.next()
      while (!result.done) {
        const expectedValue = rng2.nextInt(1, 100)
        expect(result.value.envelope.payload.value).toBe(expectedValue)
        i++
        result = iterator.next()
      }
      expect(i).toBe(5)
    })
  })
})
