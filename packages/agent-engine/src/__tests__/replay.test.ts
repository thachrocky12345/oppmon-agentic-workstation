// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Replay System Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  SeededRng,
  ReplayLog,
  DeterministicContext,
  createDeterministicContext,
} from '../replay.js'
import { createEnvelope } from '../types.js'

describe('SeededRng', () => {
  describe('determinism', () => {
    it('produces same sequence for same seed', () => {
      const rng1 = new SeededRng(12345)
      const rng2 = new SeededRng(12345)

      for (let i = 0; i < 100; i++) {
        expect(rng1.next()).toBe(rng2.next())
      }
    })

    it('produces different sequences for different seeds', () => {
      const rng1 = new SeededRng(12345)
      const rng2 = new SeededRng(54321)

      // Very unlikely to be equal
      expect(rng1.next()).not.toBe(rng2.next())
    })
  })

  describe('next', () => {
    it('returns values in [0, 1)', () => {
      const rng = new SeededRng(42)

      for (let i = 0; i < 100; i++) {
        const value = rng.next()
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
      }
    })
  })

  describe('nextInt', () => {
    it('returns values in [min, max)', () => {
      const rng = new SeededRng(42)

      for (let i = 0; i < 100; i++) {
        const value = rng.nextInt(5, 10)
        expect(value).toBeGreaterThanOrEqual(5)
        expect(value).toBeLessThan(10)
      }
    })

    it('returns integers', () => {
      const rng = new SeededRng(42)

      for (let i = 0; i < 100; i++) {
        const value = rng.nextInt(0, 100)
        expect(Number.isInteger(value)).toBe(true)
      }
    })
  })

  describe('pick', () => {
    it('picks from array', () => {
      const rng = new SeededRng(42)
      const array = ['a', 'b', 'c', 'd', 'e']

      for (let i = 0; i < 100; i++) {
        const value = rng.pick(array)
        expect(array).toContain(value)
      }
    })

    it('produces deterministic picks', () => {
      const rng1 = new SeededRng(42)
      const rng2 = new SeededRng(42)
      const array = [1, 2, 3, 4, 5]

      for (let i = 0; i < 100; i++) {
        expect(rng1.pick(array)).toBe(rng2.pick(array))
      }
    })
  })

  describe('shuffle', () => {
    it('shuffles array in place', () => {
      const rng = new SeededRng(42)
      const array = [1, 2, 3, 4, 5]
      const original = [...array]

      const result = rng.shuffle(array)

      expect(result).toBe(array) // Same reference
      expect(array.sort()).toEqual(original.sort()) // Same elements
    })

    it('produces deterministic shuffles', () => {
      const array1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const array2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

      new SeededRng(42).shuffle(array1)
      new SeededRng(42).shuffle(array2)

      expect(array1).toEqual(array2)
    })
  })

  describe('getSeed', () => {
    it('returns initial seed', () => {
      const rng = new SeededRng(12345)
      expect(rng.getSeed()).toBe(12345)

      // Seed doesn't change after operations
      rng.next()
      rng.next()
      expect(rng.getSeed()).toBe(12345)
    })
  })
})

describe('ReplayLog', () => {
  let log: ReplayLog<string>

  beforeEach(() => {
    log = new ReplayLog<string>(42)
  })

  describe('recording', () => {
    it('records when recording is active', () => {
      log.startRecording()
      log.record(createEnvelope(1, 'first'))
      log.record(createEnvelope(2, 'second'))
      log.stopRecording()

      const entries = log.getEntries()
      expect(entries.length).toBe(2)
      expect(entries[0].envelope.payload).toBe('first')
      expect(entries[1].envelope.payload).toBe('second')
    })

    it('does not record when not recording', () => {
      log.record(createEnvelope(1, 'ignored'))

      expect(log.getEntries().length).toBe(0)
    })

    it('tracks recording state', () => {
      expect(log.isRecording()).toBe(false)
      log.startRecording()
      expect(log.isRecording()).toBe(true)
      log.stopRecording()
      expect(log.isRecording()).toBe(false)
    })
  })

  describe('metadata', () => {
    it('tracks entry count', () => {
      log.startRecording()
      log.record(createEnvelope(1, 'a'))
      log.record(createEnvelope(2, 'b'))

      expect(log.getMetadata().entryCount).toBe(2)
    })

    it('stores seed', () => {
      expect(log.getMetadata().seed).toBe(42)
    })

    it('records start and end times', () => {
      log.startRecording()
      const startTime = log.getMetadata().startTime

      expect(startTime).toBeGreaterThan(0)

      log.stopRecording()
      const endTime = log.getMetadata().endTime

      expect(endTime).toBeDefined()
      expect(endTime).toBeGreaterThanOrEqual(startTime)
    })
  })

  describe('replay', () => {
    it('iterates over entries', () => {
      log.startRecording()
      log.record(createEnvelope(1, 'a'))
      log.record(createEnvelope(2, 'b'))
      log.record(createEnvelope(3, 'c'))
      log.stopRecording()

      const iterator = log.replay()
      const values: string[] = []

      let result = iterator.next()
      while (!result.done) {
        values.push(result.value.envelope.payload)
        result = iterator.next()
      }

      expect(values).toEqual(['a', 'b', 'c'])
    })
  })

  describe('JSON serialization', () => {
    it('roundtrips to JSON', () => {
      log.startRecording()
      log.record(createEnvelope(1, 'test'))
      log.record(createEnvelope(2, 'data'))
      log.stopRecording()

      const json = log.toJSON()
      const restored = ReplayLog.fromJSON<string>(json)

      expect(restored.getMetadata().seed).toBe(42)
      expect(restored.getEntries().length).toBe(2)
      expect(restored.getEntries()[0].envelope.payload).toBe('test')
    })
  })

  describe('clear', () => {
    it('removes all entries', () => {
      log.startRecording()
      log.record(createEnvelope(1, 'test'))
      log.stopRecording()

      log.clear()

      expect(log.getEntries().length).toBe(0)
      expect(log.getMetadata().entryCount).toBe(0)
    })
  })
})

describe('DeterministicContext', () => {
  it('creates context with RNG and log', () => {
    const ctx = createDeterministicContext<string>(42)

    expect(ctx.rng).toBeDefined()
    expect(ctx.log).toBeDefined()
    expect(ctx.getSeed()).toBe(42)
  })

  it('uses same seed for RNG and log', () => {
    const ctx = new DeterministicContext<string>(12345)

    expect(ctx.rng.getSeed()).toBe(12345)
    expect(ctx.log.getMetadata().seed).toBe(12345)
  })

  it('delegates recording to log', () => {
    const ctx = new DeterministicContext<string>()

    ctx.startRecording()
    ctx.record(createEnvelope(1, 'test'))
    ctx.stopRecording()

    expect(ctx.log.getEntries().length).toBe(1)
  })

  it('generates random seed when not provided', () => {
    const ctx1 = createDeterministicContext<string>()
    const ctx2 = createDeterministicContext<string>()

    // Very unlikely to be the same
    expect(ctx1.getSeed()).not.toBe(ctx2.getSeed())
  })
})
