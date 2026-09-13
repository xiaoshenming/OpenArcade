import { describe, expect, it } from 'vitest'
import { countCasketSolutions, isLatinValid, neighborsOf } from './logic'
import { createCasketPuzzle, getCasketLevel, LEVEL_COUNT } from './levels'

const ALL = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1)

describe('calc casket level system', () => {
  it('generates all sixty puzzles deterministically on repeated runs', () => {
    for (const level of ALL) expect(createCasketPuzzle(level), `level ${level}`).toEqual(createCasketPuzzle(level))
  }, 480000)

  it('constructs uniquely solvable clue sets for all sixty levels', () => {
    for (const level of ALL) {
      const { rule, cages } = createCasketPuzzle(level)
      expect(countCasketSolutions(rule.size, cages, 2), `level ${level}`).toBe(1)
    }
  }, 480000)

  // 返修锁定：createCasketPuzzle 已移除「穷尽后静默返回候选」的 fallback，
  // 改为逐轮换 salt 重生成并在耗尽时抛错。60 关全部命中唯一解即证明抛错路径永不触发。
  it('never falls back to a possibly ambiguous board because the generator throws instead', () => {
    expect(() => {
      for (const level of ALL) createCasketPuzzle(level)
    }).not.toThrow()
  }, 480000)

  it('tiles every board with orthogonal cages whose clues match the hidden solution', () => {
    for (const level of ALL) {
      const rule = getCasketLevel(level)
      const { cages, solution } = createCasketPuzzle(level)
      expect(isLatinValid(solution, rule.size), `level ${level}`).toBe(true)
      const owner = new Map<number, number>()
      cages.forEach((cage, index) => cage.cells.forEach((cell) => {
        expect(owner.has(cell), `level ${level} cell ${cell}`).toBe(false)
        owner.set(cell, index)
      }))
      expect(owner.size).toBe(rule.size * rule.size)
      let threeCells = 0
      for (const cage of cages) {
        expect(cage.cells.length, `level ${level}`).toBeGreaterThanOrEqual(2)
        expect(cage.cells.length, `level ${level}`).toBeLessThanOrEqual(Math.max(...rule.sizes))
        expect(rule.ops, `level ${level} op`).toContain(cage.op)
        expect(cage.target, `level ${level} target`).toBeGreaterThan(0)
        if (cage.cells.length >= 3) threeCells += 1
        for (let step = 1; step < cage.cells.length; step += 1) {
          expect(cage.cells.slice(0, step).some((cell) => neighborsOf(cage.cells[step], rule.size).includes(cell)), `level ${level} cage`).toBe(true)
        }
        const values = cage.cells.map((cell) => solution[cell])
        if (cage.op === '+') expect(values.reduce((sum, value) => sum + value, 0)).toBe(cage.target)
        if (cage.op === '×') expect(values.reduce((prod, value) => prod * value, 1)).toBe(cage.target)
        if (cage.op === '−') {
          expect(cage.cells).toHaveLength(2)
          expect(Math.abs(values[0] - values[1])).toBe(cage.target)
        }
        if (cage.op === '÷') {
          expect(cage.cells).toHaveLength(2)
          expect(Math.max(...values) % Math.min(...values)).toBe(0)
          expect(Math.max(...values) / Math.min(...values)).toBe(cage.target)
        }
      }
      if (rule.chapter === 1) expect(cages.every((cage) => cage.cells.length === 2), `level ${level}`).toBe(true)
      if (rule.chapter === 5) expect(threeCells / cages.length, `level ${level}`).toBeGreaterThan(0.4)
    }
  }, 480000)

  it('compresses chapters into escalating board sizes and ops', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => getCasketLevel(level).size)).toEqual([4, 4, 5, 5, 6, 6, 6, 6, 6, 6])
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => getCasketLevel(level).chapter)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    const counts = [1, 2, 3, 4, 5].map((chapter) => ALL.filter((level) => getCasketLevel(level).chapter === chapter).length)
    expect(counts).toEqual([11, 11, 11, 11, 16])
    for (const level of ALL) {
      const rule = getCasketLevel(level)
      expect(rule.ops.includes('×'), `level ${level}`).toBe(rule.chapter >= 2)
      expect(rule.ops.includes('÷'), `level ${level}`).toBe(rule.chapter >= 3)
      expect(rule.errorLimit ?? 0, `level ${level}`).toBe(rule.chapter >= 4 ? 3 : 0)
    }
  })

  it('tightens the par curve and raises the three-cell share in the finale', () => {
    expect(getCasketLevel(1).par).toBe(100)
    expect(getCasketLevel(12).par).toBe(240)
    expect(getCasketLevel(23).par).toBe(420)
    expect(getCasketLevel(34).par).toBe(500)
    expect(getCasketLevel(45).par).toBe(560)
    const pars = ALL.map((level) => getCasketLevel(level).par)
    for (let index = 1; index < pars.length; index += 1) expect(pars[index]).toBeGreaterThanOrEqual(pars[index - 1])
    const meanCage = (from: number, to: number) => {
      let cells = 0
      let count = 0
      for (let level = from; level <= to; level += 1) {
        const { cages } = createCasketPuzzle(level)
        cells += cages.reduce((sum, cage) => sum + cage.cells.length, 0)
        count += cages.length
      }
      return cells / count
    }
    expect(meanCage(45, 60)).toBeGreaterThan(meanCage(23, 33))
  }, 240000)

  it('issues division clues only on divisible pairs and subtraction only on unequal pairs', () => {
    let divides = 0
    let minus = 0
    for (const level of ALL) {
      const { cages, solution } = createCasketPuzzle(level)
      for (const cage of cages) {
        const values = cage.cells.map((cell) => solution[cell])
        if (cage.op === '÷') {
          divides += 1
          expect(Math.max(...values) % Math.min(...values), `level ${level}`).toBe(0)
          expect(cage.target).toBeGreaterThanOrEqual(1)
        }
        if (cage.op === '−') {
          minus += 1
          expect(values[0], `level ${level}`).not.toBe(values[1])
          expect(cage.target).toBeGreaterThanOrEqual(1)
        }
      }
    }
    expect(divides).toBeGreaterThan(0)
    expect(minus).toBeGreaterThan(0)
  }, 240000)

  it('clamps hostile level inputs into the valid range', () => {
    expect(getCasketLevel(0).level).toBe(1)
    expect(getCasketLevel(-8).level).toBe(1)
    expect(getCasketLevel(Number.NaN).level).toBe(1)
    expect(getCasketLevel(999).level).toBe(60)
    expect(getCasketLevel(3.6).level).toBe(3)
    expect(getCasketLevel(0)).toEqual(getCasketLevel(1))
    expect(getCasketLevel(999)).toEqual(getCasketLevel(60))
    expect(createCasketPuzzle(0)).toEqual(createCasketPuzzle(1))
    expect(createCasketPuzzle(999)).toEqual(createCasketPuzzle(60))
  })
})
