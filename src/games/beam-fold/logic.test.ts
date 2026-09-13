import { describe, expect, it } from 'vitest'
import {
  countBeamSolutions, coversAll, generateBeamPuzzle, MAX_MISTAKES, pieceExits, PIECE_MIRROR_A,
  PIECE_MIRROR_B, PIECE_NONE, PIECE_SPLIT_A, PIECE_SPLIT_B, scoreFor, solveBeam, traceBeam,
  type BeamPuzzle,
} from './logic'
import { BEAM_LEVEL_COUNT, chapterOf, getBeamLevel } from './levels'

const blanks = (total: number) => Array.from({ length: total }, () => false)
const empties = (total: number) => Array.from({ length: total }, () => PIECE_NONE)
const bareTrace = (puzzle: BeamPuzzle) => traceBeam(puzzle.rows, puzzle.cols, empties(puzzle.rows * puzzle.cols), puzzle.blocks, puzzle.source, puzzle.sourceDir)
const solveTrace = (puzzle: BeamPuzzle, pieces: readonly number[]) => traceBeam(puzzle.rows, puzzle.cols, pieces, puzzle.blocks, puzzle.source, puzzle.sourceDir)

describe('beam-fold optics', () => {
  it('reflects mirrors, splits beams and absorbs blockers by invariant', () => {
    expect(pieceExits(PIECE_MIRROR_A, 0)).toEqual([1])
    expect(pieceExits(PIECE_MIRROR_A, 3)).toEqual([2])
    expect(pieceExits(PIECE_MIRROR_B, 1)).toEqual([2])
    expect(pieceExits(PIECE_MIRROR_B, 3)).toEqual([0])
    expect(pieceExits(PIECE_SPLIT_A, 2)).toEqual([3, 2])
    expect(pieceExits(PIECE_SPLIT_B, 0)).toEqual([3, 0])
    expect(pieceExits(PIECE_NONE, 1)).toEqual([1])
    const straight = traceBeam(1, 4, empties(4), blanks(4), 0, 1)
    expect(straight.lit).toEqual([true, true, true, true])
    expect(straight.beams[1] & (1 << 3)).toBeTruthy()
    expect(straight.beams[1] & (1 << 1)).toBeTruthy()
    const bent = empties(6)
    bent[1] = PIECE_MIRROR_B
    const folded = traceBeam(2, 3, bent, blanks(6), 0, 1)
    expect([folded.lit[0], folded.lit[1], folded.lit[4]]).toEqual([true, true, true])
    expect(folded.lit[2]).toBe(false)
    const split = empties(3)
    split[1] = PIECE_SPLIT_A
    const twin = traceBeam(1, 3, split, blanks(3), 0, 1)
    expect(twin.lit).toEqual([true, true, true])
    const blocked = traceBeam(1, 4, empties(4), [false, false, true, false], 0, 1)
    expect(blocked.lit).toEqual([true, true, true, false])
    expect(blocked.beams[2] & (1 << 3)).toBeTruthy()
    expect(blocked.beams[3]).toBe(0)
  })

  it('terminates mirror loops through the visited-state guard', () => {
    const looping = Array.from({ length: 4 }, () => PIECE_MIRROR_A)
    const state = traceBeam(2, 2, looping, blanks(4), 0, 0)
    expect(state.litCount).toBeLessThanOrEqual(4)
    expect(state.lit[0]).toBe(true)
  })
})

