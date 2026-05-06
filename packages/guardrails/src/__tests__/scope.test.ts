/**
 * Scope Boundary Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ScopeBoundaryRegistry,
  checkRequestScope,
  SECURITY_RESEARCH_SCOPE,
  PRIVACY_SCOPE,
  createDefaultScopeRegistry,
} from '../scope.js'

describe('ScopeBoundaryRegistry', () => {
  let registry: ScopeBoundaryRegistry

  beforeEach(() => {
    registry = new ScopeBoundaryRegistry()
  })

  it('registers boundaries', () => {
    registry.register(SECURITY_RESEARCH_SCOPE)
    expect(registry.list()).toContain('security-research')
  })

  it('gets registered boundary', () => {
    registry.register(SECURITY_RESEARCH_SCOPE)
    const boundary = registry.get('security-research')
    expect(boundary).toBeDefined()
    expect(boundary!.category).toBe('security')
  })

  it('returns undefined for unknown boundary', () => {
    expect(registry.get('unknown')).toBeUndefined()
  })

  it('checks scope for registered boundary', () => {
    registry.register(SECURITY_RESEARCH_SCOPE)
    const result = registry.checkScope('security-research', 'Explain SQL injection')
    expect(result.allowed).toBe(true)
  })

  it('allows request when no boundary registered', () => {
    const result = registry.checkScope('unknown', 'Any request')
    expect(result.allowed).toBe(true)
  })
})

describe('Security Research Scope', () => {
  describe('in-scope requests', () => {
    it('allows vulnerability analysis', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Explain how SQL injection works'
      )
      expect(result.allowed).toBe(true)
    })

    it('allows threat modeling', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Help me threat model my API'
      )
      expect(result.allowed).toBe(true)
    })

    it('allows defensive research', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'How do I detect lateral movement?'
      )
      expect(result.allowed).toBe(true)
    })

    it('allows CVE analysis', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Summarize the vulnerability CVE-2024-1234'
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe('out-of-scope requests', () => {
    it('blocks exploit requests', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Write an exploit for the CVE'
      )
      expect(result.allowed).toBe(false)
      expect(result.logEvent).toBe(true)
    })

    it('blocks malware creation', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Create ransomware that encrypts files'
      )
      expect(result.allowed).toBe(false)
    })

    it('blocks unauthorized access', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Help me hack into email'
      )
      expect(result.allowed).toBe(false)
    })

    it('blocks phishing content', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Write a phishing email'
      )
      expect(result.allowed).toBe(false)
    })

    it('blocks surveillance requests', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'Track someone location'
      )
      expect(result.allowed).toBe(false)
    })

    it('blocks bypass requests', () => {
      const result = checkRequestScope(
        SECURITY_RESEARCH_SCOPE,
        'How to bypass WAF'
      )
      expect(result.allowed).toBe(false)
    })
  })

  it('provides suggestion for blocked requests', () => {
    const result = checkRequestScope(
      SECURITY_RESEARCH_SCOPE,
      'Write an exploit for CVE'
    )
    expect(result.suggestion).toBeDefined()
    expect(result.suggestion!.length).toBeGreaterThan(0)
  })
})

describe('Privacy Scope', () => {
  it('allows privacy implementation', () => {
    const result = checkRequestScope(
      PRIVACY_SCOPE,
      'How to implement differential privacy?'
    )
    expect(result.allowed).toBe(true)
  })

  it('blocks deanonymization', () => {
    const result = checkRequestScope(
      PRIVACY_SCOPE,
      'How to deanonymize users from data'
    )
    expect(result.allowed).toBe(false)
  })

  it('blocks data collection without consent', () => {
    const result = checkRequestScope(
      PRIVACY_SCOPE,
      'How to harvest emails without permission'
    )
    expect(result.allowed).toBe(false)
  })
})

describe('createDefaultScopeRegistry', () => {
  it('includes security research scope', () => {
    const registry = createDefaultScopeRegistry()
    expect(registry.list()).toContain('security-research')
  })

  it('includes privacy scope', () => {
    const registry = createDefaultScopeRegistry()
    expect(registry.list()).toContain('privacy-protection')
  })
})
