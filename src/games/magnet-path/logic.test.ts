import { describe, expect, it } from 'vitest'
import { bfsMinTurns, canPlace, manhattan, magnetForce, netForce, scoreFor, simulateRun, stepBall, type BallState, type Field, type Magnet, type MagnetLevel } from './logic'

const field: Field = { size: 6, holes: [{ row: 1, col: 3 }], walls: [{ row: 2, col: 2 }] }
const at = (row: number, col: number, polarity: 'N' | 'S' = 'N'): Magnet => ({ row, col, polarity })
const level: MagnetLevel = { ...field, start: { row: 1, col: 1 }, capacity: 2, par: 2, budget: 6, solution: [at(1, 0, 'S')] }
const ball = (row: number, col: number, filled = 0): BallState => ({ row, col, filled })

describe('magnet force physics', () => {
  it('attracts with N, repels with S and fades with manhattan distance', () => {
    expect(magnetForce({ row: 0, col: 0 }, at(0, 2, 'N'))).toEqual({ fx: 3, fy: 0 })
    expect(magnetForce({ row: 0, col: 0 }, at(0, 2, 'S'))).toEqual({ fx: -3, fy: 0 })
    expect(magnetForce({ row: 0, col: 0 }, at(1, 0, 'N'))).toEqual({ fx: 0, fy: 4 })
    expect(magnetForce({ row: 0, col: 0 }, at(2, 1, 'S'))).toEqual({ fx: -2, fy: -2 })
    expect(magnetForce({ row: 0, col: 0 }, at(0, 3, 'N'))).toEqual({ fx: 2, fy: 0 })
    expect(magnetForce({ row: 0, col: 0 }, at(0, 5, 'N'))).toEqual({ fx: 0, fy: 0 })
    expect(magnetForce({ row: 2, col: 2 }, at(2, 2, 'N'))).toEqual({ fx: 0, fy: 0 })
    expect(manhattan({ row: 1, col: 1 }, { row: 3, col: 2 })).toBe(3)
  })

  it('sums contributions into a net force that can cancel or combine', () => {
    expect(netForce({ row: 0, col: 0 }, [at(0, 1, 'N'), at(0, -1, 'N')])).toEqual({ fx: 0, fy: 0 })
    expect(netForce({ row: 0, col: 0 }, [at(0, 2, 'N'), at(0, 1, 'N')])).toEqual({ fx: 7, fy: 0 })
    expect(netForce({ row: 0, col: 0 }, [at(1, 0, 'N'), at(0, 1, 'N')])).toEqual({ fx: 4, fy: 4 })
    expect(netForce({ row: 0, col: 0 }, [])).toEqual({ fx: 0, fy: 0 })
  })

  it('moves one cell along the dominant axis with vertical tie-break', () => {
    expect(stepBall(field, ball(2, 2), [at(3, 3, 'N')])).toEqual(ball(3, 2))
    expect(stepBall(field, ball(2, 2), [at(2, 4, 'N')])).toEqual(ball(2, 3))
    expect(stepBall(field, ball(2, 2), [at(4, 2, 'N')])).toEqual(ball(3, 2))
    expect(stepBall(field, ball(2, 2), [])).toEqual(ball(2, 2))
    expect(stepBall(field, ball(2, 2), [at(2, 2, 'N')])).toEqual(ball(2, 2))
  })

  it('blocks on walls, magnets, edges and future holes without moving', () => {
    expect(stepBall(field, ball(1, 1), [at(1, 3, 'N')])).toEqual(ball(1, 2))
    expect(stepBall(field, ball(2, 1), [at(2, 3, 'N')])).toEqual(ball(2, 1))
    expect(stepBall(field, ball(0, 0), [at(0, 2, 'N')])).toEqual(ball(0, 1))
    expect(stepBall(field, ball(0, 0), [at(1, 0, 'S')])).toEqual(ball(0, 0))
    const twin: Field = { size: 6, holes: [{ row: 2, col: 1 }, { row: 2, col: 3 }], walls: [] }
    expect(stepBall(twin, ball(2, 2), [at(2, 4, 'N')])).toEqual(ball(2, 2))
    expect(stepBall(twin, ball(2, 0), [at(2, 2, 'N')])).toEqual(ball(2, 1, 1))
    expect(stepBall(twin, ball(2, 2, 1), [at(2, 3, 'S')])).toEqual(ball(2, 1, 1))
  })

  it('solves a straight corridor and scores par deviations', () => {
    const run = simulateRun(field, level.start, level.solution)
    expect(run.won).toBe(true)
    expect(run.turns).toBe(2)
    expect(bfsMinTurns(field, level.start, level.solution)).toBe(2)
    expect(bfsMinTurns(field, level.start, [])).toBe(-1)
    expect(scoreFor(2, 2)).toBe(1000)
    expect(scoreFor(5, 2)).toBe(964)
    expect(scoreFor(90, 2)).toBe(100)
  })

  it('enforces placement legality on every reserved cell', () => {
    expect(canPlace(field, level.start, [], level.capacity, ball(1, 1), { row: 2, col: 2 })).toBe(false)
    expect(canPlace(field, level.start, [], level.capacity, ball(1, 1), { row: 1, col: 3 })).toBe(false)
    expect(canPlace(field, level.start, [], level.capacity, ball(1, 1), { row: 1, col: 1 })).toBe(false)
    expect(canPlace(field, level.start, [at(3, 3)], 1, ball(1, 1), { row: 4, col: 4 })).toBe(false)
    expect(canPlace(field, level.start, [at(3, 3)], level.capacity, ball(1, 1), { row: 3, col: 3 })).toBe(false)
    expect(canPlace(field, level.start, [], level.capacity, ball(1, 1), { row: -1, col: 0 })).toBe(false)
    expect(canPlace(field, level.start, [at(3, 3)], level.capacity, ball(1, 1), { row: 3, col: 4 })).toBe(true)
  })
})
