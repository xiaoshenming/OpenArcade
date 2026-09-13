import { describe, expect, it } from 'vitest'
import {
  areNeighbors, dirBetween, generateCloudPuzzle, MAX_MISTAKES, REVEAL_MS, scoreFor,
  validatePath, type CloudPuzzle,
} from './logic'
import { CLOUD_LEVEL_COUNT, chapterOf, getCloudLevel } from './levels'

const makePuzzle = (overrides: Partial<CloudPuzzle>): CloudPuzzle => ({
  rows: 2, cols: 2, start: 0, anchors: [3], storms: [false, true, false, false],
  budget: 3, solution: [0, 2, 3], par: 2, fog: false, depth: 9, ...overrides,
})

describe('cloud-yard validator', () => {
  it('accepts only self-avoiding walks that honor start, storms, anchors and budget', () => {
    const puzzle = makePuzzle({})
    expect(validatePath(puzzle, [0, 2, 3])).toBe('ok')
    expect(validatePath(puzzle, [])).toBe('start')
    expect(validatePath(puzzle, [1])).toBe('start')
    expect(validatePath(puzzle, [0, 1])).toBe('storm')
    expect(validatePath(puzzle, [0, 2, 0, 3])).toBe('self')
    expect(validatePath(puzzle, [0, 3])).toBe('jump')
    expect(validatePath(puzzle, [0, 2])).toBe('anchor')
    expect(validatePath(makePuzzle({ budget: 1 }), [0, 2, 3])).toBe('budget')
    expect(validatePath(makePuzzle({ storms: [false, false, false, false] }), [0, 1, 3])).toBe('ok')
    expect(validatePath(makePuzzle({}), [0, 9])).toBe('bounds')
  })

  it('knows its directions and adjacency', () => {
    expect(dirBetween(4, 4 - 4, 4)).toBe(0)
    expect(dirBetween(4, 4 + 1, 4)).toBe(1)
    expect(dirBetween(4, 4 + 4, 4)).toBe(2)
    expect(dirBetween(5, 4, 4)).toBe(3)
    expect(dirBetween(0, 5, 4)).toBe(-1)
    expect(areNeighbors(0, 1, 4)).toBe(true)
    expect(areNeighbors(0, 4, 4)).toBe(true)
    expect(areNeighbors(0, 5, 4)).toBe(false)
  })

  it('flags a walk that stops before collecting every anchor', () => {
    for (let level = 1; level <= CLOUD_LEVEL_COUNT; level += 1) {
      const puzzle = generateCloudPuzzle(level)
      const cut = puzzle.solution.slice(0, 2)
      expect(validatePath(puzzle, cut), `level ${level}`).toBe('anchor')
    }
  })
})

describe('cloud-yard generator', () => {
  it('generates identical puzzles for the same level and clamps boundaries', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) expect(generateCloudPuzzle(level)).toEqual(generateCloudPuzzle(level))
    expect(generateCloudPuzzle(-5)).toEqual(generateCloudPuzzle(1))
    expect(generateCloudPuzzle(999)).toEqual(generateCloudPuzzle(CLOUD_LEVEL_COUNT))
  })

  it('publishes 60 walks that the validator accepts as solutions', () => {
    for (let level = 1; level <= CLOUD_LEVEL_COUNT; level += 1) {
      const spec = getCloudLevel(level)
      const puzzle = generateCloudPuzzle(level)
      expect(validatePath(puzzle, puzzle.solution), `level ${level} must be a valid solution`).toBe('ok')
      expect(puzzle.rows, `level ${level}`).toBe(spec.rows)
      expect(puzzle.cols, `level ${level}`).toBe(spec.cols)
      expect(puzzle.par, `level ${level}`).toBe(spec.walk)
      expect(puzzle.budget, `level ${level}`).toBe(spec.walk + spec.slack)
      expect(puzzle.anchors, `level ${level}`).toHaveLength(spec.anchors)
      expect(puzzle.storms.filter(Boolean), `level ${level}`).toHaveLength(spec.storms)
      expect(puzzle.solution, `level ${level}`).toHaveLength(spec.walk + 1)
      expect(puzzle.storms[puzzle.start], `level ${level}`).toBe(false)
      puzzle.anchors.forEach((anchor) => {
        expect(anchor, `level ${level}`).not.toBe(puzzle.start)
        expect(puzzle.storms[anchor], `level ${level}`).toBe(false)
      })
      expect(new Set(puzzle.anchors).size, `level ${level}`).toBe(spec.anchors)
    }
  })

  it('stages five chapters with escalating mechanics and tighter slack', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(getCloudLevel(5)).toMatchObject({ rows: 6, cols: 6, anchors: 3, storms: 0, fog: false })
    expect(getCloudLevel(15)).toMatchObject({ rows: 7, cols: 7, anchors: 4, fog: false, storms: 0 })
    expect(getCloudLevel(27)).toMatchObject({ rows: 8, cols: 8, anchors: 5, fog: true, storms: 0 })
    expect(getCloudLevel(38)).toMatchObject({ storms: 3, fog: false })
    expect(getCloudLevel(50)).toMatchObject({ rows: 9, cols: 9, fog: true, storms: 4 })
    expect(getCloudLevel(60)).toMatchObject({ fog: true, storms: 4 })
    expect(getCloudLevel(60).slack).toBeLessThan(getCloudLevel(45).slack)
    expect(getCloudLevel(45).slack).toBeLessThanOrEqual(getCloudLevel(1).slack)
    for (let level = 1; level <= CLOUD_LEVEL_COUNT; level += 1) {
      expect(generateCloudPuzzle(level).fog, `level ${level}`).toBe(getCloudLevel(level).fog)
    }
    expect(REVEAL_MS).toBe(5000)
  })

  it('deepens the walks across chapters', () => {
    const sums = Array.from({ length: 5 }, () => 0)
    for (let level = 1; level <= CLOUD_LEVEL_COUNT; level += 1) sums[chapterOf(level) - 1] += generateCloudPuzzle(level).depth
    const averages = sums.map((sum, index) => sum / (index === 4 ? 16 : 11))
    for (let chapter = 0; chapter < 4; chapter += 1) expect(averages[chapter + 1]).toBeGreaterThan(averages[chapter])
    expect(averages[4]).toBeGreaterThanOrEqual(averages[3])
  })
})

describe('cloud-yard scoring', () => {
  it('charges 10 per step over par and 150 per wrong submission with a floor', () => {
    expect(scoreFor(12, 12, 0)).toBe(1000)
    expect(scoreFor(15, 12, 0)).toBe(970)
    expect(scoreFor(12, 12, 1)).toBe(850)
    expect(scoreFor(0, 0, MAX_MISTAKES)).toBe(550)
    expect(scoreFor(999, 0, 9)).toBe(100)
    expect(MAX_MISTAKES).toBe(3)
  })
})
