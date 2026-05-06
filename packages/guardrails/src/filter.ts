/**
 * Content Filter
 *
 * Multi-layer content filtering for PII, PHI, credentials, and harmful content.
 */

import type { ContentFlag, FilterResult, FilterLayer } from './types.js'

// =============================================================================
// Content Filter
// =============================================================================

export interface ContentFilter {
  filterInput(content: string): FilterResult
  filterOutput(content: string): FilterResult
  filterToolCall(tool: string, args: unknown): FilterResult
}

/**
 * Multi-layer content filter
 */
export class MultiLayerFilter implements ContentFilter {
  private layers: FilterLayer[] = []

  /**
   * Add a filter layer
   */
  addLayer(layer: FilterLayer): void {
    this.layers.push(layer)
  }

  /**
   * Filter input content
   */
  filterInput(content: string): FilterResult {
    return this.runLayers(content)
  }

  /**
   * Filter output content
   */
  filterOutput(content: string): FilterResult {
    return this.runLayers(content)
  }

  /**
   * Filter tool call arguments
   */
  filterToolCall(tool: string, args: unknown): FilterResult {
    const content = JSON.stringify(args)
    return this.runLayers(content)
  }

  private runLayers(content: string): FilterResult {
    const allFlags: ContentFlag[] = []
    const detectedTypes: string[] = []

    for (const layer of this.layers) {
      const result = layer.check(content)

      if (!result.allowed) {
        return {
          ...result,
          flags: [...allFlags, ...result.flags],
          detectedTypes: [...detectedTypes, ...(result.detectedTypes ?? [])],
        }
      }

      allFlags.push(...result.flags)
      if (result.detectedTypes) {
        detectedTypes.push(...result.detectedTypes)
      }
    }

    return {
      allowed: true,
      flags: allFlags,
      detectedTypes: detectedTypes.length > 0 ? detectedTypes : undefined,
    }
  }
}

// =============================================================================
// PII Filter
// =============================================================================

export class PIIFilter implements FilterLayer {
  name = 'pii'

  private patterns: Record<string, RegExp> = {
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    dateOfBirth: /\b(?:dob|date of birth|born)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
  }

  check(content: string): FilterResult {
    const detected: string[] = []

    for (const [type, pattern] of Object.entries(this.patterns)) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0
      if (pattern.test(content)) {
        detected.push(type)
      }
    }

    return {
      allowed: true, // Allow but flag
      flags: detected.length > 0 ? ['pii_detected'] : [],
      detectedTypes: detected,
      reason: detected.length > 0
        ? `Detected PII types: ${detected.join(', ')}`
        : undefined,
    }
  }

  /**
   * Redact PII from content
   */
  redact(content: string): string {
    let redacted = content

    for (const [type, pattern] of Object.entries(this.patterns)) {
      pattern.lastIndex = 0
      redacted = redacted.replace(pattern, `[REDACTED:${type.toUpperCase()}]`)
    }

    return redacted
  }
}

// =============================================================================
// PHI Filter (HIPAA)
// =============================================================================

export class PHIFilter implements FilterLayer {
  name = 'phi'

