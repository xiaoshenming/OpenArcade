import { describe, expect, it } from 'vitest'
import { canMove, colorOf, createBoard, isSolved, move, scoreFor, solveMinMoves, solvePath } from './logic'
import { getPagodaLevel, PAGODA_LEVEL_COUNT, sealedPar } from './levels'

const levelsOf = (chapter: number) =>
  Array.from({ length: PAGODA_LEVEL_COUNT }, (_, index) => getPagodaLevel(index + 1)).filter((spec) => spec.chapter === chapter)

describe('pagoda move rules', () => {
  it('rejects larger-on-smaller, self moves and sealed pegs without mutating the board', () => {
    const board = createBoard(3, 4)
    expect(canMove(board, 0, 0)).toBe(false)
    expect(canMove(board, 1, 0)).toBe(false)
    expect(canMove(board, 0, 9)).toBe(false)
    expect(move(board, 1, 0)).toBe(board)
    const stepped = move(board, 0, 1)
    expect(stepped).not.toBe(board)
    expect(board).toEqual(createBoard(3, 4))
    expect(canMove(stepped, 0, 1)).toBe(false)
    expect(canMove(stepped, 1, 0)).toBe(true)
    expect(canMove(stepped, 0, 2)).toBe(true)
    expect(canMove(stepped, 0, 1, { lockedPeg: 1 })).toBe(false)
    expect(canMove(stepped, 1, 0, { lockedPeg: 1 })).toBe(false)
    expect(canMove(stepped, 0, 2, { lockedPeg: 1 })).toBe(true)
  })

  it('blocks same-color stacking under the rainbow law', () => {
    expect(colorOf(1)).toBe(colorOf(4))
    expect(colorOf(1)).not.toBe(colorOf(2))
    const split = [[4], [1], [], []]
    expect(canMove(split, 1, 0)).toBe(true)
    expect(canMove(split, 1, 0, { rainbow: true })).toBe(false)
    expect(canMove(split, 0, 2, { rainbow: true })).toBe(true)
  })

  it('preserves descending stacks across long deterministic play', () => {
    let state = 12345
    const next = () => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state / 2147483648
    }
    let board = createBoard(4, 8)
    let applied = 0
    for (let step = 0; step < 500; step += 1) {
      const from = Math.floor(next() * 4)
      const to = Math.floor(next() * 4)
      const options = { rainbow: step % 2 === 0 }
      if (!canMove(board, from, to, options)) continue
      board = move(board, from, to, options)
      applied += 1
      for (const peg of board) {
        for (let index = 1; index < peg.length; index += 1) expect(peg[index - 1]).toBeGreaterThan(peg[index])
      }
    }
    expect(applied).toBeGreaterThan(50)
  })
})

describe('par justification', () => {
  it('matches 2^n - 1 for every three-peg level against an independent search', () => {
    for (const chapter of [1, 2]) {
      for (const spec of levelsOf(chapter)) {
        expect(spec.pegs).toBe(3)
        expect(spec.par).toBe(2 ** spec.discs - 1)
        expect(solveMinMoves({ pegs: 3, discs: spec.discs })).toBe(spec.par)
      }
    }
  })

  it('derives chapter 3 par from the Frame-Stewart recurrence and a four-peg search', () => {
    const table = [0, 1, 3, 5, 9, 13, 17, 25, 33, 41, 49, 65, 81]
    for (let discs = 2; discs <= 12; discs += 1) {
      let best = Number.POSITIVE_INFINITY
      for (let k = 1; k < discs; k += 1) best = Math.min(best, 2 * table[discs - k] + 2 ** k - 1)
      expect(table[discs]).toBe(best)
    }
    for (const spec of levelsOf(3)) {
      expect(spec.pegs).toBe(4)
      expect(spec.par).toBe(table[spec.discs])
      if (spec.discs <= 9) expect(solveMinMoves({ pegs: 4, discs: spec.discs })).toBe(spec.par)
    }
  })

  it('prices the sealed chapter exactly and proves the lock is only a time penalty', () => {
    for (const spec of levelsOf(4)) {
      const unlockAfter = spec.unlockAfter as number
      expect(spec.lockedPeg).toBe(1)
      expect(unlockAfter).toBeGreaterThanOrEqual(2)
      expect(sealedPar(spec.discs, unlockAfter)).toBe(spec.par)
      expect(solveMinMoves({ pegs: 3, discs: spec.discs, lockedPeg: 1, unlockAfter })).toBe(spec.par)
      const free = solveMinMoves({ pegs: 3, discs: spec.discs })
      expect(free).toBe(2 ** spec.discs - 1)
      expect(spec.par).toBeGreaterThan(free)
      const path = solvePath({ pegs: 3, discs: spec.discs, lockedPeg: 1, unlockAfter })
      expect(path).toHaveLength(spec.par)
      let board = createBoard(3, spec.discs)
      path?.forEach((step, index) => {
        const lockedPeg = index < unlockAfter ? 1 : undefined
        expect(canMove(board, step.from, step.to, { lockedPeg }), `level ${spec.level} step ${index + 1}`).toBe(true)
        board = move(board, step.from, step.to, { lockedPeg })
      })
      expect(isSolved(board)).toBe(true)
    }
  })

  it('keeps the rainbow chapter solvable with alternating colors and BFS-priced par', () => {
    for (const spec of levelsOf(5)) {
      expect(spec.rainbow).toBe(true)
      expect(spec.budget).toBe(Math.ceil(spec.par * 1.25))
      expect(solveMinMoves({ pegs: 4, discs: spec.discs, rainbow: true })).toBe(spec.par)
      const path = solvePath({ pegs: 4, discs: spec.discs, rainbow: true })
      expect(path).toHaveLength(spec.par)
      let board = createBoard(4, spec.discs)
      path?.forEach((step) => {
        expect(canMove(board, step.from, step.to, { rainbow: true }), `level ${spec.level}`).toBe(true)
        board = move(board, step.from, step.to, { rainbow: true })
      })
      expect(isSolved(board)).toBe(true)
      expect(spec.par).toBeGreaterThanOrEqual(solveMinMoves({ pegs: 4, discs: spec.discs }))
    }
  })

  it('scores 1000 minus 15 per wasted move, floored at 100', () => {
    expect(scoreFor(31, 31)).toBe(1000)
    expect(scoreFor(30, 31)).toBe(1000)
    expect(scoreFor(35, 31)).toBe(940)
    expect(scoreFor(100, 31)).toBe(100)
  })

  it('handles boundary boards and solver limits', () => {
    expect(createBoard(3, 3)).toEqual([[3, 2, 1], [], []])
    expect(canMove(createBoard(3, 1), 0, 1)).toBe(true)
    expect(isSolved([[], [], [2, 1]])).toBe(true)
    expect(isSolved([[], [], [1, 2]])).toBe(false)
    expect(isSolved([[1], [2], []])).toBe(false)
    expect(isSolved(createBoard(3, 3))).toBe(false)
    expect(solveMinMoves({ pegs: 2, discs: 3 })).toBe(-1)
    expect(solvePath({ pegs: 3, discs: 13 })).toBeNull()
  })
})
