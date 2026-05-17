// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Scope Boundary Framework
 *
 * Defines what agents can and cannot help with.
 */

import type {
  ScopeBoundary,
  ScopeItem,
  ScopeCategory,
  ViolationType,
  GuardrailResponse,
} from './types.js'

// =============================================================================
// Scope Boundary Registry
// =============================================================================

export class ScopeBoundaryRegistry {
  private boundaries: Map<string, ScopeBoundary> = new Map()

  /**
   * Register a scope boundary
   */
  register(boundary: ScopeBoundary): void {
    this.boundaries.set(boundary.name, boundary)
  }

  /**
   * Get a scope boundary by name
   */
  get(name: string): ScopeBoundary | undefined {
    return this.boundaries.get(name)
  }

  /**
   * List all registered boundaries
   */
  list(): string[] {
    return Array.from(this.boundaries.keys())
  }

  /**
   * Check if a request is in scope for a boundary
   */
  checkScope(boundaryName: string, request: string): GuardrailResponse {
    const boundary = this.boundaries.get(boundaryName)
    if (!boundary) {
      return {
        allowed: true,
        message: 'No scope boundary defined',
        logEvent: false,
      }
    }

    return checkRequestScope(boundary, request)
  }
}

// =============================================================================
// Scope Checking
// =============================================================================

/**
 * Check if a request is within scope
 */
export function checkRequestScope(
  boundary: ScopeBoundary,
  request: string
): GuardrailResponse {
  const normalizedRequest = request.toLowerCase()

  // Check for out-of-scope patterns first
  for (const item of boundary.outOfScope) {
    const match = matchesScopeItem(item, normalizedRequest)
    if (match) {
      const violation: ViolationType = {
        scope: boundary.name,
        item: item.description,
        reason: item.rationale ?? 'Request outside defined scope',
        alternative: suggestAlternative(boundary, item),
      }
      return boundary.violationHandler(request, violation)
    }
  }

  // Check if in-scope (optional - may allow requests that don't match any pattern)
  return {
    allowed: true,
    message: 'Request is within scope',
    logEvent: false,
  }
}

/**
 * Check if content matches a scope item
 */
function matchesScopeItem(item: ScopeItem, content: string): boolean {
  // Check examples as substring matches
  for (const example of item.examples) {
    // Extract key phrases from example
    const keywords = extractKeywords(example.toLowerCase())
    const matchCount = keywords.filter((kw) => content.includes(kw)).length

    // If most keywords match, consider it a match
    if (matchCount >= Math.ceil(keywords.length * 0.6)) {
      return true
    }
  }

  return false
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  // Remove common words
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'of',
    'about', 'against', 'me', 'my', 'i', 'you', 'your', 'he', 'she', 'it',
    'we', 'they', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
    'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'write', 'create', 'make', 'give', 'help', 'tell', 'show',
  ])

  return text
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
}

/**
 * Suggest an alternative for a blocked request
 */
function suggestAlternative(
  boundary: ScopeBoundary,
  blockedItem: ScopeItem
): string {
  // Find related in-scope items
  const keywords = extractKeywords(blockedItem.description.toLowerCase())

  for (const inScopeItem of boundary.inScope) {
    const inScopeKeywords = extractKeywords(inScopeItem.description.toLowerCase())
    const overlap = keywords.filter((kw) => inScopeKeywords.includes(kw))

    if (overlap.length > 0) {
      return `Instead, I can help with: ${inScopeItem.description}. Examples: ${inScopeItem.examples[0]}`
    }
  }

  return `Try asking about: ${boundary.inScope[0]?.description ?? 'a topic within my scope'}`
}

// =============================================================================
// Pre-defined Scope Boundaries
// =============================================================================

/**
 * Security Research Scope Boundary
 */
