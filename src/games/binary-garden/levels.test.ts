import { describe, expect, it } from 'vitest'
import { countSolutions, UNKNOWN } from './logic'
import { chapterOf, createGardenPuzzle, getGardenLevel, GARDEN_LEVEL_COUNT, type GardenLevelSpec } from './levels'

const allSpecs = (): GardenLevelSpec[] => Array.from({ length: GARDEN_LEVEL_COUNT }, (_, index) => getGardenLevel(index + 1))

describe('garden chapter ladder', () => {
  it('splits sixty levels into five chapters with growing beds', () => {
    const specs = allSpecs()
    expect([1, 2, 3, 4, 5].map((chapter) => specs.filter((spec) => spec.chapter === chapter).length)).toEqual([11, 11, 11, 11, 16])
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => chapterOf(level))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => getGardenLevel(level).size)).toEqual([4, 4, 6, 6, 8, 8, 8, 8, 8, 8])
    expect([1, 12, 23, 34, 45, 60].map((level) => getGardenLevel(level).mode)).toEqual(['sprout', 'bloom', 'thicket', 'thorn', 'mist', 'mist'])
    expect(getGardenLevel(60).title).toBe('终章·雾尽花开')
  })

  it('introduces one mechanic per chapter and combines them in the mist finale', () => {
    const specs = allSpecs()
    expect(specs.filter((spec) => spec.chapter <= 3).every((spec) => spec.maxMistakes === undefined && !spec.fog)).toBe(true)
    expect(specs.filter((spec) => spec.chapter === 4).every((spec) => spec.maxMistakes === 3 && !spec.fog)).toBe(true)
    expect(specs.filter((spec) => spec.chapter === 5).every((spec) => spec.maxMistakes === 3 && spec.fog)).toBe(true)
    expect(specs.filter((spec) => spec.chapter === 1).every((spec) => !spec.hintLine)).toBe(true)
    expect(specs.filter((spec) => spec.chapter >= 2).every((spec) => spec.hintLine)).toBe(true)
    expect(getGardenLevel(12).detail).toContain('提示线')
    expect(getGardenLevel(60).detail).toContain('迷雾')
  })

  it('never relaxes the difficulty curve between levels', () => {
    const specs = allSpecs()
    for (let at = 1; at < specs.length; at += 1) {
      expect(specs[at].size, `level ${at + 1}`).toBeGreaterThanOrEqual(specs[at - 1].size)
      expect(specs[at].holes, `level ${at + 1}`).toBeGreaterThanOrEqual(specs[at - 1].holes)
      expect(specs[at].maxMistakes ?? 0, `level ${at + 1}`).toBeGreaterThanOrEqual(specs[at - 1].maxMistakes ?? 0)
      expect(specs[at].par, `level ${at + 1}`).toBeGreaterThanOrEqual(specs[at - 1].par)
    }
    expect(specs.map((spec) => spec.par)).toEqual([...Array(11).fill(40), ...Array(11).fill(120), ...Array(38).fill(300)])
    expect(specs.filter((spec) => spec.chapter === 1).map((spec) => spec.holes)).toEqual([8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10])
    expect(specs.filter((spec) => spec.chapter === 5).every((spec) => spec.holes >= 50)).toBe(true)
  })
})

