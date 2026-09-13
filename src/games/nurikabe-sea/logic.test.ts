import { describe, expect, it } from 'vitest'
import { auditSea, seaScore, solveReport, type SeaPuzzle } from './logic'
import { NURIKABE_LEVEL_COUNT, chapterOf, generateSeaPuzzle, getSeaLevel } from './levels'

const solutionState = (puzzle: SeaPuzzle) => puzzle.solution.map((flag) => (flag ? 1 : 0))
const startState = (puzzle: SeaPuzzle) => puzzle.given.map((flag) => (flag ? 1 : 0))
const orth = (cell: number, rows: number, cols: number) => {
  const row = Math.floor(cell / cols)
  const col = cell % cols
  const list: number[] = []
  if (row > 0) list.push(cell - cols)
  if (row + 1 < rows) list.push(cell + cols)
  if (col > 0) list.push(cell - 1)
  if (col + 1 < cols) list.push(cell + 1)
  return list.filter((next) => next >= 0 && next < rows * cols)
}

describe('nurikabe-sea generator', () => {
  it('publishes only valid, uniquely solvable puzzles for all sixty levels', () => {
    for (let level = 1; level <= NURIKABE_LEVEL_COUNT; level += 1) {
      const puzzle = generateSeaPuzzle(level)
      expect(auditSea(puzzle, solutionState(puzzle)).solved, `level ${level} solution`).toBe(true)
      expect(auditSea(puzzle, startState(puzzle)).solved, `level ${level} start`).toBe(false)
      puzzle.given.forEach((flag, cell) => {
        if (flag) expect(puzzle.solution[cell], `level ${level} given ${cell}`).toBe(true)
      })
      const report = solveReport(puzzle, new Array<number>(puzzle.rows * puzzle.cols).fill(0), 2, 1200)
      expect(report.settled, `level ${level} proof`).toBe(true)
      expect(report.count, `level ${level} unique`).toBe(1)
      puzzle.clues.forEach((clue) => {
        expect(clue.need, `level ${level} clue`).toBeGreaterThanOrEqual(1)
        expect(clue.need, `level ${level} clue`).toBeLessThanOrEqual(8)
      })
      const sea = puzzle.solution.reduce((sum, flag) => sum + (flag ? 1 : 0), 0)
      const welded = puzzle.given.reduce((sum, flag) => sum + (flag ? 1 : 0), 0)
      expect(puzzle.par, `level ${level} par`).toBe(sea - welded)
      const spec = getSeaLevel(level)
      if (spec.timeBase === 0) expect(puzzle.timeLimit, `level ${level}`).toBe(0)
      else expect(puzzle.timeLimit, `level ${level}`).toBeGreaterThan(puzzle.par * 2)
    }
  }, 590000)

  it('generates identical puzzles for the same level and clamps hostile input', () => {
    for (const level of [1, 14, 27, 41, 53, 60]) expect(generateSeaPuzzle(level)).toEqual(generateSeaPuzzle(level))
    expect(generateSeaPuzzle(-5)).toEqual(generateSeaPuzzle(1))
    expect(generateSeaPuzzle(0)).toEqual(generateSeaPuzzle(1))
    expect(generateSeaPuzzle(Number.NaN)).toEqual(generateSeaPuzzle(1))
    expect(generateSeaPuzzle(999)).toEqual(generateSeaPuzzle(NURIKABE_LEVEL_COUNT))
  }, 590000)

  it('stages five chapters with denser boards and stacked mechanics', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(getSeaLevel(5)).toMatchObject({ rows: 6, cols: 6, islands: 4, givenRatio: 0, timeBase: 0 })
    expect(getSeaLevel(15)).toMatchObject({ rows: 8, cols: 6, islands: 6, givenRatio: 0, timeBase: 0 })
    expect(getSeaLevel(25)).toMatchObject({ rows: 9, cols: 7, timeBase: 40, givenRatio: 0 })
    expect(getSeaLevel(36)).toMatchObject({ rows: 9, cols: 8, timeBase: 0 })
    expect(getSeaLevel(36).givenRatio).toBeGreaterThan(0)
    expect(getSeaLevel(50)).toMatchObject({ rows: 10, cols: 8, timeBase: 45 })
    expect(getSeaLevel(50).givenRatio).toBeGreaterThan(0)
    const clueCounts = [1, 2, 3, 4, 5].map((chapter) => {
      const levels = Array.from({ length: NURIKABE_LEVEL_COUNT }, (_, index) => index + 1).filter((level) => chapterOf(level) === chapter)
      return levels.reduce((sum, level) => sum + generateSeaPuzzle(level).clues.length, 0) / levels.length
    })
    for (let chapter = 1; chapter < clueCounts.length; chapter += 1) {
      expect(clueCounts[chapter], `chapter ${chapter + 1} clues`).toBeGreaterThan(clueCounts[chapter - 1])
    }
  }, 590000)
})

