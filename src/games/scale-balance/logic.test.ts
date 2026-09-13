import { describe, expect, it } from 'vitest'
import { applyPlace, applyRemove, applySubmit, createBalanceState, judgeBalance, leftSum, MAX_MISSES, scoreFor, type BalanceSpec, type ScaleSpec } from './logic'

const scale = (left: number[], slots: number, child: number | null = null): ScaleSpec => ({ left, slots, child })

const spec: BalanceSpec = {
  scales: [scale([5, 4], 2), scale([6], 1)],
  pool: [
    { id: 0, weight: 3 },
    { id: 1, weight: 6 },
    { id: 2, weight: 2 },
    { id: 3, weight: 9 },
    { id: 4, weight: 6 },
  ],
  solution: [[1, 0], [4]],
  par: 3,
}

describe('balance validator', () => {
  it('judges independent scales by pan equality and requires full slots', () => {
    const verdict = judgeBalance(spec, [[1, 0], [2]])
    expect(verdict.balanced).toEqual([true, false])
    expect(verdict.filled).toBe(3)
    expect(verdict.slots).toBe(3)
    expect(verdict.solved).toBe(false)
    const matched: BalanceSpec = { ...spec, scales: [spec.scales[0], scale([2], 1)] }
    expect(judgeBalance(matched, [[1, 0], [2]]).solved).toBe(true)
    expect(judgeBalance(spec, [[1, null], [4]]).filled).toBe(2)
    expect(judgeBalance(spec, [[1, null], [4]]).solved).toBe(false)
  })

  it('accepts any balancing assignment including decoy weights', () => {
    const decoy: BalanceSpec = {
      scales: [scale([8], 2)],
      pool: [...spec.pool, { id: 5, weight: 5 }],
      solution: [[1, 2]],
      par: 2,
    }
    expect(judgeBalance(decoy, [[1, 2]]).solved).toBe(true)
    expect(judgeBalance(decoy, [[0, 5]]).solved).toBe(true)
    expect(judgeBalance(decoy, [[3, 0]]).balanced).toEqual([false])
    expect(judgeBalance(decoy, [[1, null]]).solved).toBe(false)
  })

  it('rolls child totals into the hanging parent scale', () => {
    const chain: BalanceSpec = {
      scales: [scale([43], 1, 1), scale([20], 1, 2), scale([6], 1)],
      pool: [...spec.pool, { id: 5, weight: 8 }],
      solution: [[0], [5], [1]],
      par: 3,
    }
    const partial = judgeBalance(chain, [[null], [null], [1]])
    expect(partial.balanced).toEqual([false, false, true])
    expect(partial.solved).toBe(false)
    const solved = judgeBalance(chain, [[0], [5], [1]])
    expect(solved.balanced).toEqual([true, true, true])
    expect(solved.solved).toBe(true)
    expect(judgeBalance(chain, [[1], [0], [5]]).balanced).toEqual([true, false, false])
  })

  it('marks tilted direction for the live beam', () => {
    expect(judgeBalance(spec, [[1, 0], [2]]).tilt).toEqual([0, 4])
    expect(judgeBalance(spec, [[1, 3], [null]]).tilt[0]).toBeLessThan(0)
  })
})

describe('balance state moves', () => {
  it('places pool weights once, keeping ops honest without charging misses', () => {
    let state = createBalanceState(spec)
    const first = applyPlace(spec, state, 0, 0, 1)
    expect(first.applied).toBe(true)
    expect(first.state.ops).toBe(1)
    expect(first.state.placements[0]).toEqual([1, null])
    state = first.state
    expect(applyPlace(spec, state, 0, 0, 2).applied).toBe(false)
    expect(applyPlace(spec, state, 0, 1, 1).applied).toBe(false)
    expect(applyPlace(spec, state, 1, 0, 1).applied).toBe(false)
    expect(applyPlace(spec, state, 9, 0, 2).applied).toBe(false)
    expect(applyPlace(spec, state, 0, 9, 2).applied).toBe(false)
    expect(applyPlace(spec, state, 0, 1, 99).applied).toBe(false)
    const after = applyPlace(spec, state, 0, 1, 2)
    expect(after.applied).toBe(true)
    expect(after.state.ops).toBe(2)
    expect(after.state.misses).toBe(0)
  })

  it('removes weights for free and keeps the pool id reusable', () => {
    const placed = applyPlace(spec, createBalanceState(spec), 0, 1, 2).state
    expect(applyRemove(spec, placed, 0, 0).applied).toBe(false)
    const removed = applyRemove(spec, placed, 0, 1)
    expect(removed.applied).toBe(true)
    expect(removed.state.placements[0]).toEqual([null, null])
    expect(removed.state.ops).toBe(placed.ops)
    expect(applyPlace(spec, removed.state, 1, 0, 2).applied).toBe(true)
  })

  it('charges a miss and sweeps the pans on an unbalanced submit', () => {
    let state = createBalanceState(spec)
    state = applyPlace(spec, state, 0, 0, 1).state
    state = applyPlace(spec, state, 0, 1, 2).state
    state = applyPlace(spec, state, 1, 0, 3).state
    const wrong = applySubmit(spec, state)
    expect(wrong.solved).toBe(false)
    expect(wrong.miss).toBe(true)
    expect(wrong.state.misses).toBe(1)
    expect(wrong.state.placements).toEqual([[null, null], [null]])
    let retry = wrong.state
    retry = applyPlace(spec, retry, 0, 0, 1).state
    retry = applyPlace(spec, retry, 0, 1, 0).state
    retry = applyPlace(spec, retry, 1, 0, 4).state
    const good = applySubmit(spec, retry)
    expect(good.solved).toBe(true)
    expect(good.miss).toBe(false)
    expect(good.state.placements).toEqual([[1, 0], [4]])
    let broken = createBalanceState(spec)
    for (let round = 0; round < MAX_MISSES; round += 1) broken = applySubmit(spec, broken).state
    expect(broken.misses).toBe(MAX_MISSES)
  })

  it('scores 1000 minus 15 per extra placement and 50 per miss, floored at 100', () => {
    expect(scoreFor(3, 3)).toBe(1000)
    expect(scoreFor(2, 3)).toBe(1000)
    expect(scoreFor(5, 3)).toBe(970)
    expect(scoreFor(5, 3, 1)).toBe(920)
    expect(scoreFor(5, 3, MAX_MISSES)).toBe(820)
    expect(scoreFor(99, 3, MAX_MISSES)).toBe(100)
    expect(leftSum(spec.scales[0])).toBe(9)
  })
})
