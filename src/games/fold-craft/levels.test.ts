import { describe, expect, it } from 'vitest'
import { FOLD_LEVELS, getFoldLevel } from './levels'
import { foldPaper, twinPosition, unfoldHoles, unfoldMirrorPunch } from './logic'

describe('fold-craft level book', () => {
  it('generates sixty deterministic, self-consistent punch puzzles', () => {
    for (let level = 1; level <= FOLD_LEVELS; level += 1) {
      const spec = getFoldLevel(level)
      expect(spec).toEqual(getFoldLevel(level))
      const folded = foldPaper(spec.rows, spec.cols, spec.folds)
      expect(folded, `level ${level}`).not.toBeNull()
      if (!folded) continue
      expect(folded.rows).toBe(spec.folded.rows)
      expect(folded.cols).toBe(spec.folded.cols)
      expect(new Set(spec.holes).size).toBe(spec.holes.length)
      for (const hole of spec.holes) expect(hole).toBeGreaterThanOrEqual(0)
      expect(spec.holes.every((hole) => hole < spec.folded.rows * spec.folded.cols)).toBe(true)
      const perHole = spec.mirror ? 2 : 1
      expect(spec.answer).toHaveLength(spec.holes.length * perHole * 2 ** spec.folds.length)
      if (spec.mirror) {
        const punched = new Set(spec.holes)
        spec.holes.forEach((hole) => punched.add(twinPosition(hole, folded.rows, folded.cols)))
        expect(punched.size).toBe(spec.holes.length * 2)
        expect(spec.answer).toEqual(unfoldHoles(folded, [...punched]))
      } else {
        expect(spec.answer).toEqual(unfoldHoles(folded, spec.holes))
      }
      expect(spec.frames).toHaveLength(spec.folds.length)
    }
  })

  it('scales five chapters from single folds to timed quadruple folds', () => {
    const specs = Array.from({ length: FOLD_LEVELS }, (_, index) => getFoldLevel(index + 1))
    expect(specs.slice(0, 11).every((spec) => spec.chapter === 1 && spec.folds.length === 1 && spec.holes.length === 1 && !spec.mirror && !spec.timed)).toBe(true)
    expect(specs.slice(11, 22).every((spec) => spec.chapter === 2 && spec.folds.length === 2 && spec.answer.length === 4)).toBe(true)
    expect(specs.slice(22, 33).every((spec) => spec.chapter === 3 && spec.rows === 8 && spec.folds.length === 3 && spec.answer.length >= 8)).toBe(true)
    expect(specs[24].holes.length).toBe(1)
    expect(specs[28].holes.length).toBe(2)
    expect(specs[32].holes.length).toBe(3)
    expect(specs.slice(33, 44).every((spec) => spec.chapter === 4 && spec.mirror && spec.holes.length >= 1 && !spec.timed)).toBe(true)
    expect(specs[40].holes.length).toBe(1)
    expect(specs[41].holes.length).toBe(2)
    expect(specs[43].holes.length).toBe(2)
    expect(specs[40].answer.length).toBe(16)
    expect(specs[41].answer.length).toBe(32)
    expect(specs.slice(44).every((spec) => spec.chapter === 5 && spec.folds.length === 4 && spec.timed && spec.detail.includes('限时'))).toBe(true)
    expect(specs.slice(0, 44).every((spec) => !spec.timed)).toBe(true)
    expect(specs[51].holes.length).toBe(1)
    expect(specs[52].holes.length).toBe(2)
    expect(specs[59].holes.length).toBe(2)
    const foldCounts = specs.map((spec) => spec.folds.length)
    expect(foldCounts).toEqual([...foldCounts].sort((a, b) => a - b))
  })

  it('twins every mirror punch so players must cover both landing sets', () => {
    for (let level = 34; level <= 44; level += 1) {
      const spec = getFoldLevel(level)
      const folded = foldPaper(spec.rows, spec.cols, spec.folds)
      expect(folded, `level ${level}`).not.toBeNull()
      if (!folded) continue
      const twins = spec.holes.map((hole) => twinPosition(hole, folded.rows, folded.cols))
      expect(twins.every((twin) => !spec.holes.includes(twin)), `level ${level}`).toBe(true)
      expect(spec.answer).toEqual(unfoldMirrorPunch(folded, spec.holes))
      expect(spec.answer).toHaveLength(spec.holes.length * 2 * 2 ** spec.folds.length)
    }
  })

  it('tightens time budgets within chapters and grows answers across them', () => {
    expect(getFoldLevel(1).par).toBeGreaterThan(getFoldLevel(11).par)
    expect(getFoldLevel(45).par).toBeGreaterThan(getFoldLevel(52).par)
    expect(getFoldLevel(53).par).toBeGreaterThan(getFoldLevel(60).par)
    expect(getFoldLevel(46).par).toBeGreaterThanOrEqual(getFoldLevel(47).par)
    expect([1, 12, 23, 34, 45].map((level) => getFoldLevel(level).chapter)).toEqual([1, 2, 3, 4, 5])
    expect([1, 12, 23, 34, 45].map((level) => getFoldLevel(level).answer.length)).toEqual([2, 4, 8, 16, 16])
  })

  it('clamps out-of-range levels to the book ends', () => {
    expect(getFoldLevel(0)).toEqual(getFoldLevel(1))
    expect(getFoldLevel(-3)).toEqual(getFoldLevel(1))
    expect(getFoldLevel(999)).toEqual(getFoldLevel(FOLD_LEVELS))
  })
})
