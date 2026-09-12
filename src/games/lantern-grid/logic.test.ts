import { describe, expect, it } from 'vitest'
import { crossOf, failedScore, isBudgetSpent, isDark, litCount, SCORE_CAP, scoreFor, toggleAt } from './logic'
import { createLanternPuzzle, getLanternLevel, LANTERN_LEVEL_COUNT } from './levels'

// 解冲突锁关卡（锁定章偶数关）的冲突锁数量：把 min(2, locks-1) 个按钮换成两步邻居组合
const conflictCountOf = (level: number) => {
  const spec = getLanternLevel(level)
  return spec.locks > 0 && level % 2 === 0 ? Math.min(2, spec.locks - 1) : 0
}

describe('lantern grid generator', () => {
  it('constructs a solvable puzzle with exact par for every level', () => {
    for (let level = 1; level <= LANTERN_LEVEL_COUNT; level += 1) {
      const puzzle = createLanternPuzzle(level)
      const { spec, lights, solution, locks, prelit, par, sealedPath } = puzzle
      expect(par).toBe(spec.presses - spec.prelit + conflictCountOf(level))
      expect(solution).toHaveLength(par)
      expect(new Set(solution).size).toBe(par)
      expect(litCount(lights)).toBeGreaterThan(0)
      const replayed = solution.reduce((state, cell) => toggleAt(state, cell, spec.cols), lights)
      expect(isDark(replayed)).toBe(true)
      const lockSet = new Set(locks)
      solution.forEach((cell) => expect(lockSet.has(cell)).toBe(false))
      sealedPath.forEach((cell) => expect(cell).toBeGreaterThanOrEqual(0))
      prelit.forEach((cell) => {
        expect(lights[cell]).toBe(true)
        expect(solution).not.toContain(cell)
        expect(lockSet.has(cell)).toBe(false)
      })
    }
  })

  it('seals natural button paths with conflict locks and keeps every lock face-to-face with the solution', () => {
    const conflictLevels = [34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60]
    for (let level = 34; level <= LANTERN_LEVEL_COUNT; level += 1) {
      const puzzle = createLanternPuzzle(level)
      const { spec, solution, locks, sealedPath, par } = puzzle
      // 每关至少一个锁定格与解按钮曼哈顿距离 ≤1（正交邻居），形成贴脸干扰
      const touching = locks.filter((lock) => solution.some((cell) => crossOf(lock, spec.cols, spec.rows).includes(cell)))
      expect(touching.length).toBeGreaterThanOrEqual(1)
      const conflictCount = conflictCountOf(level)
      if (conflictCount > 0) {
        // 冲突锁取自朴素按钮集：封死自然路径，绕行解每锁多付两步邻居组合
        expect(conflictLevels).toContain(level)
        expect(par).toBe(spec.presses + conflictCount)
        expect(par).toBeLessThanOrEqual(spec.budget ?? par)
        expect(sealedPath).toHaveLength(spec.presses)
        expect(locks.filter((lock) => sealedPath.includes(lock))).toHaveLength(conflictCount)
        sealedPath.slice(0, conflictCount).forEach((cell) => expect(locks).toContain(cell))
      } else {
        expect(sealedPath).toEqual(solution)
        expect(par).toBe(spec.presses)
      }
    }
    expect(createLanternPuzzle(35).sealedPath).toEqual(createLanternPuzzle(35).solution)
    expect(createLanternPuzzle(36).sealedPath).not.toEqual(createLanternPuzzle(36).solution)
  })

  it('seeds chapter two with pre-lit sealed cells outside the remaining solution', () => {
    expect(getLanternLevel(1).prelit).toBe(0)
    expect(getLanternLevel(12).prelit).toBe(2)
    expect(getLanternLevel(22).prelit).toBe(3)
    expect(getLanternLevel(23).prelit).toBe(0)
    expect(getLanternLevel(60).prelit).toBe(0)
    for (let level = 12; level <= 22; level += 1) {
      const puzzle = createLanternPuzzle(level)
      expect(puzzle.prelit).toHaveLength(puzzle.spec.prelit)
      expect(puzzle.par).toBe(puzzle.spec.presses - puzzle.spec.prelit)
      for (const cell of puzzle.prelit) {
        expect(puzzle.lights[cell]).toBe(true)
        expect(puzzle.solution).not.toContain(cell)
        expect(puzzle.locks).not.toContain(cell)
      }
      const replayed = puzzle.solution.reduce((state, cell) => toggleAt(state, cell, puzzle.spec.cols), puzzle.lights)
      expect(isDark(replayed)).toBe(true)
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
    expect(getLanternLevel(1)).toMatchObject({ chapter: 1, rows: 4, cols: 4, presses: 6, locks: 0, prelit: 0 })
    expect(getLanternLevel(12)).toMatchObject({ chapter: 2, rows: 5, presses: 9, prelit: 2, locks: 0 })
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
    expect(scoreFor(10, 10)).toBe(1050)
    expect(scoreFor(15, 10)).toBe(900)
    expect(scoreFor(60, 10)).toBe(100)
    expect(scoreFor(0, 20)).toBe(1300)
    expect(scoreFor(8, 10, 13)).toBe(1075)
    expect(scoreFor(10, 10, 13)).toBe(1045)
    expect(scoreFor(15, 10, 13)).toBe(900)
    expect(failedScore(10, 10)).toBe(800)
    expect(failedScore(60, 10)).toBe(0)
    expect(failedScore(15, 10, 13)).toBe(650)
    expect(isBudgetSpent(19, 20)).toBe(false)
    expect(isBudgetSpent(20, 20)).toBe(true)
    expect(isBudgetSpent(30, undefined)).toBe(false)
    expect(scoreFor(0, 10, 400)).toBe(SCORE_CAP)
    for (let level = 1; level <= LANTERN_LEVEL_COUNT; level += 1) {
      const spec = getLanternLevel(level)
      expect(scoreFor(0, spec.presses, spec.budget)).toBeLessThanOrEqual(SCORE_CAP)
      expect(scoreFor(spec.budget ?? spec.presses + 60, spec.presses, spec.budget)).toBeGreaterThanOrEqual(100)
    }
  })
})
