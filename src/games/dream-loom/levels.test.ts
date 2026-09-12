import { describe, expect, it } from 'vitest'
import { applyOp, cancels, diffCount, gridsEqual, opTool } from './logic'
import { createLoomLevel, getLoomSpec } from './levels'

const ALL = Array.from({ length: 60 }, (_, index) => createLoomLevel(index + 1))

describe('dream loom level system', () => {
  it('generates sixty unique deterministic looms', () => {
    for (let level = 1; level <= 60; level += 1) {
      const first = createLoomLevel(level)
      const second = createLoomLevel(level)
      expect(first).toEqual(second)
      expect(gridsEqual(first.start, first.target)).toBe(false)
      expect(first.solution).toHaveLength(first.par)
      expect(first.quota).toBeGreaterThanOrEqual(first.par + 1)
      expect(first.target.flat().some(Boolean)).toBe(true)
      expect(first.target.flat().some((cell) => !cell)).toBe(true)
      expect(first.start).toHaveLength(getLoomSpec(level).size)
    }
    expect(new Set(ALL.map((entry) => entry.start.flat().join(''))).size).toBe(60)
  })

  it('replays every stored solution onto the target in exactly par steps', () => {
    for (const [index, entry] of ALL.entries()) {
      const spec = getLoomSpec(index + 1)
      let cloth = entry.start.map((line) => [...line])
      entry.solution.forEach((op, order) => {
        expect(spec.tools, `level ${index + 1} op ${order}`).toContain(opTool(op))
        cloth = applyOp(cloth, op)
      })
      expect(gridsEqual(cloth, entry.target), `level ${index + 1}`).toBe(true)
      const paints = entry.solution.filter((op) => op.kind === 'paint')
      expect(new Set(paints.map((op) => `${op.row}:${op.col}`)).size, `level ${index + 1} paints`).toBe(paints.length)
      for (let order = 1; order < entry.solution.length; order += 1) {
        expect(cancels(entry.solution[order], entry.solution[order - 1]), `level ${index + 1} cancel at ${order}`).toBe(false)
      }
    }
  })

  it('keeps paint-only chapters exactly par differences apart', () => {
    for (let level = 1; level <= 11; level += 1) {
      const entry = createLoomLevel(level)
      expect(entry.solution.every((op) => op.kind === 'paint'), `level ${level}`).toBe(true)
      expect(diffCount(entry.start, entry.target)).toBe(entry.par)
    }
    expect(createLoomLevel(12).solution.some((op) => op.kind !== 'paint')).toBe(true)
    const rotated = ALL.filter((_, index) => getLoomSpec(index + 1).chapter === 4)
    expect(rotated.some((entry) => entry.solution.some((op) => op.kind === 'rot'))).toBe(true)
    expect(ALL.filter((_, index) => getLoomSpec(index + 1).chapter <= 3).every((entry) => entry.solution.every((op) => op.kind !== 'rot'))).toBe(true)
  })

  it('grows grids and tightens quotas chapter over chapter', () => {
    expect([1, 12, 23, 34, 45].map((level) => getLoomSpec(level).size)).toEqual([4, 4, 5, 5, 6])
    expect(getLoomSpec(1).tools).toEqual(['paint'])
    expect(getLoomSpec(23).slack).toBeLessThan(getLoomSpec(12).slack)
    expect(getLoomSpec(45).slack).toBeLessThan(getLoomSpec(34).slack)
    const pars = (chapter: number) => ALL.filter((_, index) => getLoomSpec(index + 1).chapter === chapter).map((entry) => entry.par)
    expect(Math.min(...pars(2))).toBeGreaterThan(Math.min(...pars(1)))
    expect(Math.min(...pars(3))).toBeGreaterThan(Math.min(...pars(2)))
    expect(Math.min(...pars(4))).toBeGreaterThan(Math.min(...pars(3)))
    expect(Math.min(...pars(5))).toBeGreaterThan(Math.min(...pars(4)))
    expect(Math.max(...pars(5))).toBeGreaterThan(Math.max(...pars(1)))
  })

  it('clamps out-of-range levels deterministically', () => {
    expect(getLoomSpec(0).level).toBe(1)
    expect(getLoomSpec(999).level).toBe(60)
    expect(createLoomLevel(0)).toEqual(createLoomLevel(1))
    expect(createLoomLevel(-3)).toEqual(createLoomLevel(1))
    expect(createLoomLevel(999)).toEqual(createLoomLevel(60))
  })

  it('always leaves shift-able lines when the shift tool exists', () => {
    for (const [index, entry] of ALL.entries()) {
      const spec = getLoomSpec(index + 1)
      expect(entry.size).toBe(spec.size)
      if (!spec.tools.includes('shift')) continue
      let nonUniform = 0
      for (let line = 0; line < entry.size; line += 1) {
        if (entry.target[line].some((cell) => cell !== entry.target[line][0])) nonUniform += 1
        if (entry.target.some((row) => row[line] !== entry.target[0][line])) nonUniform += 1
      }
      expect(nonUniform, `level ${index + 1}`).toBeGreaterThanOrEqual(2)
    }
  })
})
