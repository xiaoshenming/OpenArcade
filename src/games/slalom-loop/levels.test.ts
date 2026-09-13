import { describe, expect, it } from 'vitest'
import { BLACK, countSolutions, loopEdges, loopOrder, validateLoop, WHITE } from './logic'
import { chapterOf, createSlalomPuzzle, getSlalomLevel, LEVEL_COUNT } from './levels'

describe('slalom loop levels', () => {
  it('constructs rule-valid loops for all sixty levels', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const puzzle = createSlalomPuzzle(level)
      const { spec, clues, solution } = puzzle
      expect(validateLoop(solution, clues, spec.cols, spec.rows)).toBe(true)
      expect(clues.filter((clue) => clue > 0).length).toBeGreaterThanOrEqual(2)
      expect(solution.length).toBeGreaterThanOrEqual(spec.loopLen)
      const order = loopOrder(loopEdges(solution, spec.cols, spec.rows), spec.cols, spec.rows)
      expect(order).not.toBeNull()
      expect(new Set(order as number[])).toEqual(new Set(solution))
    }
  }, 300000)

  it('keeps chapter-one rinks provably unique after clue thinning', () => {
    for (let level = 1; level <= 11; level += 1) {
      const puzzle = createSlalomPuzzle(level)
      expect(countSolutions(puzzle.spec.cols, puzzle.spec.rows, puzzle.clues, 2)).toBe(1)
    }
  }, 60000)

  // 返修锁定（P0）：评审用双求解器交叉验证发现 ch2-5 谜面非唯一（14/18/20 关各 ≥3 个合法环），
  // 且旧版把合法替代环判为失误。现在生成器逐枚削圈验证唯一性（失败不削该圈、全板检出多解即换环重试），
  // 游戏侧改为「合法环即胜」。断言策略：
  //  - ch1-2 小盘必须在 60k 节点预算内证明唯一（评审点名的 14/18/20 关在此范围内）；
  //  - 全部 60 关的求解结果只允许 1（已证唯一）或 -1（预算内无法判定）——绝不允许 2（已知多解出厂）或 0（矛盾盘）；
  //  - 对 -1 的关（多为 ch3-5 大盘）按评审回退断言：构造解合法，且游戏侧合法环判定保证公平。
  it('ships provably unique small boards and never a knowingly ambiguous one', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const puzzle = createSlalomPuzzle(level)
      const verdict = countSolutions(puzzle.spec.cols, puzzle.spec.rows, puzzle.clues, 2, 60000)
      expect(verdict === 1 || verdict === -1, `level ${level} verdict ${verdict}`).toBe(true)
      expect(validateLoop(puzzle.solution, puzzle.clues, puzzle.spec.cols, puzzle.spec.rows), `level ${level} constructed loop`).toBe(true)
      if (level <= 22) expect(verdict, `level ${level} provably unique`).toBe(1)
    }
  }, 600000)

  it('replays deterministically and keeps all sixty puzzles distinct', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      expect(createSlalomPuzzle(level)).toEqual(createSlalomPuzzle(level))
    }
    const signature = (level: number) => {
      const puzzle = createSlalomPuzzle(level)
      return `${puzzle.solution.join('.')}:${puzzle.clues.map((clue) => (clue === WHITE ? 'w' : clue === BLACK ? 'b' : '.')).join('')}`
    }
    const puzzles = new Set(Array.from({ length: LEVEL_COUNT }, (_, index) => signature(index + 1)))
    expect(puzzles.size).toBe(LEVEL_COUNT)
    const rinks = new Set(Array.from({ length: LEVEL_COUNT }, (_, index) => {
      const puzzle = createSlalomPuzzle(index + 1)
      return `${puzzle.spec.cols}x${puzzle.spec.rows}:${puzzle.solution.join('.')}`
    }))
    expect(rinks.size).toBeGreaterThanOrEqual(40)
  }, 120000)

  it('escalates rinks, loop length and sparsity across five chapters', () => {
    expect(getSlalomLevel(1)).toMatchObject({ chapter: 1, cols: 6, rows: 6, loopLen: 8, mistakeLimit: undefined })
    expect(getSlalomLevel(12)).toMatchObject({ chapter: 2, cols: 8, rows: 6, loopLen: 12 })
    expect(getSlalomLevel(23)).toMatchObject({ chapter: 3, cols: 8, rows: 8, mistakeLimit: 3 })
    expect(getSlalomLevel(34)).toMatchObject({ chapter: 4, cols: 10, rows: 8, mistakeLimit: undefined })
    expect(getSlalomLevel(45)).toMatchObject({ chapter: 5, cols: 10, rows: 10, mistakeLimit: 3 })
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const from = [1, 12, 23, 34, 45][chapter - 1]
      const to = [11, 22, 33, 44, 60][chapter - 1]
      for (let level = from; level <= to; level += 1) expect(getSlalomLevel(level).chapter).toBe(chapter)
    }
    const loops = Array.from({ length: LEVEL_COUNT }, (_, index) => getSlalomLevel(index + 1).loopLen)
    for (let index = 1; index < loops.length; index += 1) expect(loops[index]).toBeGreaterThanOrEqual(loops[index - 1])
    const ratios = Array.from({ length: LEVEL_COUNT }, (_, index) => getSlalomLevel(index + 1).ratio)
    for (let index = 1; index < ratios.length; index += 1) expect(ratios[index]).toBeLessThanOrEqual(ratios[index - 1] + 1e-9)
    const density = (level: number) => {
      const puzzle = createSlalomPuzzle(level)
      return puzzle.clues.filter((clue) => clue > 0).length / puzzle.solution.length
    }
    // 唯一性优先的削圈策略「验证失败即不削」，圈示保持高密度：任何关卡不得低于 45%
    for (let level = 1; level <= LEVEL_COUNT; level += 1) expect(density(level), `level ${level}`).toBeGreaterThanOrEqual(0.45)
  })

  it('clamps boundary levels into the valid range', () => {
    expect(getSlalomLevel(0)).toEqual(getSlalomLevel(1))
    expect(getSlalomLevel(999)).toEqual(getSlalomLevel(LEVEL_COUNT))
    expect(getSlalomLevel(Number.NaN)).toEqual(getSlalomLevel(1))
    expect(createSlalomPuzzle(0)).toEqual(createSlalomPuzzle(1))
    expect(createSlalomPuzzle(-4)).toEqual(createSlalomPuzzle(1))
    expect(createSlalomPuzzle(999)).toEqual(createSlalomPuzzle(LEVEL_COUNT))
    expect(chapterOf(0)).toBe(1)
    expect(chapterOf(60)).toBe(5)
  })
})