describe('beam-fold generator', () => {
  it('never trips the generation escape hatch for all sixty levels (不触发退化抛错)', () => {
    for (let level = 1; level <= BEAM_LEVEL_COUNT; level += 1) {
      expect(() => generateBeamPuzzle(level), `level ${level} generation threw`).not.toThrow()
    }
  })

  it('generates identical puzzles for the same level and clamps boundaries', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) expect(generateBeamPuzzle(level)).toEqual(generateBeamPuzzle(level))
    expect(generateBeamPuzzle(-3)).toEqual(generateBeamPuzzle(1))
    expect(generateBeamPuzzle(999)).toEqual(generateBeamPuzzle(BEAM_LEVEL_COUNT))
  })

  it('publishes 60 non-trivial puzzles whose laid mirrors cover every target', () => {
    for (let level = 1; level <= BEAM_LEVEL_COUNT; level += 1) {
      const spec = getBeamLevel(level)
      const puzzle = generateBeamPuzzle(level)
      expect(puzzle.rows, `level ${level}`).toBe(spec.rows)
      expect(puzzle.cols, `level ${level}`).toBe(spec.cols)
      expect(puzzle.par, `level ${level} must use every generated piece`).toBe(spec.mirrors + spec.splitters)
      expect(puzzle.blocks.filter(Boolean), `level ${level}`).toHaveLength(spec.blocks)
      expect(puzzle.targets.length, `level ${level}`).toBeGreaterThanOrEqual(spec.minCovered)
      expect(coversAll(bareTrace(puzzle), puzzle.targets), `level ${level} must not start solved`).toBe(false)
      expect(coversAll(solveTrace(puzzle, puzzle.solution), puzzle.targets), `level ${level} must be solvable`).toBe(true)
      const slotSet = new Set(puzzle.slots)
      expect(slotSet.size, `level ${level}`).toBe(puzzle.slots.length)
      puzzle.solution.forEach((piece, cell) => {
        if (piece !== PIECE_NONE) expect(slotSet.has(cell), `level ${level} piece at ${cell}`).toBe(true)
      })
      puzzle.slots.forEach((cell) => {
        expect(cell, `level ${level}`).toBeGreaterThanOrEqual(0)
        expect(cell, `level ${level}`).toBeLessThan(puzzle.rows * puzzle.cols)
        expect(puzzle.blocks[cell], `level ${level}`).toBe(false)
        expect(cell, `level ${level}`).not.toBe(puzzle.source)
      })
    }
  })

  it('exhaustively certifies a covering placement for every published level', () => {
    for (let level = 1; level <= BEAM_LEVEL_COUNT; level += 1) {
      const puzzle = generateBeamPuzzle(level)
      const found = solveBeam(puzzle)
      expect(found, `level ${level} must be solvable`).not.toBeNull()
      if (found) expect(coversAll(solveTrace(puzzle, found), puzzle.targets), `level ${level}`).toBe(true)
      expect(countBeamSolutions(puzzle), `level ${level}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('rejects targets that no placement can reach', () => {
    const walled: BeamPuzzle = {
      rows: 1, cols: 4, source: 0, sourceDir: 1, blocks: [false, false, true, false],
      slots: [1], targets: [0, 1, 3], allowSplitter: false, blackBox: false, budget: undefined,
      solution: empties(4), par: 0, depth: 3,
    }
    expect(solveBeam(walled)).toBeNull()
    expect(countBeamSolutions(walled)).toBe(0)
    const open: BeamPuzzle = { ...walled, targets: [0, 1] }
    expect(solveBeam(open)).not.toBeNull()
  })

  it('stages five chapters with escalating mechanics and cover demands', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(getBeamLevel(5)).toMatchObject({ rows: 6, cols: 6, mirrors: 1, splitters: 0, budgeted: false, blackBox: false })
    expect(getBeamLevel(15)).toMatchObject({ rows: 8, cols: 6, mirrors: 2, budgeted: false })
    expect(getBeamLevel(27)).toMatchObject({ budgeted: true, splitters: 0, blocks: 2 })
    expect(getBeamLevel(38)).toMatchObject({ splitters: 1, budgeted: true, blackBox: false })
    expect(getBeamLevel(50)).toMatchObject({ blackBox: true, splitters: 1, budgeted: true, blocks: 3 })
    expect(getBeamLevel(60)).toMatchObject({ blackBox: true })
    expect(getBeamLevel(1).minCovered).toBeLessThan(getBeamLevel(11).minCovered)
    for (let level = 1; level <= BEAM_LEVEL_COUNT; level += 1) {
      const spec = getBeamLevel(level)
      const puzzle = generateBeamPuzzle(level)
      expect(puzzle.allowSplitter, `level ${level}`).toBe(spec.splitters > 0)
      expect(puzzle.blackBox, `level ${level}`).toBe(spec.blackBox)
      if (spec.budgeted) expect(puzzle.budget, `level ${level}`).toBeDefined()
      else expect(puzzle.budget, `level ${level}`).toBeUndefined()
    }
  })

  it('keeps step budgets far above the par piece count', () => {
    for (let level = 12; level <= BEAM_LEVEL_COUNT; level += 1) {
      const puzzle = generateBeamPuzzle(level)
      if (!getBeamLevel(level).budgeted) continue
      expect(puzzle.budget, `level ${level}`).toBeDefined()
      if (puzzle.budget !== undefined) expect(puzzle.budget, `level ${level}`).toBe(puzzle.par * 4 + 2)
      expect(puzzle.budget, `level ${level}`).toBeGreaterThan(puzzle.par * 3)
    }
    expect(generateBeamPuzzle(5).budget).toBeUndefined()
  })

  it('deepens coverage demands across chapters', () => {
    const sums = Array.from({ length: 5 }, () => 0)
    for (let level = 1; level <= BEAM_LEVEL_COUNT; level += 1) sums[chapterOf(level) - 1] += generateBeamPuzzle(level).depth
    const averages = sums.map((sum, index) => sum / (index === 4 ? 16 : 11))
    for (let chapter = 0; chapter < 4; chapter += 1) expect(averages[chapter + 1]).toBeGreaterThan(averages[chapter])
    expect(averages[4]).toBeGreaterThanOrEqual(averages[3])
  })
})

describe('beam-fold scoring', () => {
  it('charges 12 per op over par and 150 per wrong submission with a floor', () => {
    expect(scoreFor(3, 3, 0)).toBe(1000)
    expect(scoreFor(5, 3, 0)).toBe(976)
    expect(scoreFor(3, 3, 1)).toBe(850)
    expect(scoreFor(0, 0, MAX_MISTAKES)).toBe(550)
    expect(scoreFor(999, 0, 9)).toBe(100)
    expect(MAX_MISTAKES).toBe(3)
  })
})
