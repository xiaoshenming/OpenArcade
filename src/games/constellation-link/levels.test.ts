import { describe, expect, it } from 'vitest'
import { countSolutions, degreesFor, isSolved, neighborsOf } from './logic'
import { chapterOf, createConstellationPuzzle, getConstellationLevel, LEVEL_COUNT } from './levels'

describe('constellation link levels', () => {
  it('constructs a unique, replayable solution for all sixty levels', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const puzzle = createConstellationPuzzle(level)
      const { sky, clues, solution, par } = puzzle
      expect(clues).toHaveLength(sky.stars.length)
      expect(par).toBe(solution.length)
      expect(par).toBeGreaterThanOrEqual(sky.stars.length)
      expect(sky.edges.length).toBeGreaterThan(solution.length)
      expect(solution.every((edge) => edge >= 0 && edge < sky.edges.length)).toBe(true)
      expect(countSolutions(sky, clues, 2)).toBe(1)
      expect(isSolved(clues, degreesFor(sky, solution))).toBe(true)
      expect(clues.every((clue) => clue >= 1 && clue <= 4)).toBe(true)
      const adjacent = solution.every((edge) => {
        const { a, b } = sky.edges[edge]
        return neighborsOf(a, sky.cols, sky.rows).includes(b)
      })
      expect(adjacent).toBe(true)
    }
  })

  it('replays deterministically and keeps all sixty skies distinct', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      expect(createConstellationPuzzle(level)).toEqual(createConstellationPuzzle(level))
    }
    const signatures = new Set(Array.from({ length: LEVEL_COUNT }, (_, index) => {
      const puzzle = createConstellationPuzzle(index + 1)
      return `${puzzle.sky.stars.join('.')}|${puzzle.solution.join('.')}`
    }))
    expect(signatures.size).toBe(LEVEL_COUNT)
  })

  it('escalates stars, chords and mechanics across five chapters', () => {
    expect(getConstellationLevel(1)).toMatchObject({ chapter: 1, stars: 6, cols: 5, mistakeLimit: undefined })
    expect(getConstellationLevel(12)).toMatchObject({ chapter: 2, stars: 8, cols: 5 })
    expect(getConstellationLevel(23)).toMatchObject({ chapter: 3, stars: 10, mistakeLimit: 3, slack: 0 })
    expect(getConstellationLevel(34)).toMatchObject({ chapter: 4, stars: 12, slack: 8, mistakeLimit: undefined })
    expect(getConstellationLevel(45)).toMatchObject({ chapter: 5, stars: 14, cols: 7, mistakeLimit: 3 })
    expect(getConstellationLevel(45)).toMatchObject({ slack: 6 })
    expect(getConstellationLevel(60)).toMatchObject({ chapter: 5, slack: 3 })
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const from = [1, 12, 23, 34, 45][chapter - 1]
      const to = [11, 22, 33, 44, 60][chapter - 1]
      for (let level = from; level <= to; level += 1) expect(getConstellationLevel(level).chapter).toBe(chapter)
    }
    const chords = Array.from({ length: LEVEL_COUNT }, (_, index) => getConstellationLevel(index + 1).chords)
    for (let index = 1; index < chords.length; index += 1) expect(chords[index]).toBeGreaterThanOrEqual(chords[index - 1])
    expect(chords[0]).toBe(1)
    expect(chords[LEVEL_COUNT - 1]).toBe(8)
  })

  it('keeps budget chapters tight and never looser across each chapter', () => {
    for (const level of [1, 11, 12, 22, 23, 33]) {
      expect(createConstellationPuzzle(level).budget).toBeUndefined()
    }
    for (let level = 34; level <= LEVEL_COUNT; level += 1) {
      const puzzle = createConstellationPuzzle(level)
      expect(puzzle.budget).toBe(puzzle.par + getConstellationLevel(level).slack)
      expect(puzzle.budget as number).toBeGreaterThanOrEqual(puzzle.par + 3)
    }
    const slacks = Array.from({ length: LEVEL_COUNT }, (_, index) => getConstellationLevel(index + 1).slack)
    for (let level = 34; level < 44; level += 1) expect(slacks[level]).toBeLessThanOrEqual(slacks[level - 1])
    for (let level = 45; level < 60; level += 1) expect(slacks[level]).toBeLessThanOrEqual(slacks[level - 1])
  })

  it('clamps boundary levels into the valid range', () => {
    expect(getConstellationLevel(0)).toEqual(getConstellationLevel(1))
    expect(getConstellationLevel(999)).toEqual(getConstellationLevel(LEVEL_COUNT))
    expect(getConstellationLevel(Number.NaN)).toEqual(getConstellationLevel(1))
    expect(createConstellationPuzzle(0)).toEqual(createConstellationPuzzle(1))
    expect(createConstellationPuzzle(-7)).toEqual(createConstellationPuzzle(1))
    expect(createConstellationPuzzle(999)).toEqual(createConstellationPuzzle(LEVEL_COUNT))
    expect(chapterOf(0)).toBe(1)
    expect(chapterOf(60)).toBe(5)
  })
})
