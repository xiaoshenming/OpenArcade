import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import { conflictCells, countSolutions, formatClock, generateFullGrid, generateGarden, lineComplete, nextValue, scoreFor, UNKNOWN } from './logic'

const rowsOf = (grid: readonly number[], size: number) => Array.from({ length: size }, (_, at) => grid.slice(at * size, at * size + size))
const colsOf = (grid: readonly number[], size: number) => Array.from({ length: size }, (_, at) => grid.map((_, row) => grid[row * size + at]))
const stamp = (grid: number[], at: number, values: readonly number[]) => {
  values.forEach((value, offset) => { grid[at + offset] = value })
  return grid
}

const expectValidGrid = (grid: readonly number[], size: number) => {
  const half = size / 2
  for (const lines of [rowsOf(grid, size), colsOf(grid, size)]) {
    for (const line of lines) {
      expect(line.filter((value) => value === 1)).toHaveLength(half)
      expect(line.filter((value) => value === 0)).toHaveLength(half)
      for (let at = 0; at + 2 < size; at += 1) {
        expect(line[at] === line[at + 1] && line[at + 1] === line[at + 2], `triple at ${at}`).toBe(false)
      }
    }
    for (let a = 0; a < size; a += 1) {
      for (let b = a + 1; b < size; b += 1) expect(lines[a]).not.toEqual(lines[b])
    }
  }
}

describe('garden grid invariants', () => {
  it('grows complete rule-valid grids for every bed size', () => {
    for (const size of [4, 6, 8]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const grid = generateFullGrid(mulberry32(seed * 7919 + size), size)
        expect(grid).toHaveLength(size * size)
        expect(grid.every((value) => value === 0 || value === 1)).toBe(true)
        expectValidGrid(grid, size)
        expect(countSolutions(grid, size, 2)).toBe(1)
      }
    }
  })

  it('counts solutions through propagation and reports contradictions', () => {
    const size = 4
    const full = generateFullGrid(mulberry32(42), size)
    expect(countSolutions(full, size, 2)).toBe(1)
    expect(countSolutions(new Array<number>(size * size).fill(UNKNOWN), size, 2)).toBe(2)
    const oneOff = [...full]
    oneOff[3] = UNKNOWN
    expect(countSolutions(oneOff, size, 2)).toBe(1)
    const tripled = stamp(new Array<number>(size * size).fill(UNKNOWN), 0, [0, 0, 0])
    expect(countSolutions(tripled, size, 2)).toBe(0)
  })

  it('rejects grids whose balanced rows would duplicate each other', () => {
    const size = 6
    const grid = stamp(new Array<number>(size * size).fill(UNKNOWN), 0, [0, 1, 0, 1, 0, 1])
    stamp(grid, size, [0, 1, 0, 1, 0, UNKNOWN])
    expect(countSolutions(grid, size, 2)).toBe(0)
  })

  it('cycles empty, zero, one and audits completed lines', () => {
    expect(nextValue(UNKNOWN)).toBe(0)
    expect(nextValue(0)).toBe(1)
    expect(nextValue(1)).toBe(UNKNOWN)
    const size = 4
    const blank = new Array<number>(size * size).fill(UNKNOWN)
    const done = stamp([...blank], 0, [0, 1, 0, 1])
    expect(lineComplete(done, size, 'row', 0)).toBe(true)
    expect(lineComplete(blank, size, 'row', 1)).toBe(false)
    const unbalanced = stamp([...blank], 0, [0, 0, 0, 1])
    expect(lineComplete(unbalanced, size, 'row', 0)).toBe(false)
    const triplied = stamp([...blank], 4, [0, 0, 0, 1])
    expect(lineComplete(triplied, size, 'row', 1)).toBe(false)
    const dup = stamp([...done], 4, [0, 1, 0, 1])
    expect(lineComplete(dup, size, 'row', 1)).toBe(false)
  })

  it('marks overflowing lines, triples and duplicate lines as conflicts', () => {
    const size = 4
    const blank = new Array<number>(size * size).fill(UNKNOWN)
    const put = (grid: number[], row: number, col: number, value: number) => {
      grid[row * size + col] = value
      return grid
    }
    expect(conflictCells(blank, size)).toEqual([])
    expect(conflictCells(stamp([...blank], 0, [1, 1, 1]), size)).toEqual([0, 1, 2])
    expect(conflictCells(stamp([...blank], 0, [1, 1, 0, 1]), size)).toEqual([0, 1, 3])
    expect(conflictCells(stamp(stamp([...blank], 0, [0, 1, 0, 1]), 4, [0, 1, 0, 1]), size)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    const columnTriple = put(put(put([...blank], 0, 0, 0), 1, 0, 0), 2, 0, 0)
    expect(conflictCells(columnTriple, size)).toEqual([0, 4, 8])
    const dupColumns = put(put(put(put(put(put(put(put([...blank], 0, 0, 0), 1, 0, 1), 2, 0, 0), 3, 0, 1), 0, 1, 0), 1, 1, 1), 2, 1, 0), 3, 1, 1)
    expect(conflictCells(dupColumns, size)).toEqual([0, 1, 4, 5, 8, 9, 12, 13])
  })
})

describe('garden scoring', () => {
  it('scores 1000 minus mistake and overtime penalties with a floor', () => {
    expect(scoreFor(0, 0, 40)).toBe(1000)
    expect(scoreFor(2, 0, 40)).toBe(880)
    expect(scoreFor(0, 49, 40)).toBe(1000)
    expect(scoreFor(0, 50, 40)).toBe(985)
    expect(scoreFor(4, 400, 300)).toBe(610)
    expect(scoreFor(20, 9000, 40)).toBe(100)
  })

  it('never rewards more mistakes or slower finishes', () => {
    for (let elapsed = 0; elapsed <= 400; elapsed += 25) {
      for (let mistakes = 0; mistakes <= 10; mistakes += 1) {
        expect(scoreFor(mistakes + 1, elapsed, 40)).toBeLessThanOrEqual(scoreFor(mistakes, elapsed, 40))
        expect(scoreFor(mistakes, elapsed + 1, 40)).toBeLessThanOrEqual(scoreFor(mistakes, elapsed, 40))
      }
    }
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(305)).toBe('5:05')
    expect(formatClock(-3)).toBe('0:00')
  })
})

describe('garden generator', () => {
  it('stays deterministic and uniquely solvable for clamped extreme hole targets', () => {
    for (const [seed, size, target] of [[7, 4, 12], [99, 6, 30], [1234, 8, 55]] as const) {
      const first = generateGarden(seed, size, target)
      const second = generateGarden(seed, size, target)
      expect(second).toEqual(first)
      expect(first.holes).toBeGreaterThan(0)
      expect(first.holes).toBeLessThanOrEqual(size * size)
      expect(countSolutions(first.givens, size, 2)).toBe(1)
      first.givens.forEach((value, index) => {
        if (value !== UNKNOWN) expect(value).toBe(first.solution[index])
      })
      expectValidGrid(first.solution, size)
    }
  })
})
