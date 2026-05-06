/**
 * Wire Format Tests
 */

import { describe, it, expect } from 'vitest'
import {
  encode,
  decode,
  encodeToArray,
  decodeFromArray,
  readFrameLength,
  hasCompleteFrame,
  extractFrame,
  WireFormatError,
} from '../wire.js'
import { createEnvelope, type Envelope } from '../types.js'

describe('encode/decode roundtrip', () => {
  it('roundtrips simple envelope', () => {
    const original = createEnvelope(1, { message: 'hello' })
    const encoded = encode(original)
    const decoded = decode<{ message: string }>(encoded)

    expect(decoded.seq).toBe(original.seq)
    expect(decoded.payload.message).toBe('hello')
  })

  it('roundtrips complex payload', () => {
    const payload = {
      tenantId: 'tenant-123',
      threadId: 'thread-456',
      tools: [
        { name: 'search', args: { query: 'test' } },
        { name: 'fetch', args: { url: 'https://example.com' } },
      ],
      nested: { deep: { value: 42 } },
    }

    const original = createEnvelope(100, payload)
    const decoded = decode<typeof payload>(encode(original))

    expect(decoded.payload).toEqual(payload)
  })

  it('preserves timestamps', () => {
    const original = createEnvelope(1, 'test')
    const decoded = decode<string>(encode(original))

    expect(decoded.tsEventUs).toBe(original.tsEventUs)
    expect(decoded.tsRecvUs).toBe(original.tsRecvUs)
  })
})

describe('encode', () => {
  it('creates frame with 4-byte length prefix', () => {
    const envelope = createEnvelope(1, 'test')
    const encoded = encode(envelope)

    // First 4 bytes are big-endian length
    expect(encoded.length).toBeGreaterThan(4)
    const length = encoded.readUInt32BE(0)
    expect(length).toBe(encoded.length - 4)
  })

  it('uses big-endian byte order', () => {
    const envelope = createEnvelope(1, 'test')
    const encoded = encode(envelope)

    const length = encoded.readUInt32BE(0)
    const lengthLE = encoded.readUInt32LE(0)

    // These should differ for multi-byte numbers
    // (unless the length happens to be a value that's same in both endianness)
    expect(length).toBe(encoded.length - 4)
  })
})

describe('decode', () => {
  it('throws on insufficient data', () => {
    const shortBuffer = Buffer.alloc(2)

    expect(() => decode(shortBuffer)).toThrow(WireFormatError)
    try {
      decode(shortBuffer)
    } catch (e) {
      expect((e as WireFormatError).code).toBe('INSUFFICIENT_DATA')
    }
  })

  it('throws on truncated payload', () => {
    const buffer = Buffer.alloc(8)
    buffer.writeUInt32BE(100, 0) // Says payload is 100 bytes but we only have 4

    expect(() => decode(buffer)).toThrow(WireFormatError)
    try {
      decode(buffer)
    } catch (e) {
      expect((e as WireFormatError).code).toBe('INSUFFICIENT_DATA')
    }
  })

  it('throws on invalid JSON', () => {
    const invalidJson = 'not valid json'
    const payload = Buffer.from(invalidJson)
    const buffer = Buffer.alloc(4 + payload.length)
    buffer.writeUInt32BE(payload.length, 0)
    payload.copy(buffer, 4)

    expect(() => decode(buffer)).toThrow(WireFormatError)
    try {
      decode(buffer)
    } catch (e) {
      expect((e as WireFormatError).code).toBe('INVALID_JSON')
    }
  })

  it('throws on invalid envelope structure', () => {
    const badEnvelope = { notAnEnvelope: true }
    const json = JSON.stringify(badEnvelope)
    const payload = Buffer.from(json)
    const buffer = Buffer.alloc(4 + payload.length)
    buffer.writeUInt32BE(payload.length, 0)
    payload.copy(buffer, 4)

    expect(() => decode(buffer)).toThrow(WireFormatError)
    try {
      decode(buffer)
    } catch (e) {
      expect((e as WireFormatError).code).toBe('INVALID_ENVELOPE')
    }
  })
})

describe('Uint8Array versions', () => {
  it('roundtrips with encodeToArray/decodeFromArray', () => {
    const original = createEnvelope(42, { data: [1, 2, 3] })
    const encoded = encodeToArray(original)
    const decoded = decodeFromArray<{ data: number[] }>(encoded)

    expect(decoded.seq).toBe(42)
    expect(decoded.payload.data).toEqual([1, 2, 3])
  })

  it('produces same output as Buffer version', () => {
    const envelope = createEnvelope(1, 'test')
    const bufferEncoded = encode(envelope)
    const arrayEncoded = encodeToArray(envelope)

    expect(Array.from(arrayEncoded)).toEqual(Array.from(bufferEncoded))
  })
})

describe('readFrameLength', () => {
  it('reads length from Buffer', () => {
    const buffer = Buffer.alloc(8)
    buffer.writeUInt32BE(12345, 0)

    expect(readFrameLength(buffer)).toBe(12345)
  })

  it('reads length from Uint8Array', () => {
    const array = new Uint8Array(8)
    const view = new DataView(array.buffer)
    view.setUint32(0, 12345, false) // Big-endian

    expect(readFrameLength(array)).toBe(12345)
  })

  it('throws on short buffer', () => {
    expect(() => readFrameLength(Buffer.alloc(2))).toThrow(WireFormatError)
  })
})

describe('hasCompleteFrame', () => {
  it('returns false for short buffer', () => {
    expect(hasCompleteFrame(Buffer.alloc(2))).toBe(false)
  })

  it('returns false for incomplete payload', () => {
    const buffer = Buffer.alloc(8)
    buffer.writeUInt32BE(100, 0) // Says 100 bytes but only 4 available

    expect(hasCompleteFrame(buffer)).toBe(false)
  })

  it('returns true for complete frame', () => {
    const envelope = createEnvelope(1, 'test')
    const encoded = encode(envelope)

    expect(hasCompleteFrame(encoded)).toBe(true)
  })
})

describe('extractFrame', () => {
  it('extracts single frame', () => {
    const envelope = createEnvelope(1, 'test')
    const buffer = encode(envelope)

    const result = extractFrame(buffer)

    expect(result).not.toBeNull()
    expect(result!.frame.length).toBe(buffer.length)
    expect(result!.remaining.length).toBe(0)
  })

  it('extracts first frame from multiple', () => {
    const env1 = createEnvelope(1, 'first')
    const env2 = createEnvelope(2, 'second')
    const combined = Buffer.concat([encode(env1), encode(env2)])

    const result = extractFrame(combined)

    expect(result).not.toBeNull()
    expect(decode<string>(result!.frame).payload).toBe('first')
    expect(result!.remaining.length).toBeGreaterThan(0)

    // Extract second frame
    const result2 = extractFrame(result!.remaining)
    expect(result2).not.toBeNull()
    expect(decode<string>(result2!.frame).payload).toBe('second')
  })

  it('returns null for incomplete frame', () => {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32BE(100, 0)

    expect(extractFrame(buffer)).toBeNull()
  })
})
