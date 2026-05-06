/**
 * Content Filter Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  MultiLayerFilter,
  PIIFilter,
  PHIFilter,
  CredentialFilter,
  HarmfulContentFilter,
  createDefaultFilter,
  createFilter,
} from '../filter.js'

describe('PIIFilter', () => {
  let filter: PIIFilter

  beforeEach(() => {
    filter = new PIIFilter()
  })

  it('detects SSN', () => {
    const result = filter.check('My SSN is 123-45-6789')
    expect(result.flags).toContain('pii_detected')
    expect(result.detectedTypes).toContain('ssn')
    expect(result.allowed).toBe(true) // Allowed but flagged
  })

  it('detects credit card numbers', () => {
    const result = filter.check('Card: 4111-1111-1111-1111')
    expect(result.flags).toContain('pii_detected')
    expect(result.detectedTypes).toContain('creditCard')
  })

  it('detects email addresses', () => {
    const result = filter.check('Contact: user@example.com')
    expect(result.flags).toContain('pii_detected')
    expect(result.detectedTypes).toContain('email')
  })

  it('detects phone numbers', () => {
    const result = filter.check('Call me at 555-123-4567')
    expect(result.flags).toContain('pii_detected')
    expect(result.detectedTypes).toContain('phone')
  })

  it('detects IP addresses', () => {
    const result = filter.check('Server IP: 192.168.1.100')
    expect(result.flags).toContain('pii_detected')
    expect(result.detectedTypes).toContain('ipAddress')
  })

  it('does not flag clean content', () => {
    const result = filter.check('Hello, how are you today?')
    expect(result.flags).toHaveLength(0)
  })

  it('redacts PII', () => {
    const content = 'SSN: 123-45-6789, Email: test@example.com'
    const redacted = filter.redact(content)
    expect(redacted).toContain('[REDACTED:SSN]')
    expect(redacted).toContain('[REDACTED:EMAIL]')
    expect(redacted).not.toContain('123-45-6789')
  })
})

describe('PHIFilter', () => {
  let filter: PHIFilter

  beforeEach(() => {
    filter = new PHIFilter()
  })

  it('detects medical record numbers', () => {
    const result = filter.check('Patient MRN: 12345')
    expect(result.flags).toContain('phi_detected')
    expect(result.detectedTypes).toContain('medicalRecordNumber')
  })

  it('detects diagnosis', () => {
    const result = filter.check('Diagnosis: Type 2 Diabetes')
    expect(result.flags).toContain('phi_detected')
    expect(result.detectedTypes).toContain('diagnosis')
  })

  it('detects medication', () => {
    const result = filter.check('Medication: Metformin 500mg')
    expect(result.flags).toContain('phi_detected')
    expect(result.detectedTypes).toContain('medication')
  })

  it('detects health insurance info', () => {
    const result = filter.check('Policy # 12345ABC')
    expect(result.flags).toContain('phi_detected')
    expect(result.detectedTypes).toContain('healthInsurance')
  })

  it('allows non-PHI content', () => {
    const result = filter.check('The weather is nice today')
    expect(result.flags).toHaveLength(0)
  })

  it('redacts PHI', () => {
    const content = 'Patient MRN: 12345, Dx: Hypertension'
    const redacted = filter.redact(content)
    expect(redacted).toContain('[REDACTED')
  })
})

describe('CredentialFilter', () => {
  let filter: CredentialFilter

  beforeEach(() => {
    filter = new CredentialFilter()
  })

  it('blocks API keys', () => {
    const result = filter.check('api_key=sk_live_abc123def456ghi789')
    expect(result.allowed).toBe(false)
    expect(result.flags).toContain('credential_detected')
    expect(result.detectedTypes).toContain('apiKey')
  })

  it('blocks passwords', () => {
    const result = filter.check('password=mysecretpassword')
    expect(result.allowed).toBe(false)
    expect(result.flags).toContain('credential_detected')
  })

  it('blocks AWS access keys', () => {
    const result = filter.check('AKIAIOSFODNN7EXAMPLE')
    expect(result.allowed).toBe(false)
    expect(result.detectedTypes).toContain('awsKey')
  })

  it('blocks private keys', () => {
    const result = filter.check('-----BEGIN RSA PRIVATE KEY-----')
    expect(result.allowed).toBe(false)
    expect(result.detectedTypes).toContain('privateKey')
  })

  it('blocks GitHub tokens', () => {
    const result = filter.check('ghp_1234567890abcdefghijklmnopqrstuvwxyz')
    expect(result.allowed).toBe(false)
    expect(result.detectedTypes).toContain('gitHubToken')
  })

  it('blocks Stripe keys', () => {
    const result = filter.check('sk_test_FAKE1234567890abcdefgh')
    expect(result.allowed).toBe(false)
    expect(result.detectedTypes).toContain('stripeKey')
  })

  it('blocks connection strings', () => {
    const result = filter.check('postgres://user:pass@localhost/db')
    expect(result.allowed).toBe(false)
    expect(result.detectedTypes).toContain('connectionString')
  })

  it('allows clean content', () => {
    const result = filter.check('Just a normal message')
    expect(result.allowed).toBe(true)
    expect(result.flags).toHaveLength(0)
  })
})

describe('HarmfulContentFilter', () => {
  let filter: HarmfulContentFilter

  beforeEach(() => {
    filter = new HarmfulContentFilter()
  })

  it('blocks exploit code requests', () => {
    const result = filter.check('Give me the shellcode for this exploit')
    expect(result.allowed).toBe(false)
    expect(result.flags).toContain('harmful_instruction')
  })

  it('blocks malware creation', () => {
    const result = filter.check('Write malware that creates a botnet')
    expect(result.allowed).toBe(false)
  })

  it('blocks dangerous commands', () => {
    const result = filter.check('rm -rf /')
    expect(result.allowed).toBe(false)
  })

  it('allows safe content', () => {
    const result = filter.check('How do I secure my application?')
    expect(result.allowed).toBe(true)
  })
})

describe('MultiLayerFilter', () => {
  it('runs all layers', () => {
    const filter = createFilter(new PIIFilter(), new PHIFilter())
    const result = filter.filterInput('SSN: 123-45-6789, MRN: 12345')

    expect(result.flags).toContain('pii_detected')
    expect(result.flags).toContain('phi_detected')
  })

  it('stops on blocking layer', () => {
    const filter = createFilter(
      new CredentialFilter(),
      new PIIFilter()
    )

    const result = filter.filterInput('api_key=secret123456789012')
    expect(result.allowed).toBe(false)
    expect(result.flags).toContain('credential_detected')
  })

  it('filters tool calls', () => {
    const filter = createDefaultFilter()
    const result = filter.filterToolCall('http_request', {
      url: 'https://api.example.com',
      headers: { 'Authorization': 'Bearer sk_test_FAKE1234567890abcdefgh' },
    })
    expect(result.allowed).toBe(false)
  })
})

describe('createDefaultFilter', () => {
  it('includes all default layers', () => {
    const filter = createDefaultFilter()

    // Credentials are blocked
    expect(filter.filterInput('AKIAIOSFODNN7EXAMPLE').allowed).toBe(false)

    // PII is flagged but allowed
    const piiResult = filter.filterInput('SSN: 123-45-6789')
    expect(piiResult.allowed).toBe(true)
    expect(piiResult.flags).toContain('pii_detected')
  })
})
