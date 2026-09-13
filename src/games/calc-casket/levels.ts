import { mulberry32, seedFor } from '../../platform/rng'
import { clueFor, countCasketSolutions, fillLatin, partitionGrid, type Cage, type CageOp } from './logic'

export const LEVEL_COUNT = 60
const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
const PAR_BASES = [100, 240, 420, 500, 560] as const

export type CasketMode = 'plus' | 'times' | 'divide' | 'budget' | 'core'

export interface CasketLevel {
  readonly level: number
  readonly chapter: number
  readonly size: number
  readonly ops: readonly CageOp[]
  readonly sizes: readonly number[]
  readonly errorLimit?: number
  readonly par: number
  readonly mode: CasketMode
  readonly title: string
  readonly detail: string
}

const chapterCurve = [
  { size: 4, ops: ['+', '−'], sizes: [2], mode: 'plus', title: '启匣·加减', detail: '4x4 迷匣：双格笼只考加减，行列数字不重复' },
  { size: 5, ops: ['+', '−', '×'], sizes: [2, 3], mode: 'times', title: '铜匣·乘积', detail: '5x5 铜匣：新增乘法笼，三格笼按累加或累乘出题' },
  { size: 6, ops: ['+', '−', '×', '÷'], sizes: [2, 3, 4], mode: 'divide', title: '银匣·除法', detail: '6x6 银匣：除法笼限定两格，商必为整数' },
  { size: 6, ops: ['+', '−', '×', '÷'], sizes: [2, 3, 4], mode: 'budget', title: '金匣·预算', detail: '6x6 金匣：失误上限 3 次，超限即判失败' },
  { size: 6, ops: ['+', '−', '×', '÷'], sizes: [3, 3, 3, 4], mode: 'core', title: '谜匣·合契', detail: '6x6 谜匣：三格笼占比提升，失误上限依旧生效' },
] as const

export function getCasketLevel(level: number): CasketLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = safe < 12 ? 1 : safe < 23 ? 2 : safe < 34 ? 3 : safe < 45 ? 4 : 5
  const curve = chapterCurve[chapter - 1]
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  return {
    level: safe,
    chapter,
    size: curve.size,
    ops: curve.ops,
    sizes: curve.sizes,
    errorLimit: chapter >= 4 ? 3 : undefined,
    par: PAR_BASES[chapter - 1] + variant * 6,
    mode: curve.mode,
    title: safe === LEVEL_COUNT ? '终局·迷匣归一' : curve.title,
    detail: curve.detail,
  }
}

export interface CasketPuzzle {
  readonly rule: CasketLevel
  readonly cages: readonly Cage[]
  readonly solution: readonly number[]
}

const ATTEMPTS = 96
const ROUNDS = 8

// 每轮整体换 salt 重生成（与 suguru-peak 同模式），绝不静默返回可能非唯一的候选；
// 全部轮次耗尽仍无唯一解时直接抛错，由测试锁定 60 关都不会走到这一步。
export function createCasketPuzzle(level: number): CasketPuzzle {
  const rule = getCasketLevel(level)
  for (let round = 0; round < ROUNDS; round += 1) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const rng = mulberry32(seedFor(rule.level, round * ATTEMPTS + attempt))
      const solution = fillLatin(rng, rule.size)
      const layout = partitionGrid(rng, rule.size, rule.sizes)
      if (!layout) continue
      const cages = layout.map((cells) => clueFor(rng, cells, cells.map((cell) => solution[cell]), rule.ops))
      if (countCasketSolutions(rule.size, cages, 2) === 1) return { rule, cages, solution }
    }
  }
  throw new Error(`calc-casket level ${rule.level} generation exhausted without a unique solution`)
}
