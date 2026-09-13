import { describe, expect, it } from 'vitest'
import { applyPlace, createBalanceState, judgeBalance, leftSum, type BalanceLevel } from './logic'
import { BALANCE_LEVELS, chapterOf, getBalanceLevel } from './levels'

const allLevels = () => Array.from({ length: BALANCE_LEVELS }, (_, index) => getBalanceLevel(index + 1))

const slackOf = (spec: BalanceLevel) => (spec.moveLimit === undefined ? Number.POSITIVE_INFINITY : spec.moveLimit - spec.par)

function replay(spec: BalanceLevel) {
  let state = createBalanceState(spec)
  spec.solution.forEach((ids, scale) => {
    ids.forEach((poolId, slot) => {
      const result = applyPlace(spec, state, scale, slot, poolId)
      if (!result.applied) throw new Error(`level ${spec.level} scale ${scale} slot ${slot} refused id ${poolId}`)
      state = result.state
    })
  })
  return { state, verdict: judgeBalance(spec, state.placements) }
}

describe('scale-balance level book', () => {
  it('ships sixty deterministic levels whose constructed solutions balance every scale', () => {
    for (let level = 1; level <= BALANCE_LEVELS; level += 1) {
      const spec = getBalanceLevel(level)
      expect(spec, `level ${level}`).toEqual(getBalanceLevel(level))
      const { state, verdict } = replay(spec)
      expect(verdict.solved, `level ${level}`).toBe(true)
      expect(state.ops, `level ${level}`).toBe(spec.par)
      expect(state.misses, `level ${level}`).toBe(0)
      expect(new Set(spec.pool.map((item) => item.id)).size, `level ${level}`).toBe(spec.pool.length)
      expect(spec.pool.length, `level ${level}`).toBeGreaterThanOrEqual(spec.par + 2)
      const solutionIds = spec.solution.flat()
      expect(new Set(solutionIds).size, `level ${level}`).toBe(spec.par)
      solutionIds.forEach((id) => expect(spec.pool.find((item) => item.id === id)?.weight, `level ${level} id ${id}`).toBeDefined())
      if (spec.moveLimit !== undefined) expect(spec.par, `level ${level}`).toBeLessThanOrEqual(spec.moveLimit)
    }
  })

  it('advances five chapters from twin scales to chained towers under budget and timer', () => {
    const specs = allLevels()
    expect(specs.slice(0, 11).every((spec) => spec.chapter === 1 && spec.scales.length === 2 && spec.scales.every((scale) => scale.child === null) && !spec.moveLimit && !spec.timeLimit)).toBe(true)
    expect(specs.slice(11, 22).every((spec) => spec.chapter === 2 && spec.scales.length === 3 && spec.scales.every((scale) => scale.child === null) && !spec.moveLimit)).toBe(true)
    expect(specs.slice(22, 33).every((spec) => spec.chapter === 3 && spec.scales[0].child === 1 && spec.scales[1].child === null && !spec.moveLimit)).toBe(true)
    expect(specs.slice(33, 44).every((spec) => spec.chapter === 4 && spec.scales[0].child === 1 && spec.moveLimit !== undefined && !spec.timeLimit)).toBe(true)
    expect(specs.slice(44).every((spec) => spec.chapter === 5 && spec.scales[0].child === 1 && spec.scales[1].child === 2 && spec.scales[2].child === null && spec.moveLimit !== undefined && spec.timeLimit !== undefined)).toBe(true)
    expect(specs[59].scales).toHaveLength(4)
    expect(specs[59].scales[3].child).toBeNull()
    expect(specs.slice(44, 52)).toHaveLength(8)
    expect(chapterOf(0)).toBe(1)
    expect(chapterOf(12)).toBe(2)
    expect(chapterOf(45)).toBe(5)
  })

  it('hangs children with recursively consistent weights and positive left pans', () => {
    for (const spec of allLevels()) {
      const placedOf = (index: number) => spec.solution[index].reduce((sum, id) => sum + (spec.pool.find((item) => item.id === id)?.weight ?? 0), 0)
      const totalOf = (index: number, depth = 0): number => {
        if (depth > spec.scales.length) return 0
        const scale = spec.scales[index]
        const childPart = scale.child === null ? 0 : totalOf(scale.child, depth + 1)
        return leftSum(scale) + placedOf(index) + childPart
      }
      spec.scales.forEach((scale, index) => {
        expect(scale.slots, `level ${spec.level} scale ${index}`).toBeGreaterThanOrEqual(1)
        expect(scale.left.length, `level ${spec.level} scale ${index}`).toBeGreaterThanOrEqual(1)
        scale.left.forEach((weight) => {
          expect(weight, `level ${spec.level} scale ${index}`).toBeGreaterThanOrEqual(1)
          expect(weight, `level ${spec.level} scale ${index}`).toBeLessThanOrEqual(45)
        })
        if (scale.child !== null) {
          expect(leftSum(scale), `level ${spec.level} scale ${index}`).toBe(placedOf(index) + totalOf(scale.child))
        }
      })
    }
  })

  it('tightens the curve: par and decoys grow while slack and timers shrink', () => {
    const specs = allLevels()
    const decoys = (spec: BalanceLevel) => spec.pool.length - spec.par
    for (const [start, end] of [[1, 11], [12, 22], [23, 33], [34, 44], [45, 60]] as const) {
      const chapter = specs.slice(start - 1, end)
      for (let index = 1; index < chapter.length; index += 1) {
        expect(chapter[index].par, `level ${start + index}`).toBeGreaterThanOrEqual(chapter[index - 1].par)
        expect(decoys(chapter[index]), `level ${start + index}`).toBeGreaterThanOrEqual(decoys(chapter[index - 1]))
        expect(slackOf(chapter[index]), `level ${start + index}`).toBeLessThanOrEqual(slackOf(chapter[index - 1]))
      }
    }
    for (let index = 1; index < specs.length; index += 1) {
      expect(decoys(specs[index]), `level ${index + 1}`).toBeGreaterThanOrEqual(decoys(specs[index - 1]))
    }
    expect(specs[59].par).toBeGreaterThan(specs[0].par)
    expect(slackOf(getBalanceLevel(34))).toBeGreaterThan(slackOf(getBalanceLevel(44)))
    const ch5 = specs.slice(44)
    for (let index = 1; index < ch5.length; index += 1) {
      expect(ch5[index].timeLimit ?? 0, `level ${45 + index}`).toBeLessThanOrEqual(ch5[index - 1].timeLimit ?? 0)
    }
    expect(getBalanceLevel(45).timeLimit ?? 0).toBeGreaterThan(getBalanceLevel(60).timeLimit ?? 0)
    expect(decoys(getBalanceLevel(23))).toBe(4)
    expect(decoys(getBalanceLevel(34))).toBe(5)
    expect(decoys(getBalanceLevel(45))).toBe(6)
  })

  it('keeps budgets above par and clamps malformed level numbers', () => {
    expect(getBalanceLevel(0).level).toBe(1)
    expect(getBalanceLevel(-7).level).toBe(1)
    expect(getBalanceLevel(999).level).toBe(60)
    expect(getBalanceLevel(9.9).level).toBe(9)
    expect(getBalanceLevel(Number.NaN).level).toBe(1)
    for (const spec of allLevels()) {
      expect(spec.par, `level ${spec.level}`).toBeGreaterThanOrEqual(2)
      if (spec.moveLimit !== undefined) {
        expect(spec.moveLimit, `level ${spec.level}`).toBeGreaterThan(spec.par)
        expect(spec.moveLimit - spec.par, `level ${spec.level}`).toBeGreaterThanOrEqual(3)
      }
      if (spec.timeLimit !== undefined) expect(spec.timeLimit, `level ${spec.level}`).toBeGreaterThanOrEqual(75)
    }
    expect(getBalanceLevel(34).moveLimit).toBeDefined()
    expect(getBalanceLevel(23).moveLimit).toBeUndefined()
  })
})