export const SECURITY_RESEARCH_SCOPE: ScopeBoundary = {
  name: 'security-research',
  category: 'security',

  inScope: [
    {
      description: 'Analyzing vulnerability classes, root causes, and mitigations',
      examples: ['Explain how SQL injection works', 'What are common buffer overflow mitigations?'],
    },
    {
      description: 'Studying attacker techniques to design detectors and defenses',
      examples: ['How do I detect lateral movement?', 'What indicators suggest ransomware?'],
    },
    {
      description: 'Building datasets and benchmarks for security ML',
      examples: ['How to structure a malware classification dataset?', 'Features for network anomaly detection'],
    },
    {
      description: 'CVE analysis, SoK papers, taxonomy work',
      examples: ['Summarize CVE-2024-1234', 'Categorize these vulnerabilities by CWE'],
    },
    {
      description: 'Responsible disclosure processes',
      examples: ['How do I report a vulnerability?', 'What is coordinated disclosure?'],
    },
    {
      description: 'Threat modeling for defensive purposes',
      examples: ['Help me threat model my API', 'What STRIDE threats apply here?'],
    },
  ],

  outOfScope: [
    {
      description: 'Producing functional exploits for unpatched vulnerabilities',
      examples: ['Write an exploit for CVE', 'Give me working shellcode', 'exploit code'],
      rationale: 'Could enable attacks on unpatched systems',
    },
    {
      description: 'Generating malware, ransomware, or weaponized PoCs',
      examples: ['Write a keylogger', 'Create ransomware', 'build malware'],
      rationale: 'Direct harm potential',
    },
    {
      description: 'Attacking systems without authorization',
      examples: ['hack email', 'penetrate server', 'break into'],
      rationale: 'Unauthorized access is illegal',
    },
    {
      description: 'Bypassing protections on unauthorized systems',
      examples: ['bypass WAF', 'evade EDR', 'circumvent firewall'],
      rationale: 'Facilitates unauthorized access',
    },
    {
      description: 'Surveillance, stalkerware, or tracking without consent',
      examples: ['track location', 'monitor messages', 'spy on'],
      rationale: 'Privacy violation and potential abuse',
    },
    {
      description: 'Generating phishing content or social engineering scripts',
      examples: ['phishing email', 'pretexting script', 'social engineer'],
      rationale: 'Facilitates fraud and deception',
    },
  ],

  violationHandler: (request, violation) => ({
    allowed: false,
    message: `This request falls outside my scope. I focus on defensive security research. ${violation.reason}`,
    suggestion: violation.alternative,
    logEvent: true,
  }),
}

/**
 * Privacy Protection Scope Boundary
 */
export const PRIVACY_SCOPE: ScopeBoundary = {
  name: 'privacy-protection',
  category: 'privacy',

  inScope: [
    {
      description: 'Implementing privacy-preserving systems',
      examples: ['How to implement differential privacy?', 'Best practices for data minimization'],
    },
    {
      description: 'GDPR/CCPA compliance guidance',
      examples: ['What are GDPR requirements for data retention?', 'CCPA opt-out implementation'],
    },
    {
      description: 'Anonymization and pseudonymization techniques',
      examples: ['How to anonymize a dataset?', 'K-anonymity vs differential privacy'],
    },
  ],

  outOfScope: [
    {
      description: 'Deanonymizing individuals from datasets',
      examples: ['identify person from data', 'deanonymize users', 'unmask identity'],
      rationale: 'Violates privacy protections',
    },
    {
      description: 'Circumventing privacy controls',
      examples: ['bypass consent', 'avoid privacy settings', 'circumvent GDPR'],
      rationale: 'Undermines privacy rights',
    },
    {
      description: 'Collecting data without consent',
      examples: ['scrape personal data', 'harvest emails', 'collect without permission'],
      rationale: 'Illegal data collection',
    },
  ],

  violationHandler: (request, violation) => ({
    allowed: false,
    message: `Privacy protection is paramount. ${violation.reason}`,
    suggestion: violation.alternative,
    logEvent: true,
  }),
}

/**
 * Create a default scope registry with common boundaries
 */
export function createDefaultScopeRegistry(): ScopeBoundaryRegistry {
  const registry = new ScopeBoundaryRegistry()
  registry.register(SECURITY_RESEARCH_SCOPE)
  registry.register(PRIVACY_SCOPE)
  return registry
}
