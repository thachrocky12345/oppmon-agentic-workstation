// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Ethics Constitution
 *
 * Core principles that apply to all agent interactions.
 */

import type {
  Principle,
  EnforcementLevel,
  ConstitutionResult,
  AgentContext,
} from './types.js'

// =============================================================================
// Constitution Definition
// =============================================================================

export interface Constitution {
  principles: Principle[]
  check(request: string, context: AgentContext): ConstitutionResult
}

// =============================================================================
// Default Principles
// =============================================================================

export const DEFAULT_PRINCIPLES: Principle[] = [
  {
    name: 'plan_first',
    description: 'Plan before executing. No monolithic generation.',
    enforcement: 'soft',
  },
  {
    name: 'cite_not_invent',
    description: 'Never fabricate references, statistics, CVE numbers, or dataset names.',
    enforcement: 'hard',
  },
  {
    name: 'defensive_only',
    description: 'Security work is for defensive research, threat modeling, vulnerability detection.',
    enforcement: 'hard',
  },
  {
    name: 'reproducibility',
    description: 'Research must be traceable to data, code, hyperparameters, seeds.',
    enforcement: 'soft',
  },
  {
    name: 'tag_uncertainty',
    description: 'Mark uncertain claims with [VERIFY: reason].',
    enforcement: 'soft',
  },
  {
    name: 'distinguish_sources',
    description: 'Mark AI-generated content [DRAFT], never silently merge.',
    enforcement: 'soft',
  },
  {
    name: 'no_deception',
    description: 'Never impersonate humans or hide AI nature.',
    enforcement: 'hard',
  },
  {
    name: 'harm_avoidance',
    description: 'Avoid actions that could cause harm to individuals or systems.',
    enforcement: 'hard',
  },
  {
    name: 'privacy_preservation',
    description: 'Protect user privacy and minimize data collection.',
    enforcement: 'hard',
  },
  {
    name: 'transparency',
    description: 'Be transparent about capabilities and limitations.',
    enforcement: 'soft',
  },
]

// =============================================================================
// Principle Checkers
// =============================================================================

type PrincipleChecker = (request: string, context: AgentContext) => boolean

const PRINCIPLE_CHECKERS: Record<string, PrincipleChecker> = {
  cite_not_invent: (request) => {
    // Check for fabrication indicators
    const fabricationPatterns = [
      /(?:make up|invent|create|fabricate)\s+(?:a\s+)?(?:citation|reference|CVE|statistic)/i,
      /(?:fake|fictional)\s+(?:citation|reference|source|paper)/i,
      /generate\s+a\s+(?:fake|made-up)\s+/i,
    ]
    return !fabricationPatterns.some((p) => p.test(request))
  },

  defensive_only: (request) => {
    // Check for offensive security requests
    const offensivePatterns = [
      /(?:hack|attack|exploit|penetrate|breach)\s+(?:into\s+)?(?:the|a|their|my)?/i,
      /(?:create|write|build)\s+(?:an?\s+)?(?:exploit|malware|virus|trojan|ransomware)/i,
      /(?:bypass|evade|circumvent)\s+(?:security|protection|firewall|antivirus)/i,
      /(?:steal|exfiltrate|harvest)\s+(?:data|credentials|passwords)/i,
      /(?:denial of service|ddos|dos attack)/i,
      /remote\s+code\s+execution\s+(?:vulnerability|exploit)/i,
    ]
    return !offensivePatterns.some((p) => p.test(request))
  },

  no_deception: (request) => {
    // Check for deception requests
    const deceptionPatterns = [
      /(?:pretend|act like)\s+(?:you are|you're)\s+(?:a human|not an AI)/i,
      /(?:impersonate|pose as)\s+(?:a|an)\s+(?:person|human|real)/i,
      /(?:hide|conceal)\s+(?:that you are|your)\s+(?:an AI|artificial)/i,
      /(?:fake|forge)\s+(?:identity|credentials|documents)/i,
    ]
    return !deceptionPatterns.some((p) => p.test(request))
  },

  harm_avoidance: (request) => {
    // Check for harmful requests
    const harmPatterns = [
      /(?:how to|ways to)\s+(?:hurt|harm|injure|kill)\s+(?:someone|people|a person)/i,
      /(?:create|make|build)\s+(?:a\s+)?(?:weapon|bomb|explosive)/i,
      /(?:instructions for|guide to)\s+(?:violence|self-harm|suicide)/i,
      /(?:encourage|promote)\s+(?:illegal|dangerous)\s+(?:activity|behavior)/i,
    ]
    return !harmPatterns.some((p) => p.test(request))
  },

  privacy_preservation: (request) => {
    // Check for privacy violations
    const privacyPatterns = [
      /(?:find|get|retrieve)\s+(?:someone|someone's|their|his|her)\s+(?:address|phone|SSN|personal)/i,
      /(?:doxx|dox|expose)\s+(?:someone|a person)/i,
      /(?:stalk|track|monitor)\s+(?:someone|a person|their location)/i,
      /\bSSN\b.*\bfrom\b.*\bname\b/i,
    ]
    return !privacyPatterns.some((p) => p.test(request))
  },
}

// =============================================================================
// Constitution Implementation
// =============================================================================

/**
 * Ethics constitution checker
 */
export class EthicsConstitution implements Constitution {
  principles: Principle[]

  constructor(principles: Principle[] = DEFAULT_PRINCIPLES) {
    this.principles = principles
  }

  /**
   * Check if a request complies with the constitution
   */
  check(request: string, context: AgentContext): ConstitutionResult {
    const violations: string[] = []
    const warnings: string[] = []

    for (const principle of this.principles) {
      const checker = PRINCIPLE_CHECKERS[principle.name]
      if (!checker) continue

      const complies = checker(request, context)

      if (!complies) {
        if (principle.enforcement === 'hard') {
          violations.push(principle.name)
        } else {
          warnings.push(principle.name)
        }
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
      warnings,
    }
  }

  /**
   * Get principle by name
   */
  getPrinciple(name: string): Principle | undefined {
    return this.principles.find((p) => p.name === name)
  }

  /**
   * Get all hard-enforced principles
   */
  getHardPrinciples(): Principle[] {
    return this.principles.filter((p) => p.enforcement === 'hard')
  }

  /**
   * Get all soft-enforced principles
   */
  getSoftPrinciples(): Principle[] {
    return this.principles.filter((p) => p.enforcement === 'soft')
  }

  /**
   * Add a custom principle
   */
  addPrinciple(
    name: string,
    description: string,
    enforcement: EnforcementLevel,
    checker: PrincipleChecker
  ): void {
    this.principles.push({ name, description, enforcement })
    PRINCIPLE_CHECKERS[name] = checker
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create the default ethics constitution
 */
export function createDefaultConstitution(): EthicsConstitution {
  return new EthicsConstitution(DEFAULT_PRINCIPLES)
}
