import { describe, expect, it } from 'vitest'
import { crossOf, failedScore, isBudgetSpent, isDark, litCount, scoreFor, toggleAt } from './logic'
import { createLanternPuzzle, getLanternLevel, LANTERN_LEVEL_COUNT } from './levels'

describe('lantern grid generator', () => {
  it('constructs a solvable puzzle with exact par for every level', () => {
    for (let level = 1; level <= LANTERN_LEVEL_COUNT; level += 1) {
      const puzzle = createLanternPuzzle(level)
      const { spec, lights, solution, locks, par } = puzzle
      expect(par).toBe(spec.presses)
      expect(solution).toHaveLength(par)
      expect(new Set(solution).size).toBe(par)
      expect(litCount(lights)).toBeGreaterThan(0)
      const replayed = solution.reduce((state, cell) => toggleAt(state, cell, spec.cols), lights)
      expect(isDark(replayed)).toBe(true)
      const lockSet = new Set(locks)
      solution.forEach((cell) => expect(lockSet.has(cell)).toBe(false))
    }
  })

  it('generates deterministic and distinct boards for all sixty levels', () => {
    for (let level = 1; level <= LANTERN_LEVEL_COUNT; level += 1) {
      expect(createLanternPuzzle(level)).toEqual(createLanternPuzzle(level))
    }
    const signatures = new Set(Array.from({ length: LANTERN_LEVEL_COUNT }, (_, index) => {
      const puzzle = createLanternPuzzle(index + 1)
      return `${puzzle.spec.rows}x${puzzle.spec.cols}:${puzzle.lights.map((lit) => (lit ? 1 : 0)).join('')}`
    }))
    expect(signatures.size).toBe(LANTERN_LEVEL_COUNT)
  })

  it('toggles an involutive cross of five, four or three lamps', () => {
    expect(crossOf(12, 5, 5)).toEqual([12, 7, 17, 11, 13])
    expect(crossOf(0, 5, 5)).toEqual([0, 5, 1])
    expect(crossOf(2, 5, 5)).toHaveLength(4)
    const empty = Array.from({ length: 25 }, () => false)
    const once = toggleAt(empty, 12, 5)
    expect(litCount(once)).toBe(5)
    expect(toggleAt(once, 12, 5)).toEqual(empty)
    expect(litCount(toggleAt(empty, 0, 5))).toBe(3)
    expect(litCount(toggleAt(once, 13, 5))).toBe(6)
    expect(toggleAt(toggleAt(once, 13, 5), 13, 5)).toEqual(once)
  })

  it('escalates board size, press count and mechanics across five chapters', () => {
    expect(getLanternLevel(1)).toMatchObject({ chapter: 1, rows: 4, cols: 4, presses: 6, locks: 0 })
    expect(getLanternLevel(12)).toMatchObject({ chapter: 2, rows: 5, presses: 9 })
    expect(getLanternLevel(34)).toMatchObject({ chapter: 4, rows: 6, presses: 16 })
    expect(getLanternLevel(45)).toMatchObject({ chapter: 5, rows: 7, presses: 20 })
    expect(getLanternLevel(60)).toMatchObject({ chapter: 5, presses: 24, locks: 8 })
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const from = [1, 12, 23, 34, 45][chapter - 1]
      const to = [11, 22, 33, 44, 60][chapter - 1]
      const levels = Array.from({ length: to - from + 1 }, (_, offset) => getLanternLevel(from + offset))
      expect(levels.every((spec) => spec.chapter === chapter)).toBe(true)
    }
    const presses = Array.from({ length: LANTERN_LEVEL_COUNT }, (_, index) => getLanternLevel(index + 1).presses)
    for (let index = 1; index < presses.length; index += 1) expect(presses[index]).toBeGreaterThanOrEqual(presses[index - 1])
    expect(presses[0]).toBe(6)
    expect(presses[LANTERN_LEVEL_COUNT - 1]).toBe(24)
  })

  it('budgets only the budget chapters and keeps locks off the solution', () => {
    expect(getLanternLevel(1).budget).toBeUndefined()
    expect(getLanternLevel(22).budget).toBeUndefined()
    expect(getLanternLevel(34).budget).toBeUndefined()
    expect(getLanternLevel(23).budget).toBe(getLanternLevel(23).presses + 7)
    expect(getLanternLevel(33).budget).toBe(getLanternLevel(33).presses + 3)
    expect(getLanternLevel(45).budget).toBe(getLanternLevel(45).presses + 6)
    expect(getLanternLevel(1).locks).toBe(0)
    expect(getLanternLevel(33).locks).toBe(0)
    for (let level = 34; level <= LANTERN_LEVEL_COUNT; level += 1) {
      const puzzle = createLanternPuzzle(level)
      expect(puzzle.locks).toHaveLength(getLanternLevel(level).locks)
      expect(puzzle.locks.every((cell) => !puzzle.solution.includes(cell))).toBe(true)
      expect(puzzle.locks.every((cell) => cell >= 0 && cell < puzzle.spec.rows * puzzle.spec.cols)).toBe(true)
    }
    expect(getLanternLevel(44).locks).toBe(5)
    expect(getLanternLevel(60).locks).toBe(8)
  })

  it('clamps boundary levels and scores budget overspend with failure penalty', () => {
    expect(getLanternLevel(0)).toEqual(getLanternLevel(1))
    expect(getLanternLevel(999)).toEqual(getLanternLevel(LANTERN_LEVEL_COUNT))
    expect(createLanternPuzzle(0)).toEqual(createLanternPuzzle(1))
    expect(createLanternPuzzle(-3)).toEqual(createLanternPuzzle(1))
    expect(scoreFor(10, 10)).toBe(1000)
    expect(scoreFor(15, 10)).toBe(900)
    expect(scoreFor(60, 10)).toBe(100)
    expect(failedScore(10, 10)).toBe(750)
    expect(failedScore(60, 10)).toBe(0)
    expect(isBudgetSpent(19, 20)).toBe(false)
    expect(isBudgetSpent(20, 20)).toBe(true)
    expect(isBudgetSpent(30, undefined)).toBe(false)
  })
})
