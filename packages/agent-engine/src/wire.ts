/**
 * Wire Format Encoding/Decoding
 * TypeScript implementation compatible with Postcard binary format
 *
 * Frame Format:
 * ┌────────────────┬──────────────────────────┐
 * │ Length (4 BE)  │ JSON-encoded message     │
 * └────────────────┴──────────────────────────┘
 *
 * Note: This TypeScript version uses JSON for simplicity.
 * The actual Rust engine uses Postcard (a compact binary format).
 * The frame header (4-byte big-endian length) is compatible.
 */

import type { Envelope } from './types.js'

// ============================================================================
// Wire Format Errors
// ============================================================================

export class WireFormatError extends Error {
  constructor(
    message: string,
    public code: 'INSUFFICIENT_DATA' | 'INVALID_JSON' | 'INVALID_ENVELOPE'
  ) {
    super(message)
    this.name = 'WireFormatError'
  }
}

// ============================================================================
// Encoding
// ============================================================================

/**
 * Encode an envelope to wire format
 * @param envelope - The envelope to encode
 * @returns Buffer with length prefix and JSON payload
 */
export function encode<T>(envelope: Envelope<T>): Buffer {
  const json = JSON.stringify(envelope)
  const payload = Buffer.from(json, 'utf-8')
  const length = payload.length

  const frame = Buffer.alloc(4 + length)
  frame.writeUInt32BE(length, 0)
  payload.copy(frame, 4)

  return frame
}

/**
 * Encode an envelope to a Uint8Array (for web compatibility)
 * @param envelope - The envelope to encode
 * @returns Uint8Array with length prefix and JSON payload
 */
export function encodeToArray<T>(envelope: Envelope<T>): Uint8Array {
  const json = JSON.stringify(envelope)
  const encoder = new TextEncoder()
  const payload = encoder.encode(json)
  const length = payload.length

  const frame = new Uint8Array(4 + length)
  const view = new DataView(frame.buffer)
  view.setUint32(0, length, false) // Big-endian
  frame.set(payload, 4)

  return frame
}

// ============================================================================
// Decoding
// ============================================================================

/**
 * Decode an envelope from wire format
 * @param frame - Buffer containing the framed message
 * @returns Decoded envelope
 * @throws WireFormatError if frame is invalid
 */
export function decode<T>(frame: Buffer): Envelope<T> {
  if (frame.length < 4) {
    throw new WireFormatError('Frame too short for length header', 'INSUFFICIENT_DATA')
  }

  const length = frame.readUInt32BE(0)

  if (frame.length < 4 + length) {
    throw new WireFormatError(
      `Frame too short: expected ${4 + length}, got ${frame.length}`,
      'INSUFFICIENT_DATA'
    )
  }

  const payload = frame.subarray(4, 4 + length)
  const json = payload.toString('utf-8')

  try {
    const envelope = JSON.parse(json) as Envelope<T>
    validateEnvelope(envelope)
    return envelope
  } catch (e) {
    if (e instanceof WireFormatError) throw e
    throw new WireFormatError(`Invalid JSON: ${e}`, 'INVALID_JSON')
  }
}

/**
 * Decode an envelope from a Uint8Array
 * @param frame - Uint8Array containing the framed message
 * @returns Decoded envelope
 * @throws WireFormatError if frame is invalid
 */
export function decodeFromArray<T>(frame: Uint8Array): Envelope<T> {
  if (frame.length < 4) {
    throw new WireFormatError('Frame too short for length header', 'INSUFFICIENT_DATA')
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const length = view.getUint32(0, false) // Big-endian

  if (frame.length < 4 + length) {
    throw new WireFormatError(
      `Frame too short: expected ${4 + length}, got ${frame.length}`,
      'INSUFFICIENT_DATA'
    )
  }

  const payload = frame.subarray(4, 4 + length)
  const decoder = new TextDecoder()
  const json = decoder.decode(payload)

  try {
    const envelope = JSON.parse(json) as Envelope<T>
    validateEnvelope(envelope)
    return envelope
  } catch (e) {
    if (e instanceof WireFormatError) throw e
    throw new WireFormatError(`Invalid JSON: ${e}`, 'INVALID_JSON')
  }
}

/**
 * Validate that an object is a valid envelope
 * @param obj - Object to validate
 * @throws WireFormatError if invalid
 */
function validateEnvelope<T>(obj: unknown): asserts obj is Envelope<T> {
  if (typeof obj !== 'object' || obj === null) {
    throw new WireFormatError('Envelope must be an object', 'INVALID_ENVELOPE')
  }

  const envelope = obj as Record<string, unknown>

  if (typeof envelope.seq !== 'number') {
    throw new WireFormatError('Envelope.seq must be a number', 'INVALID_ENVELOPE')
  }

  if (typeof envelope.tsEventUs !== 'number') {
    throw new WireFormatError('Envelope.tsEventUs must be a number', 'INVALID_ENVELOPE')
  }

  if (typeof envelope.tsRecvUs !== 'number') {
    throw new WireFormatError('Envelope.tsRecvUs must be a number', 'INVALID_ENVELOPE')
  }

  if (envelope.payload === undefined) {
    throw new WireFormatError('Envelope.payload is required', 'INVALID_ENVELOPE')
  }
}

// ============================================================================
// Frame Utilities
// ============================================================================

/**
 * Read the length from a frame header
 * @param frame - At least 4 bytes containing the length header
 * @returns The payload length
 */
export function readFrameLength(frame: Buffer | Uint8Array): number {
  if (frame.length < 4) {
    throw new WireFormatError('Frame too short for length header', 'INSUFFICIENT_DATA')
  }

  if (Buffer.isBuffer(frame)) {
    return frame.readUInt32BE(0)
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  return view.getUint32(0, false)
}

/**
 * Check if a buffer contains a complete frame
 * @param buffer - Buffer to check
 * @returns True if buffer contains a complete frame
 */
export function hasCompleteFrame(buffer: Buffer | Uint8Array): boolean {
  if (buffer.length < 4) return false

  const length = readFrameLength(buffer)
  return buffer.length >= 4 + length
}

/**
 * Extract a frame from a buffer (for streaming)
 * @param buffer - Buffer containing at least one frame
 * @returns Object with the frame and remaining buffer
 */
export function extractFrame(buffer: Buffer): { frame: Buffer; remaining: Buffer } | null {
  if (!hasCompleteFrame(buffer)) return null

  const length = readFrameLength(buffer)
  const frameEnd = 4 + length

  return {
    frame: buffer.subarray(0, frameEnd),
    remaining: buffer.subarray(frameEnd),
  }
}
