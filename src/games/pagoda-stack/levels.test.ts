import { describe, expect, it } from 'vitest'
import { createBoard } from './logic'
import { chapterOf, getPagodaLevel, PAGODA_LEVEL_COUNT } from './levels'

const allLevels = () => Array.from({ length: PAGODA_LEVEL_COUNT }, (_, index) => getPagodaLevel(index + 1))

describe('pagoda level system', () => {
  it('ships sixty deterministic levels in five fixed chapters', () => {
    const levels = allLevels()
    expect(levels).toHaveLength(60)
    for (let level = 1; level <= PAGODA_LEVEL_COUNT; level += 1) expect(getPagodaLevel(level)).toEqual(getPagodaLevel(level))
    expect(levels.map((spec) => spec.chapter)).toEqual([
      ...Array<number>(11).fill(1),
      ...Array<number>(11).fill(2),
      ...Array<number>(11).fill(3),
      ...Array<number>(11).fill(4),
      ...Array<number>(16).fill(5),
    ])
    expect(chapterOf(0)).toBe(1)
    expect(chapterOf(61)).toBe(5)
  })

  it('gives every chapter a distinct mechanic and combines rules in the finale', () => {
    const levels = allLevels()
    expect(new Set(levels.slice(0, 11).map((spec) => spec.mode))).toEqual(new Set(['classic']))
    expect(levels.slice(11, 22).every((spec) => spec.mode === 'rationed' && spec.budget !== undefined && spec.pegs === 3)).toBe(true)
    expect(levels.slice(22, 33).every((spec) => spec.mode === 'quad' && spec.pegs === 4)).toBe(true)
    expect(levels.slice(33, 44).every((spec) => spec.mode === 'sealed' && spec.lockedPeg === 1 && spec.unlockAfter !== undefined)).toBe(true)
    expect(levels.slice(44).every((spec) => spec.mode === 'rainbow' && spec.rainbow && spec.budget !== undefined && spec.pegs === 4)).toBe(true)
    expect(getPagodaLevel(60)).toMatchObject({ mode: 'rainbow', rainbow: true, budget: expect.any(Number) })
  })

  it('tightens the curve: discs and par never relax within a chapter', () => {
    const levels = allLevels()
    for (const [start, end] of [[1, 11], [12, 22], [23, 33], [34, 44], [45, 60]] as const) {
      const chapter = levels.slice(start - 1, end)
      for (let index = 1; index < chapter.length; index += 1) {
        expect(chapter[index].discs).toBeGreaterThanOrEqual(chapter[index - 1].discs)
        expect(chapter[index].par).toBeGreaterThanOrEqual(chapter[index - 1].par)
      }
      chapter.forEach((spec) => {
        if (spec.budget !== undefined) {
          expect(spec.budget).toBe(Math.ceil(spec.par * 1.25))
          expect(spec.budget).toBeGreaterThan(spec.par)
        }
      })
    }
    expect(levels[levels.length - 1].par).toBeGreaterThan(levels[0].par)
  })

  it('clamps malformed level numbers and hands out fresh boards', () => {
    expect(getPagodaLevel(0).level).toBe(1)
    expect(getPagodaLevel(999).level).toBe(60)
    expect(getPagodaLevel(7.9).level).toBe(7)
    expect(getPagodaLevel(Number.NaN).level).toBe(1)
    const board = createBoard(4, 6)
    board[0].pop()
    expect(createBoard(4, 6)[0]).toHaveLength(6)
    expect(createBoard(4, 6)[3]).toHaveLength(0)
  })
})
