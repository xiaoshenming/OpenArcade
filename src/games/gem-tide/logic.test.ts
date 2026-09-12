import { describe, expect, it } from 'vitest'
import { mulberry32, seedFor } from '../../platform/rng'
import { chainMultiplier, createGemBoard, findMatches, findValidSwaps, goalSummary, hasValidSwap, resolveSwap, shuffleBoard } from './logic'
import { getGemLevel, type GemLevel } from './levels'

const baseColors = () => Array.from({ length: 49 }, (_, index) => ((Math.floor(index / 7) + 2 * (index % 7)) % 6))
const emptyState = () => ({ colors: baseColors(), locks: new Array<boolean>(49).fill(false), jelly: new Array<number>(49).fill(0) })
const queuedRandom = (queue: number[], fallback: number) => {
  let at = 0
  return () => {
    const value = at < queue.length ? queue[at] : fallback
    at += 1
    return (value + 0.5) / 6
  }
}
const maskedCells = (mask: boolean[]) => mask.map((flag, index) => (flag ? index : -1)).filter((index) => index >= 0)

describe('gem tide rules', () => {
  it('generates sixty deterministic solvable boards with chapter-scoped objectives', () => {
    for (let level = 1; level <= 60; level += 1) {
      const spec = getGemLevel(level)
      const first = createGemBoard(level)
      expect(createGemBoard(level)).toEqual(first)
      expect(first.colors).toHaveLength(49)
      expect(first.colors.every((color) => color >= 0 && color < 6)).toBe(true)
      expect(findMatches(first.colors).some(Boolean)).toBe(false)
      expect(hasValidSwap(first.colors, first.locks)).toBe(true)
      expect(first.jelly.filter((hits) => hits > 0)).toHaveLength(spec.jelly ?? 0)
      expect(first.jelly.every((hits) => hits === 0 || hits === 2)).toBe(true)
      expect(first.locks.filter(Boolean)).toHaveLength(spec.locks ?? 0)
      expect(spec.jelly === undefined || spec.chapter === 3 || spec.chapter === 5).toBe(true)
      expect(spec.locks === undefined || spec.chapter === 4 || spec.chapter === 5).toBe(true)
      expect(spec.quota === undefined || spec.chapter === 1 || spec.chapter === 5).toBe(true)
      expect(spec.targets === undefined || spec.chapter === 2).toBe(true)
    }
    expect(createGemBoard(0)).toEqual(createGemBoard(1))
    expect(createGemBoard(999)).toEqual(createGemBoard(60))
    expect(getGemLevel(0).level).toBe(1)
    expect(getGemLevel(61).quota).toBe(getGemLevel(60).quota)
  })

  it('flags every cell of horizontal, vertical and crossing runs without false positives', () => {
    const horizontal = emptyState()
    ;[44, 45, 46].forEach((index) => { horizontal.colors[index] = 5 })
    expect(maskedCells(findMatches(horizontal.colors))).toEqual([44, 45, 46])
    const vertical = emptyState()
    ;[13, 20, 27].forEach((index) => { vertical.colors[index] = 2 })
    expect(maskedCells(findMatches(vertical.colors))).toEqual([13, 20, 27])
    const crossing = emptyState()
    ;[0, 1, 2, 8, 15].forEach((index) => { crossing.colors[index] = 3 })
    expect(maskedCells(findMatches(crossing.colors))).toEqual([0, 1, 2, 8, 15])
    const square = emptyState()
    ;[17, 18, 24, 25].forEach((index) => { square.colors[index] = 2 })
    expect(findMatches(square.colors).some(Boolean)).toBe(false)
  })

  it('rejects invalid swaps without touching the board', () => {
    const state = emptyState()
    const result = resolveSwap(state, 0, 1, mulberry32(seedFor(1, 1)))
    expect(result.valid).toBe(false)
    expect(result.gained).toBe(0)
    expect(result.state).toEqual(state)
    const locked = emptyState()
    locked.locks[1] = true
    const blocked = resolveSwap(locked, 0, 1, mulberry32(seedFor(1, 1)))
    expect(blocked.valid).toBe(false)
    expect(blocked.state.colors).toEqual(locked.colors)
    const distant = resolveSwap(state, 0, 8, mulberry32(seedFor(1, 1)))
    expect(distant.valid).toBe(false)
  })

  it('settles gravity onto locks and refills cleared columns deterministically', () => {
    const state = emptyState()
    state.colors[7] = 5
    state.colors[14] = 5
    state.colors[1] = 5
    state.locks[35] = true
    const result = resolveSwap(state, 0, 1, queuedRandom([1, 3, 2], 0))
    expect(result.valid).toBe(true)
    expect(result.waves).toBe(1)
    expect(result.waveCounts).toEqual([3])
    expect(result.gained).toBe(60)
    expect(result.cleared).toBe(3)
    expect(result.perColor[5]).toBe(3)
    expect(result.changed).toHaveLength(3)
    expect([result.state.colors[0], result.state.colors[7], result.state.colors[14]]).toEqual([2, 3, 1])
    expect(result.state.colors[21]).toBe(3)
    expect(result.state.colors[28]).toBe(4)
    expect(result.state.colors[35]).toBe(5)
    expect(result.state.locks[35]).toBe(true)
    expect(result.state.colors[42]).toBe(0)
  })

  it('multiplies chain waves up to the capped chain bonus', () => {
    expect([1, 2, 4, 5, 6, 9].map(chainMultiplier)).toEqual([1, 2, 4, 5, 5, 5])
    const state = emptyState()
    state.colors[2] = 5
    state.colors[9] = 5
    state.colors[15] = 5
    state.colors[16] = 1
    const result = resolveSwap(state, 15, 16, queuedRandom([1, 1, 3, 3, 0, 2], 0))
    expect(result.valid).toBe(true)
    expect(result.waves).toBe(2)
    expect(result.waveCounts).toEqual([3, 3])
    expect(result.gained).toBe(180)
    expect(result.cleared).toBe(6)
    expect(result.changed).toHaveLength(7)
    expect(findMatches(result.state.colors).some(Boolean)).toBe(false)
  })

  it('unlocks locked gems and chips jelly when they join a match', () => {
    const state = emptyState()
    ;[0, 7, 14].forEach((index) => { state.colors[index] = 5 })
    state.colors[42] = 2
    state.colors[43] = 1
    ;[44, 45, 46, 47, 48].forEach((index) => { state.colors[index] = 2 })
    state.locks[46] = true
    state.jelly[47] = 2
    const blocked = resolveSwap(state, 46, 39, mulberry32(seedFor(1, 1)))
    expect(blocked.valid).toBe(false)
    const result = resolveSwap(state, 42, 43, queuedRandom([0, 1, 4, 5, 1, 3, 4, 0, 2], 0))
    expect(result.valid).toBe(true)
    expect(result.waves).toBe(1)
    expect(result.waveCounts).toEqual([9])
    expect(result.gained).toBe(180)
    expect(result.perColor[2]).toBe(6)
    expect(result.perColor[5]).toBe(3)
    expect(result.unlocked).toBe(1)
    expect(result.jellyHits).toBe(1)
    expect(result.state.locks[46]).toBe(false)
    expect(result.state.jelly[47]).toBe(1)
    expect(findMatches(result.state.colors).some(Boolean)).toBe(false)
  })

  it('keeps board invariants across simulated full playthroughs', () => {
    for (let level = 1; level <= 57; level += 7) {
      const spec = getGemLevel(level)
      let state = createGemBoard(level)
      const random = mulberry32(seedFor(level, 21))
      let locksLeft = state.locks.filter(Boolean).length
      let jellyLeft = state.jelly.reduce((sum, value) => sum + value, 0)
      for (let move = 0; move < spec.moves; move += 1) {
        const swaps = findValidSwaps(state.colors, state.locks)
        if (swaps.length === 0) {
          state = shuffleBoard(state, random)
          expect(findMatches(state.colors).some(Boolean)).toBe(false)
          continue
        }
        const [a, b] = swaps[Math.floor(random() * swaps.length)]
        const result = resolveSwap(state, a, b, random)
        expect(result.valid).toBe(true)
        expect(findMatches(result.state.colors).some(Boolean)).toBe(false)
        expect(result.state.colors.every((color) => color >= 0)).toBe(true)
        expect(result.gained).toBe(result.waveCounts.reduce((sum, count, wave) => sum + 20 * chainMultiplier(wave + 1) * count, 0))
        expect(result.perColor.reduce((sum, count) => sum + count, 0)).toBe(result.cleared)
        const nextLocks = result.state.locks.filter(Boolean).length
        const nextJelly = result.state.jelly.reduce((sum, value) => sum + value, 0)
        expect(nextLocks).toBeLessThanOrEqual(locksLeft)
        expect(nextJelly).toBeLessThanOrEqual(jellyLeft)
        locksLeft = nextLocks
        jellyLeft = nextJelly
        state = result.state
      }
    }
  })

  it('reshuffles dead boards while preserving locks, jelly and the color pool', () => {
    const state = createGemBoard(50)
    const next = shuffleBoard(state, mulberry32(seedFor(50, 5)))
    expect(findMatches(next.colors).some(Boolean)).toBe(false)
    expect(hasValidSwap(next.colors, next.locks)).toBe(true)
    expect(next.locks).toEqual(state.locks)
    expect(next.jelly).toEqual(state.jelly)
    expect([...next.colors].sort()).toEqual([...state.colors].sort())
  })

  it('evaluates every chapter goal with honest progress', () => {
    const quota = getGemLevel(5)
    expect(goalSummary(quota, emptyState(), quota.quota ?? 0, [0, 0, 0, 0, 0, 0])).toMatchObject({ done: true, progress: 1 })
    expect(goalSummary(quota, emptyState(), (quota.quota ?? 0) - 1, [0, 0, 0, 0, 0, 0]).done).toBe(false)
    const collect = getGemLevel(15)
    const wanted = new Array(6).fill(0)
    collect.targets?.forEach((target) => { wanted[target.color] = target.count })
    expect(goalSummary(collect, emptyState(), 0, wanted).done).toBe(true)
    expect(goalSummary(collect, emptyState(), 0, [0, 0, 0, 0, 0, 0]).done).toBe(false)
    const jelly = getGemLevel(28)
    const iced = emptyState()
    expect(goalSummary(jelly, iced, 0, []).done).toBe(true)
    iced.jelly[10] = 1
    expect(goalSummary(jelly, iced, 0, []).done).toBe(false)
    const locks = getGemLevel(40)
    expect(goalSummary(locks, emptyState(), 0, []).done).toBe(true)
    const sealed = emptyState()
    sealed.locks[3] = true
    expect(goalSummary(locks, sealed, 0, []).done).toBe(false)
    const combo = getGemLevel(60)
    expect(goalSummary(combo, emptyState(), combo.quota ?? 0, []).done).toBe(true)
    expect(goalSummary(combo, emptyState(), (combo.quota ?? 0) - 1, []).done).toBe(false)
  })

  it('tightens difficulty within chapters and stacks objectives in the finale', () => {
    const specs: GemLevel[] = Array.from({ length: 60 }, (_, index) => getGemLevel(index + 1))
    const ratio = (spec: GemLevel, value: number) => value / spec.moves
    for (let k = 0; k < 10; k += 1) {
      expect(ratio(specs[k], specs[k].quota ?? 0)).toBeLessThanOrEqual(ratio(specs[k + 1], specs[k + 1].quota ?? 0))
      const targets = (spec: GemLevel) => (spec.targets ?? []).reduce((sum, target) => sum + target.count, 0)
      expect(ratio(specs[11 + k], targets(specs[11 + k]))).toBeLessThanOrEqual(ratio(specs[12 + k], targets(specs[12 + k])))
      expect(specs[22 + k].jelly).toBeGreaterThanOrEqual(4 + k)
      expect(specs[22 + k].jelly).toBeLessThanOrEqual(6 + k)
      expect(ratio(specs[33 + k], specs[33 + k].locks ?? 0)).toBeLessThanOrEqual(ratio(specs[34 + k], specs[34 + k].locks ?? 0))
    }
    const load = (spec: GemLevel) => (spec.quota ?? 0) / 20 + (spec.jelly ?? 0) * 2 + (spec.locks ?? 0)
    specs.slice(44).forEach((spec) => {
      expect(spec.quota ?? 0).toBeGreaterThan(0)
      expect(spec.jelly ?? 0).toBeGreaterThan(0)
      expect(spec.locks ?? 0).toBeGreaterThan(0)
      expect(spec.moves).toBeGreaterThanOrEqual(26)
    })
    expect(ratio(specs[59], load(specs[59]))).toBeGreaterThan(ratio(specs[10], load(specs[10])))
    expect(specs.every((spec) => spec.moves >= 20 && spec.moves <= 40)).toBe(true)
    expect(specs[0].moves).toBe(20)
    expect(specs[59].jelly).toBeGreaterThan(0)
    expect(specs[59].locks).toBeGreaterThan(0)
  })
})