describe('garden puzzle catalog', () => {
  const expectHintLine = (level: number, puzzle: ReturnType<typeof createGardenPuzzle>) => {
    const spec = getGardenLevel(level)
    if (!spec.hintLine) {
      expect(puzzle.hint, `level ${level}`).toBeUndefined()
      return
    }
    expect(puzzle.hint, `level ${level}`).toBeDefined()
    const { kind, at } = puzzle.hint!
    expect(at, `level ${level} hint at`).toBeGreaterThanOrEqual(0)
    expect(at, `level ${level} hint at`).toBeLessThan(spec.size)
    const cells = Array.from({ length: spec.size }, (_, step) => (kind === 'row' ? at * spec.size + step : step * spec.size + at))
    for (const cell of cells) {
      expect(puzzle.givens[cell], `level ${level} hint cell ${cell} locked`).not.toBe(UNKNOWN)
      expect(puzzle.givens[cell], `level ${level} hint cell ${cell} correct`).toBe(puzzle.solution[cell])
    }
  }

  it('grows sixty uniquely solvable beds with solution-consistent givens', { timeout: 480_000 }, () => {
    for (let level = 1; level <= GARDEN_LEVEL_COUNT; level += 1) {
      const spec = getGardenLevel(level)
      const puzzle = createGardenPuzzle(level)
      expect(puzzle.size, `level ${level}`).toBe(spec.size)
      expect(puzzle.givens, `level ${level}`).toHaveLength(spec.size * spec.size)
      puzzle.givens.forEach((value, index) => {
        if (value !== UNKNOWN) expect(value, `level ${level} cell ${index}`).toBe(puzzle.solution[index])
      })
      expectHintLine(level, puzzle)
      expect(puzzle.holes, `level ${level}`).toBeGreaterThanOrEqual(Math.max(4, Math.floor(spec.holes * 0.75)) - (spec.hintLine ? spec.size : 0))
      expect(puzzle.holes, `level ${level}`).toBeLessThanOrEqual(spec.holes)
      expect(puzzle.holes, `level ${level}`).toBeGreaterThanOrEqual((spec.size === 8 ? 40 : spec.size === 6 ? 20 : 8) - (spec.hintLine ? spec.size : 0))
      expect(countSolutions(puzzle.givens, puzzle.size, 2), `level ${level}`).toBe(1)
    }
  }, 480000)

  it('keeps hint lines stable and row-or-col balanced across replays', () => {
    for (const level of [12, 23, 34, 45, 60]) {
      const first = createGardenPuzzle(level)
      const second = createGardenPuzzle(level)
      expect(first.hint).toEqual(second.hint)
      expect(first.givens).toEqual(second.givens)
      const { hint, size, solution } = first
      const line = Array.from({ length: size }, (_, step) => {
        const at = hint!.kind === 'row' ? hint!.at * size + step : step * size + hint!.at
        return solution[at]
      })
      expect(line.filter((value) => value === 1), `level ${level} hint ones`).toHaveLength(size / 2)
    }
  })

  it('keeps every full grid inside the binary invariants', { timeout: 480_000 }, () => {
    for (const level of [1, 13, 25, 37, 50, 60]) {
      const { solution, size } = createGardenPuzzle(level)
      const half = size / 2
      const rows = Array.from({ length: size }, (_, at) => solution.slice(at * size, at * size + size))
      const cols = Array.from({ length: size }, (_, at) => solution.map((_, row) => solution[row * size + at]))
      for (const lines of [rows, cols]) {
        for (const line of lines) {
          expect(line.filter((value) => value === 1), `level ${level}`).toHaveLength(half)
          for (let at = 0; at + 2 < size; at += 1) {
            expect(line[at] === line[at + 1] && line[at + 1] === line[at + 2], `level ${level} triple`).toBe(false)
          }
        }
        for (let a = 0; a < size; a += 1) {
          for (let b = a + 1; b < size; b += 1) expect(lines[a], `level ${level}`).not.toEqual(lines[b])
        }
      }
    }
  }, 480000)

  it('replays the same bed for the same level every time', { timeout: 480_000 }, () => {
    for (const level of [1, 12, 23, 34, 45, 60]) {
      expect(createGardenPuzzle(level)).toEqual(createGardenPuzzle(level))
    }
  }, 480000)

  it('clamps hostile level inputs into a playable range', () => {
    expect(getGardenLevel(0)).toMatchObject({ level: 1, chapter: 1, size: 4, holes: 8, par: 40 })
    expect(getGardenLevel(-9)).toMatchObject({ level: 1 })
    expect(getGardenLevel(12.9)).toMatchObject({ level: 12, chapter: 2, size: 6 })
    expect(getGardenLevel(999)).toMatchObject({ level: 60, chapter: 5, size: 8, maxMistakes: 3, fog: true, title: '终章·雾尽花开' })
    expect(getGardenLevel(0)).toEqual(getGardenLevel(1))
    expect(getGardenLevel(999)).toEqual(getGardenLevel(60))
    expect(createGardenPuzzle(0)).toEqual(createGardenPuzzle(1))
    expect(createGardenPuzzle(-3).size).toBe(4)
  })
})
