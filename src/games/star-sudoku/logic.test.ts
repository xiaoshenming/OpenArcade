import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import { bit, boxOf, clearPeerNotes, computeScore, countSolutions, digHoles, fillGrid, hasConflict, isPuzzleSolved, peerIndexes, specFor, toggleNote } from './logic'

const rowsOf = (grid: number[], size: number, row: number) => grid.slice(row * size, row * size + size)
const colsOf = (grid: number[], size: number, col: number) => grid.filter((_, index) => index % size === col)
const boxesOf = (grid: number[], spec: ReturnType<typeof specFor>, box: number) => grid.filter((_, index) => boxOf(index, spec) === box)
const allDigitSets = (groups: number[][], size: number) => groups.every((group) => new Set(group).size === size && group.every((value) => value >= 1 && value <= size))

describe('star sudoku core', () => {
  it('fills complete, rule-valid grids for every board size', () => {
    for (const size of [4, 6, 9]) {
      const spec = specFor(size)
      for (let seed = 1; seed <= 4; seed += 1) {
        const grid = fillGrid(mulberry32(seed * 7919 + size), spec)
        expect(grid).toHaveLength(size * size)
        for (let row = 0; row < size; row += 1) expect(allDigitSets([rowsOf(grid, size, row)], size)).toBe(true)
        for (let col = 0; col < size; col += 1) expect(allDigitSets([colsOf(grid, size, col)], size)).toBe(true)
        for (let box = 0; box < size; box += 1) expect(allDigitSets([boxesOf(grid, spec, box)], size)).toBe(true)
        expect(countSolutions(grid, spec, 2)).toBe(1)
      }
    }
  })

  it('caps the solution counter at the requested limit', () => {
    const spec = specFor(4)
    expect(countSolutions(new Array<number>(16).fill(0), spec, 2)).toBe(2)
    expect(countSolutions(new Array<number>(16).fill(0), spec, 1)).toBe(1)
    const solved = fillGrid(mulberry32(42), spec)
    expect(countSolutions(solved, spec, 2)).toBe(1)
    expect(countSolutions(solved.map((value, index) => (index === 0 ? 0 : value)), spec, 2)).toBe(1)
  })

  it('detects row, column and box conflicts and correct placements', () => {
    const spec = specFor(4)
    const grid = new Array<number>(16).fill(0)
    grid[0] = 1
    grid[1] = 1
    expect(hasConflict(grid, 1, spec)).toBe(true)
    grid[1] = 0
    grid[4] = 1
    expect(hasConflict(grid, 4, spec)).toBe(true)
    grid[4] = 0
    grid[5] = 1
    expect(hasConflict(grid, 5, spec)).toBe(true)
    grid[5] = 2
    expect(hasConflict(grid, 5, spec)).toBe(false)
    expect(hasConflict(grid, 0, spec)).toBe(false)
    expect(peerIndexes(0, spec)).toHaveLength(7)
    expect(peerIndexes(0, spec)).not.toContain(0)
  })

  it('toggles pencil notes and sweeps peers when a digit lands', () => {
    const spec = specFor(4)
    expect(toggleNote(toggleNote(new Array<number>(16).fill(0), 0, 2), 0, 2)[0]).toBe(0)
    const seeded = new Array<number>(16).fill(0)
    seeded[1] = bit(2)
    seeded[4] = bit(2)
    seeded[5] = bit(2)
    seeded[15] = bit(2)
    const swept = clearPeerNotes(seeded, 0, 2, spec)
    expect(swept[0]).toBe(0)
    expect(swept[1]).toBe(0)
    expect(swept[4]).toBe(0)
    expect(swept[5]).toBe(0)
    expect(swept[15] & bit(2)).toBeTruthy()
  })

  it('scores with error and overtime penalties inside the policy band', () => {
    expect(computeScore(0, 0, 40, false)).toBe(1000)
    expect(computeScore(2, 0, 40, false)).toBe(880)
    expect(computeScore(0, 50, 40, false)).toBe(985)
    expect(computeScore(0, 50, 40, true)).toBe(970)
    expect(computeScore(3, 400, 360, true)).toBe(700)
    expect(computeScore(20, 6000, 40, true)).toBe(100)
  })

  it('only reports solved boards when every entry matches the unique solution', () => {
    const spec = specFor(4)
    const solution = fillGrid(mulberry32(7), spec)
    const givens = digHoles(mulberry32(8), solution, spec, 8)
    expect(isPuzzleSolved(givens, solution, solution)).toBe(true)
    expect(isPuzzleSolved(givens, new Array<number>(16).fill(0), solution)).toBe(false)
    const hole = givens.findIndex((value) => value === 0)
    expect(hole).toBeGreaterThanOrEqual(0)
    const wrong = [...solution]
    wrong[hole] = wrong[hole] % 4 + 1
    expect(isPuzzleSolved(givens, wrong, solution)).toBe(false)
  })
})