  private patterns: Record<string, RegExp> = {
    medicalRecordNumber: /\bMRN[:\s#]*\d+\b/gi,
    diagnosis: /\b(?:diagnosis|dx|diagnosed with)[:\s]+[A-Za-z\s]+/gi,
    medication: /\b(?:medication|rx|prescribed)[:\s]+[A-Za-z\s]+/gi,
    healthInsurance: /\b(?:policy|member|insurance)\s*(?:#|number)?[:\s]*[A-Z0-9-]+\b/gi,
    labResult: /\b(?:lab|test|result)[:\s]+[A-Za-z0-9.\s]+/gi,
    healthCondition: /\b(?:patient has|suffers from|history of)[:\s]+[A-Za-z\s]+/gi,
  }

  check(content: string): FilterResult {
    const detected: string[] = []

    for (const [type, pattern] of Object.entries(this.patterns)) {
      pattern.lastIndex = 0
      if (pattern.test(content)) {
        detected.push(type)
      }
    }

    return {
      allowed: true, // Allow but flag
      flags: detected.length > 0 ? ['phi_detected'] : [],
      detectedTypes: detected,
      reason: detected.length > 0
        ? `Detected PHI types: ${detected.join(', ')}. Ensure HIPAA compliance.`
        : undefined,
    }
  }

  /**
   * Redact PHI from content
   */
  redact(content: string): string {
    let redacted = content

    for (const [type, pattern] of Object.entries(this.patterns)) {
      pattern.lastIndex = 0
      redacted = redacted.replace(pattern, `[REDACTED:${type.toUpperCase()}]`)
    }

    return redacted
  }
}

// =============================================================================
// Credential Filter
// =============================================================================

export class CredentialFilter implements FilterLayer {
  name = 'credentials'

  private patterns: Record<string, RegExp> = {
    apiKey: /\b(?:api[_-]?key|apikey)[:\s=]*['"]?[a-zA-Z0-9-_]{16,}['"]?/gi,
    password: /\b(?:password|passwd|pwd)[:\s=]*['"]?[^\s'"]{4,}['"]?/gi,
    token: /\b(?:token|bearer)[:\s=]*['"]?[a-zA-Z0-9-_.]{20,}['"]?/gi,
    awsKey: /\bAKIA[0-9A-Z]{16}\b/g,
    awsSecret: /\b[a-zA-Z0-9/+=]{40}\b/g, // AWS secret key pattern
    privateKey: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    gitHubToken: /\bgh[pousr]_[a-zA-Z0-9]{36,}\b/g,
    slackToken: /\bxox[baprs]-[a-zA-Z0-9-]+\b/g,
    stripeKey: /\b(?:sk|pk)_(?:live|test)_[a-zA-Z0-9]{24,}\b/g,
    connectionString: /\b(?:postgres|mysql|mongodb|redis):\/\/[^\s]+/gi,
  }

  check(content: string): FilterResult {
    for (const [type, pattern] of Object.entries(this.patterns)) {
      pattern.lastIndex = 0
      if (pattern.test(content)) {
        return {
          allowed: false,
          flags: ['credential_detected'],
          detectedTypes: [type],
          reason: `Detected potential credential: ${type}. Never include credentials in requests.`,
        }
      }
    }

    return {
      allowed: true,
      flags: [],
    }
  }
}

// =============================================================================
// Harmful Content Filter
// =============================================================================

export class HarmfulContentFilter implements FilterLayer {
  name = 'harmful'

  private patterns: Record<string, RegExp> = {
    exploitCode: /\b(?:shellcode|payload|exploit|0day)\b/gi,
    malwareTerms: /\b(?:malware|ransomware|trojan|rootkit|botnet|keylogger)\b.*(?:create|write|build|make)/gi,
    attackCommands: /\b(?:rm\s+-rf|format\s+c:|del\s+\/[fqs])/gi,
    injectionPatterns: /(?:';|"--|<script>|{{|%{|eval\(|exec\()/gi,
  }

  check(content: string): FilterResult {
    const detected: string[] = []

    for (const [type, pattern] of Object.entries(this.patterns)) {
      pattern.lastIndex = 0
      if (pattern.test(content)) {
        detected.push(type)
      }
    }

    if (detected.length > 0) {
      return {
        allowed: false,
        flags: ['harmful_instruction'],
        detectedTypes: detected,
        reason: `Potentially harmful content detected: ${detected.join(', ')}`,
      }
    }

    return {
      allowed: true,
      flags: [],
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a multi-layer filter with all default layers
 */
export function createDefaultFilter(): MultiLayerFilter {
  const filter = new MultiLayerFilter()
  filter.addLayer(new CredentialFilter()) // Check credentials first (blocks)
  filter.addLayer(new HarmfulContentFilter()) // Check harmful content (blocks)
  filter.addLayer(new PIIFilter()) // Check PII (flags)
  filter.addLayer(new PHIFilter()) // Check PHI (flags)
  return filter
}

/**
 * Create a filter with specific layers
 */
export function createFilter(...layers: FilterLayer[]): MultiLayerFilter {
  const filter = new MultiLayerFilter()
  for (const layer of layers) {
    filter.addLayer(layer)
  }
  return filter
}