describe('nurikabe-sea validator', () => {
  it('rejects oversized, undersized, adjacent, disconnected and blocked seas', () => {
    const puzzle = generateSeaPuzzle(1)
    const solution = solutionState(puzzle)
    const clueIndex = puzzle.clues.findIndex((entry) => entry.need >= 2)
    const clue = puzzle.clues[clueIndex >= 0 ? clueIndex : 0]
    const grown = [...solution]
    const frontier = orth(clue.cell, puzzle.rows, puzzle.cols).filter((next) => solution[next] === 1)
    expect(frontier.length, 'island frontier exists').toBeGreaterThan(0)
    grown[frontier[0]] = 0
    const grownAudit = auditSea(puzzle, grown)
    expect(grownAudit.solved).toBe(false)
    expect(grownAudit.sizes[puzzle.clues.indexOf(clue)]).toBeGreaterThan(clue.need)
    if (clue.need >= 2) {
      const cells = [clue.cell]
      const seen = new Set<number>(cells)
      for (let head = 0; head < cells.length; head += 1) {
        for (const next of orth(cells[head], puzzle.rows, puzzle.cols)) {
          if (solution[next] === 0 && !seen.has(next)) {
            seen.add(next)
            cells.push(next)
          }
        }
      }
      const body = cells.find((cell) => cell !== clue.cell)
      expect(body, 'island body exists').toBeDefined()
      if (body !== undefined) {
        const shrunk = [...solution]
        shrunk[body] = 1
        expect(auditSea(puzzle, shrunk).solved).toBe(false)
      }
    }
    const adjacent: SeaPuzzle = { rows: 1, cols: 2, clues: [{ cell: 0, need: 1 }, { cell: 1, need: 1 }], given: [false, false], solution: [false, false], par: 0, timeLimit: 0 }
    expect(auditSea(adjacent, [0, 0]).islandsOk).toBe(false)
    expect(auditSea(adjacent, [0, 0]).solved).toBe(false)
    const split: SeaPuzzle = { rows: 2, cols: 3, clues: [{ cell: 0, need: 1 }, { cell: 2, need: 1 }], given: [false, false, false, false, false, false], solution: [false, true, false, true, true, true], par: 0, timeLimit: 0 }
    expect(auditSea(split, [0, 1, 0, 1, 0, 1]).seaLinked).toBe(false)
    expect(auditSea(split, [0, 1, 0, 1, 0, 1]).solved).toBe(false)
    const blocked: SeaPuzzle = { rows: 3, cols: 3, clues: [{ cell: 0, need: 1 }, { cell: 2, need: 1 }, { cell: 6, need: 1 }, { cell: 8, need: 1 }], given: [false, false, false, false, false, false, false, false, false], solution: [false, true, false, true, true, true, false, true, false], par: 0, timeLimit: 0 }
    expect(auditSea(blocked, [0, 1, 0, 1, 1, 1, 0, 1, 0]).solved).toBe(true)
    expect(auditSea(blocked, [0, 1, 1, 1, 1, 1, 0, 1, 0]).no2x2).toBe(false)
    expect(auditSea(blocked, [0, 1, 1, 1, 1, 1, 0, 1, 0]).solved).toBe(false)
  }, 590000)

  it('counts solutions, honours givens and flags dead states', () => {
    const pair: SeaPuzzle = { rows: 2, cols: 2, clues: [{ cell: 0, need: 2 }], given: [false, false, false, false], solution: [false, false, true, true], par: 0, timeLimit: 0 }
    const report = solveReport(pair, [0, 0, 0, 0], 2)
    expect(report.count).toBe(2)
    expect(report.settled).toBe(true)
    expect(report.samples).toHaveLength(2)
    const pinned: SeaPuzzle = { ...pair, given: [false, true, false, false] }
    expect(solveReport(pinned, [0, 0, 0, 0], 2).count).toBe(1)
    const strip: SeaPuzzle = { rows: 1, cols: 3, clues: [{ cell: 0, need: 1 }], given: [false, false, false], solution: [false, true, true], par: 2, timeLimit: 0 }
    expect(solveReport(strip, [0, 0, 0], 2).count).toBe(1)
    expect(solveReport(strip, [1, 0, 0], 1)).toEqual({ count: 0, settled: true, samples: [] })
    const halfPuzzle = generateSeaPuzzle(2)
    const half = solutionState(halfPuzzle).map((mark, cell) => (cell % 2 === 0 ? mark : 0))
    expect(solveReport(halfPuzzle, half, 2, 6000).count).toBeGreaterThanOrEqual(1)
    const live = generateSeaPuzzle(3)
    expect(solveReport(live, startState(live), 1, 8000).count).toBeGreaterThanOrEqual(1)
  }, 590000)
})

describe('nurikabe-sea scoring', () => {
  it('charges for fumbling over par and for lost souls, floored at 100', () => {
    expect(seaScore(20, 20, 0)).toBe(1000)
    expect(seaScore(26, 20, 0)).toBe(940)
    expect(seaScore(26, 20, 2)).toBe(820)
    expect(seaScore(500, 20, 0)).toBe(100)
    expect(seaScore(0, 20, 0)).toBe(1000)
  })
})
