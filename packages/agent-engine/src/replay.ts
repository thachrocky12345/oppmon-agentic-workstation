// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Deterministic Replay System
 * Record and replay agent interactions for debugging
 */

import type { Envelope, ReplayLogEntry, ReplayLogMetadata } from './types.js'

// ============================================================================
// Seeded Random Number Generator
// ============================================================================

/**
 * Simple seeded PRNG (xorshift128+)
 * For deterministic replay of random operations
 */
export class SeededRng {
  private state: [bigint, bigint]
  private readonly initialSeed: number

  constructor(seed: number) {
    this.initialSeed = seed

    // Initialize state from seed
    const seedBigInt = BigInt(seed)
    this.state = [seedBigInt ^ 0x5555555555555555n, seedBigInt ^ 0xaaaaaaaaaaaaaaaan]
  }

  /**
   * Get the initial seed
   * @returns The seed used to initialize this RNG
   */
  getSeed(): number {
    return this.initialSeed
  }

  /**
   * Generate next random number (0 to 1)
   * @returns Random float
   */
  next(): number {
    let s1 = this.state[0]
    const s0 = this.state[1]

    this.state[0] = s0
    s1 ^= s1 << 23n
    s1 ^= s1 >> 17n
    s1 ^= s0
    s1 ^= s0 >> 26n
    this.state[1] = s1

    // Convert to float in [0, 1)
    const result = (s0 + s1) & 0xffffffffn
    return Number(result) / 0x100000000
  }

  /**
   * Generate random integer in range [min, max)
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (exclusive)
   * @returns Random integer
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min
  }

  /**
   * Pick a random element from an array
   * @param array - Array to pick from
   * @returns Random element
   */
  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length)]
  }

  /**
   * Shuffle an array (Fisher-Yates)
   * @param array - Array to shuffle
   * @returns Shuffled array (mutates original)
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1)
      ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }
}

// ============================================================================
// Replay Log
// ============================================================================

export class ReplayLog<T> {
  private entries: ReplayLogEntry<T>[] = []
  private metadata: ReplayLogMetadata
  private recording: boolean = false

  constructor(seed?: number) {
    this.metadata = {
      seed: seed ?? Math.floor(Math.random() * 0x7fffffff),
      startTime: Date.now(),
      entryCount: 0,
    }
  }

  /**
   * Start recording
   */
  startRecording(): void {
    this.recording = true
    this.metadata.startTime = Date.now()
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    this.recording = false
    this.metadata.endTime = Date.now()
  }

  /**
   * Check if recording is active
   * @returns True if recording
   */
  isRecording(): boolean {
    return this.recording
  }

  /**
   * Record an envelope
   * @param envelope - The envelope to record
   */
  record(envelope: Envelope<T>): void {
    if (!this.recording) return

    this.entries.push({
      timestamp: Date.now(),
      envelope,
    })

    this.metadata.entryCount = this.entries.length
  }

  /**
   * Get all recorded entries
   * @returns Array of replay log entries
   */
  getEntries(): ReplayLogEntry<T>[] {
    return [...this.entries]
  }

  /**
   * Get log metadata
   * @returns Replay log metadata
   */
  getMetadata(): ReplayLogMetadata {
    return { ...this.metadata }
  }

  /**
   * Create an iterator for replay
   * @returns Iterator over entries
   */
  replay(): Iterator<ReplayLogEntry<T>> {
    let index = 0
    const entries = this.entries

    return {
      next(): IteratorResult<ReplayLogEntry<T>> {
        if (index < entries.length) {
          return { value: entries[index++], done: false }
        }
        return { value: undefined, done: true }
      },
    }
  }

  /**
   * Replay with timing (simulates original delays)
   * @param callback - Called for each entry
   * @param speedMultiplier - Replay speed (1 = realtime, 2 = 2x speed)
   */
  async replayWithTiming(
    callback: (entry: ReplayLogEntry<T>) => Promise<void>,
    speedMultiplier: number = 1
  ): Promise<void> {
    if (this.entries.length === 0) return

    const baseTime = this.entries[0].timestamp

    for (const entry of this.entries) {
      const delay = (entry.timestamp - baseTime) / speedMultiplier
      await new Promise((resolve) => setTimeout(resolve, delay))
      await callback(entry)
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = []
    this.metadata.entryCount = 0
  }

  /**
   * Export to JSON
   * @returns JSON string
   */
  toJSON(): string {
    return JSON.stringify({
      metadata: this.metadata,
      entries: this.entries,
    })
  }

  /**
   * Import from JSON
   * @param json - JSON string
   * @returns ReplayLog instance
   */
  static fromJSON<T>(json: string): ReplayLog<T> {
    const data = JSON.parse(json) as {
      metadata: ReplayLogMetadata
      entries: ReplayLogEntry<T>[]
    }

    const log = new ReplayLog<T>(data.metadata.seed)
    log.metadata = data.metadata
    log.entries = data.entries

    return log
  }
}

// ============================================================================
// Deterministic Context
// ============================================================================

/**
 * Context for deterministic execution
 * Provides seeded RNG and replay capability
 */
export class DeterministicContext<T> {
  public readonly rng: SeededRng
  public readonly log: ReplayLog<T>

  constructor(seed?: number) {
    const effectiveSeed = seed ?? Math.floor(Math.random() * 0x7fffffff)
    this.rng = new SeededRng(effectiveSeed)
    this.log = new ReplayLog<T>(effectiveSeed)
  }

  /**
   * Start deterministic recording
   */
  startRecording(): void {
    this.log.startRecording()
  }

  /**
   * Stop deterministic recording
   */
  stopRecording(): void {
    this.log.stopRecording()
  }

  /**
   * Record an envelope
   * @param envelope - Envelope to record
   */
  record(envelope: Envelope<T>): void {
    this.log.record(envelope)
  }

  /**
   * Get the seed for this context
   * @returns The seed
   */
  getSeed(): number {
    return this.rng.getSeed()
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new deterministic context
 * @param seed - Optional seed (random if not provided)
 * @returns Deterministic context
 */
export function createDeterministicContext<T>(seed?: number): DeterministicContext<T> {
  return new DeterministicContext<T>(seed)
}
