import { describe, expect, it } from 'vitest'
import { cluesFor, countSolutions, SKY_SIDES, type SkyPuzzle } from './logic'
import { chapterOf, createSkyPuzzle, getSkyLevel, SKY_LEVEL_COUNT, type SkyLevelSpec } from './levels'

const allSpecs = (): SkyLevelSpec[] => Array.from({ length: SKY_LEVEL_COUNT }, (_, index) => getSkyLevel(index + 1))

/** 采样 12 关做全量生成验证：覆盖每章的开头、中段与结尾。 */
const SAMPLED_LEVELS = [1, 5, 11, 12, 22, 23, 33, 34, 44, 45, 52, 60] as const

const REMOVAL_FLOOR_BY_CHAPTER = [0, 0, 3, 6, 9, 10] as const
const SIZE_BY_CHAPTER = [0, 4, 5, 6, 6, 6] as const

function expectGeneratedCity(level: number, puzzle: SkyPuzzle) {
  const spec = getSkyLevel(level)
  expect(puzzle.size, `level ${level}`).toBe(spec.size)
  expect(puzzle.removed, `level ${level}`).toBeLessThanOrEqual(spec.removals)
  expect(countSolutions(puzzle.clues, spec.size, 2), `level ${level}`).toBe(1)
  const live = cluesFor(puzzle.solution, spec.size)
  for (const side of SKY_SIDES) {
    for (let at = 0; at < spec.size; at += 1) {
      if (puzzle.clues[side][at] > 0) {
        expect(puzzle.clues[side][at], `level ${level} ${side}${at}`).toBe(live[side][at])
      }
    }
  }
  if (spec.sideClear) {
    expect(puzzle.sideCleared, `level ${level}`).toBe(true)
    expect(SKY_SIDES.some((side) => puzzle.clues[side].every((clue) => clue === 0)), `level ${level}`).toBe(true)
  }
  const floor = REMOVAL_FLOOR_BY_CHAPTER[spec.chapter]
  expect(puzzle.removed, `level ${level}`).toBeGreaterThanOrEqual(floor)
}

describe('sky chapter ladder', () => {
  it('splits sixty levels into five chapters with growing cities', () => {
    const specs = allSpecs()
    expect([1, 2, 3, 4, 5].map((chapter) => specs.filter((spec) => spec.chapter === chapter).length)).toEqual([11, 11, 11, 11, 16])
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => chapterOf(level))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => getSkyLevel(level).size)).toEqual([4, 4, 5, 5, 6, 6, 6, 6, 6, 6])
    expect([1, 12, 23, 34, 45, 60].map((level) => getSkyLevel(level).mode)).toEqual(['foundation', 'lanterns', 'skyline', 'fogbank', 'summit', 'summit'])
    expect(getSkyLevel(60).title).toBe('终章·云顶之上')
  })

  it('introduces one mechanic per chapter and stacks them at the summit', () => {
    const specs = allSpecs()
    expect(specs.filter((spec) => spec.chapter <= 3).every((spec) => spec.maxMistakes === undefined && !spec.sideClear && spec.timeLimit === undefined && !spec.strict)).toBe(true)
    expect(specs.filter((spec) => spec.chapter === 4).every((spec) => spec.maxMistakes === 3 && spec.sideClear && spec.timeLimit === undefined && !spec.strict)).toBe(true)
    expect(specs.filter((spec) => spec.chapter === 5).every((spec) => spec.maxMistakes === 3 && !spec.sideClear && spec.timeLimit === 640 && spec.strict)).toBe(true)
    expect(getSkyLevel(60).detail).toContain('云顶')
  })

  it('never relaxes the difficulty curve between levels', () => {
    const specs = allSpecs()
    for (let at = 1; at < specs.length; at += 1) {
      expect(specs[at].size, `level ${at + 1}`).toBeGreaterThanOrEqual(specs[at - 1].size)
      expect(specs[at].removals, `level ${at + 1}`).toBeGreaterThanOrEqual(specs[at - 1].removals)
      expect(specs[at].maxMistakes ?? 0, `level ${at + 1}`).toBeGreaterThanOrEqual(specs[at - 1].maxMistakes ?? 0)
      expect(specs[at].par, `level ${at + 1}`).toBeGreaterThanOrEqual(specs[at - 1].par)
    }
    expect(specs.map((spec) => spec.par)).toEqual([...Array(11).fill(90), ...Array(11).fill(200), ...Array(11).fill(400), ...Array(11).fill(500), ...Array(16).fill(560)])
    expect(specs.filter((spec) => spec.chapter === 2).map((spec) => spec.removals)).toEqual([3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5])
    expect(specs.filter((spec) => spec.chapter === 4).map((spec) => spec.removals)).toEqual([9, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10])
    expect(specs.filter((spec) => spec.chapter === 5).every((spec) => spec.removals >= Math.round(spec.size * 4 * 0.35))).toBe(true)
  })
})

