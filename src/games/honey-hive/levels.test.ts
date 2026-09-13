import { describe, expect, it } from 'vitest'
import { cellKey, countWays, hexDist, isSolved, ringSums } from './logic'
import { createHiveLevel, getHiveSpec } from './levels'

const ALL = Array.from({ length: 60 }, (_, index) => createHiveLevel(index + 1))

const ringFreedom = (entry: (typeof ALL)[number], index: number) => {
  const target = ringSums(entry.clues)[index]
  const ring = entry.rings[index]
  let givenSum = 0
  let givens = 0
  ring.forEach((cell) => {
    const given = entry.givens[cellKey(cell)]
    if (given) {
      givenSum += given
      givens += 1
    }
  })
  return countWays(target - givenSum, ring.length - givens)
}

describe('honey hive level system', () => {
  it('generates sixty unique deterministic honeycombs with solvable structure', () => {
    for (let level = 1; level <= 60; level += 1) {
      const first = createHiveLevel(level)
      const second = createHiveLevel(level)
      expect(first).toEqual(second)
      expect(Object.keys(first.givens)).toContain('0,0')
      expect(first.empties).toBeGreaterThan(0)
      expect(first.empties).toBe(first.cells.length - Object.keys(first.givens).length)
      expect(isSolved(first, first.solution), `level ${level} replay`).toBe(true)
      Object.entries(first.givens).forEach(([key, value]) => expect(first.solution[key]).toBe(value))
    }
    expect(new Set(ALL.map((entry) => Object.values(entry.solution).join(''))).size).toBe(60)
  })

  it('keeps every ring uniquely solvable under its clue across all levels', () => {
    for (const [index, entry] of ALL.entries()) {
      expect(entry.clues[0].kind, `level ${index + 1} center`).toBe('sum')
      const sums = ringSums(entry.clues)
      for (let ring = 0; ring <= entry.radius; ring += 1) {
        expect(ringFreedom(entry, ring), `level ${index + 1} ring ${ring}`).toBe(1)
        const total = entry.rings[ring].reduce((sum, cell) => sum + entry.solution[cellKey(cell)], 0)
        expect(total, `level ${index + 1} ring ${ring} sum`).toBe(sums[ring])
      }
      expect(Object.keys(entry.ringIndex)).toHaveLength(entry.cells.length)
    }
  })

  it('derives delta clues from adjacent ring differences with chapter gating', () => {
    expect(getHiveSpec(5).deltaCount).toBe(0)
    expect(getHiveSpec(30).deltaCount).toBe(0)
    expect(getHiveSpec(34).deltaCount).toBe(1)
    expect(getHiveSpec(39).deltaCount).toBe(2)
    expect(getHiveSpec(45).deltaCount).toBe(2)
    expect(getHiveSpec(54).deltaCount).toBe(3)
    for (const [index, entry] of ALL.entries()) {
      const spec = getHiveSpec(index + 1)
      const deltas = entry.clues.slice(1).filter((clue) => clue.kind === 'delta')
      expect(deltas, `level ${index + 1} delta rings`).toHaveLength(spec.deltaCount)
      const sums = ringSums(entry.clues)
      entry.clues.forEach((clue, ring) => {
        if (clue.kind === 'delta') expect(clue.value, `level ${index + 1} ring ${ring}`).toBe(sums[ring] - sums[ring - 1])
      })
    }
  })

  it('ramps radius, deductions, and budgets chapter over chapter', () => {
    expect([1, 12, 23, 34, 45].map((level) => getHiveSpec(level).radius)).toEqual([2, 3, 3, 3, 4])
    expect([1, 12, 23, 34, 45].map((level) => getHiveSpec(level).par)).toEqual([90, 200, 380, 470, 540])
    expect([1, 12, 23, 34, 45].map((level) => getHiveSpec(level).budget)).toEqual([null, null, 3, 3, 3])
    const deductions = (chapter: number) => ALL.filter((_, index) => getHiveSpec(index + 1).chapter === chapter).map((entry) => entry.singles + entry.deltaRings)
    expect(Math.max(...deductions(1))).toBe(0)
    expect(Math.min(...deductions(2))).toBeGreaterThan(Math.max(...deductions(1)))
    expect(Math.min(...deductions(3))).toBeGreaterThan(Math.max(...deductions(1)))
    expect(Math.min(...deductions(4))).toBeGreaterThan(Math.max(...deductions(2)))
    expect(Math.min(...deductions(5))).toBeGreaterThan(Math.max(...deductions(4)))
    ALL.forEach((entry) => expect(entry.empties).toBeGreaterThanOrEqual(10))
    ALL.forEach((entry) => expect(entry.empties).toBeLessThanOrEqual(entry.cells.length - 3))
  })

  it('keeps chapter one on a plain two-ring disk with uniform fills only', () => {
    for (let level = 1; level <= 11; level += 1) {
      const entry = createHiveLevel(level)
      expect(entry.radius).toBe(2)
      expect(entry.singles).toBe(0)
      expect(entry.deltaRings).toBe(0)
      expect(entry.clues.every((clue) => clue.kind === 'sum')).toBe(true)
      entry.rings.slice(1).forEach((ring) => {
        const empties = ring.filter((cell) => !entry.givens[cellKey(cell)])
        expect(empties.length, `level ${level}`).toBeGreaterThanOrEqual(3)
        empties.forEach((cell) => {
          const value = entry.solution[cellKey(cell)]
          expect(value === 1 || value === 6, `level ${level} uniform fill`).toBe(true)
        })
      })
    }
    expect(createHiveLevel(13).singles).toBe(1)
    expect(createHiveLevel(24).singles).toBe(2)
    expect(createHiveLevel(46).radius).toBe(4)
  })

  it('clamps out-of-range levels onto the deterministic ladder', () => {
    expect(getHiveSpec(0).level).toBe(1)
    expect(getHiveSpec(999).level).toBe(60)
    expect(createHiveLevel(0)).toEqual(createHiveLevel(1))
    expect(createHiveLevel(-7)).toEqual(createHiveLevel(1))
    expect(createHiveLevel(999)).toEqual(createHiveLevel(60))
    expect(createHiveLevel(7.8)).toEqual(createHiveLevel(7))
    for (let level = 1; level <= 60; level += 1) {
      const entry = createHiveLevel(level)
      entry.cells.forEach((cell) => expect(hexDist(cell.q, cell.r)).toBeLessThanOrEqual(entry.radius))
    }
  })
})
