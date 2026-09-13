import { describe, expect, it } from 'vitest'
import { cellKey, countWays, hexDisk, hexDist, hexRing, isSolved, NECTAR_MAX, ringBroken, ringSums, scoreFor, type HiveLevel, type RingClue } from './logic'

describe('honey hive ring mechanics', () => {
  it('enumerates hexagonal rings with exact distance and disjoint coverage', () => {
    expect(hexRing(0)).toEqual([{ q: 0, r: 0 }])
    expect(hexRing(1)).toHaveLength(6)
    expect(hexRing(1).map(cellKey)).toEqual(['-1,1', '0,1', '1,0', '1,-1', '0,-1', '-1,0'])
    for (let k = 1; k <= 4; k += 1) {
      const ring = hexRing(k)
      expect(ring, `ring ${k} size`).toHaveLength(6 * k)
      ring.forEach((cell) => expect(hexDist(cell.q, cell.r), `ring ${k} cell ${cellKey(cell)}`).toBe(k))
      expect(new Set(ring.map(cellKey)).size).toBe(6 * k)
    }
    const disk = hexDisk(3)
    expect(disk).toHaveLength(37)
    expect(new Set(disk.map(cellKey)).size).toBe(37)
    for (let radius = 0; radius <= 4; radius += 1) expect(hexDisk(radius)).toHaveLength(3 * radius * (radius + 1) + 1)
    expect(hexDist(2, -1)).toBe(2)
    expect(hexDist(-3, 3)).toBe(3)
  })

  it('counts nectar compositions and rejects impossible ring sums', () => {
    expect(countWays(0, 0)).toBe(1)
    expect(countWays(4, 0)).toBe(0)
    expect(countWays(2, 2)).toBe(1)
    expect(countWays(3, 2)).toBe(2)
    expect(countWays(7, 2)).toBe(6)
    expect(countWays(8, 2)).toBe(5)
    expect(countWays(12, 2)).toBe(1)
    expect(countWays(1, 2)).toBe(0)
    expect(countWays(13, 2)).toBe(0)
    expect(countWays(6, 1)).toBe(1)
    expect(countWays(7, 1)).toBe(0)
    expect(countWays(-3, 2)).toBe(0)
    expect(countWays(21, 6)).toBeGreaterThan(1)
    for (let empties = 2; empties <= 8; empties += 1) {
      expect(countWays(empties, empties), `min ${empties}`).toBe(1)
      expect(countWays(NECTAR_MAX * empties, empties), `max ${empties}`).toBe(1)
    }
  })

  it('flags broken rings only on overflow, shortfall, or wrong completion', () => {
    expect(ringBroken(18, 10, 3, 6)).toBe(false)
    expect(ringBroken(18, 19, 4, 6)).toBe(true)
    expect(ringBroken(18, 18, 6, 6)).toBe(false)
    expect(ringBroken(18, 17, 6, 6)).toBe(true)
    expect(ringBroken(18, 0, 0, 6)).toBe(false)
    expect(ringBroken(6, 0, 0, 6)).toBe(false)
    expect(ringBroken(5, 0, 0, 6)).toBe(true)
    expect(ringBroken(18, 18, 3, 6)).toBe(true)
  })

  it('resolves delta clue cascades into absolute ring sums', () => {
    const clues: RingClue[] = [
      { kind: 'sum', value: 4 },
      { kind: 'sum', value: 22 },
      { kind: 'delta', value: 9 },
      { kind: 'delta', value: -6 },
    ]
    expect(ringSums(clues)).toEqual([4, 22, 31, 25])
    expect(ringSums([{ kind: 'sum', value: 3 }])).toEqual([3])
  })

  it('solves only when every cell is poured and every ring matches its target', () => {
    const level = {
      radius: 1,
      rings: [[{ q: 0, r: 0 }], hexRing(1)],
      cells: hexDisk(1),
      ringIndex: Object.fromEntries(hexDisk(1).map((cell) => [cellKey(cell), hexDist(cell.q, cell.r)])),
      solution: { '0,0': 3, ...Object.fromEntries(hexRing(1).map((cell) => [cellKey(cell), 2])) },
      givens: { '0,0': 3 },
      clues: [{ kind: 'sum', value: 3 }, { kind: 'sum', value: 12 }],
      empties: 6,
      singles: 0,
      deltaRings: 0,
      budget: null,
      par: 90,
    } as HiveLevel
    expect(isSolved(level, {})).toBe(false)
    const partial = { '0,0': 3, '-1,1': 2, '0,1': 2 }
    expect(isSolved(level, partial)).toBe(false)
    expect(isSolved(level, level.solution)).toBe(true)
    const swapped = { ...level.solution, '0,-1': 3, '-1,0': 1 }
    expect(isSolved(level, swapped)).toBe(true)
    const wrong = { ...level.solution, '0,-1': 4 }
    expect(isSolved(level, wrong)).toBe(false)
    expect(scoreFor(0, 30, 90)).toBe(1000)
    expect(scoreFor(2, 100, 90)).toBe(870)
    expect(scoreFor(6, 800, 90)).toBe(100)
    expect(scoreFor(1, 0, 90)).toBe(940)
  })
})