describe('sky puzzle catalog', () => {
  it('builds the twelve sampled cities fully inside the removal ladder', { timeout: 120_000 }, () => {
    for (const level of SAMPLED_LEVELS) {
      expectGeneratedCity(level, createSkyPuzzle(level))
    }
    const chapters = new Set(SAMPLED_LEVELS.map((level) => getSkyLevel(level).chapter))
    expect([...chapters]).toHaveLength(5)
  }, 120000)

  it('keeps the remaining forty-eight cities structurally sound without regenerating', () => {
    const sampled = new Set<number>(SAMPLED_LEVELS)
    const sampledByChapter = new Map<number, number>()
    for (const level of SAMPLED_LEVELS) {
      const chapter = getSkyLevel(level).chapter
      sampledByChapter.set(chapter, (sampledByChapter.get(chapter) ?? 0) + 1)
    }
    expect([...sampledByChapter.values()].every((count) => count >= 2)).toBe(true)
    let structural = 0
    for (let level = 1; level <= SKY_LEVEL_COUNT; level += 1) {
      const spec = getSkyLevel(level)
      expect(spec.level, `level ${level}`).toBe(level)
      if (sampled.has(level)) continue
      structural += 1
      expect(spec.size, `level ${level}`).toBe(SIZE_BY_CHAPTER[spec.chapter])
      expect(spec.removals, `level ${level}`).toBeGreaterThanOrEqual(REMOVAL_FLOOR_BY_CHAPTER[spec.chapter])
      expect(spec.sideClear, `level ${level}`).toBe(spec.chapter === 4)
      expect(spec.strict, `level ${level}`).toBe(spec.chapter === 5)
      expect(spec.maxMistakes !== undefined, `level ${level}`).toBe(spec.chapter >= 4)
      expect((spec.timeLimit ?? 0) > 0, `level ${level}`).toBe(spec.chapter === 5)
      expect(spec.mode, `level ${level}`).toBe(getSkyLevel([1, 12, 23, 34, 45][spec.chapter - 1]).mode)
    }
    expect(structural).toBe(SKY_LEVEL_COUNT - SAMPLED_LEVELS.length)
  })

  it('keeps every solution a proper Latin square', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) {
      const { solution, size } = createSkyPuzzle(level)
      const rows = Array.from({ length: size }, (_, at) => solution.slice(at * size, at * size + size))
      const cols = Array.from({ length: size }, (_, at) => Array.from({ length: size }, (_, row) => solution[row * size + at]))
      for (const lines of [rows, cols]) {
        for (const line of lines) {
          expect(line.every((value) => value >= 1 && value <= size), `level ${level}`).toBe(true)
          expect(new Set(line).size, `level ${level}`).toBe(size)
        }
      }
    }
  })

  it('replays the same city for the same level every time', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) {
      expect(createSkyPuzzle(level)).toEqual(createSkyPuzzle(level))
    }
  })

  it('clamps hostile level inputs into a playable range', () => {
    expect(getSkyLevel(0)).toMatchObject({ level: 1, chapter: 1, size: 4, removals: 0, par: 90 })
    expect(getSkyLevel(-9)).toMatchObject({ level: 1 })
    expect(getSkyLevel(12.9)).toMatchObject({ level: 12, chapter: 2, size: 5 })
    expect(getSkyLevel(999)).toMatchObject({ level: 60, chapter: 5, size: 6, removals: 13, maxMistakes: 3, timeLimit: 640, strict: true, title: '终章·云顶之上' })
    expect(getSkyLevel(0)).toEqual(getSkyLevel(1))
    expect(getSkyLevel(999)).toEqual(getSkyLevel(60))
    expect(createSkyPuzzle(0)).toEqual(createSkyPuzzle(1))
    expect(createSkyPuzzle(-3).size).toBe(4)
  })
})
