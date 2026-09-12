import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { buildVinePuzzle, type VinePair } from './logic'

export const VINE_LEVELS = 60

export interface VineLevel {
  level: number
  rows: number
  cols: number
  chapter: number
  pairs: VinePair[]
  solution: number[][]
  fixed: number[]
  par: number
  moveLimit?: number
  title: string
  detail: string
}

interface Plan {
  start: number
  rows: number
  cols: number
  pairs: (index: number) => number
  slack?: (index: number) => number
  fixed?: (index: number) => number
}

const plans: Plan[] = [
  { start: 1, rows: 5, cols: 5, pairs: (index) => 3 + Math.floor(index / 4) },
  { start: 12, rows: 6, cols: 6, pairs: (index) => (index < 6 ? 4 : 5) },
  { start: 23, rows: 7, cols: 7, pairs: (index) => (index < 6 ? 5 : 6), slack: (index) => Math.max(4, 11 - index) },
  { start: 34, rows: 7, cols: 7, pairs: () => 6, fixed: (index) => 1 + Math.floor(index / 4) },
  { start: 45, rows: 8, cols: 8, pairs: (index) => (index < 8 ? 7 : 8), slack: (index) => Math.max(5, 14 - index), fixed: (index) => (index < 8 ? 1 : 2) },
]

const chapterCopy = [
  ['初萌花畦', '从同色嫩芽牵引藤蔓，铺满每一寸土地'],
  ['伸展藤区', '更大的花畦与更多藤蔓，路径仍不许相交'],
  ['精算步数', '步数预算收紧，绕远路会耗尽余量'],
  ['老藤盘固', '部分藤蔓已预先铺好且不可覆盖'],
  ['满园终章', '步数预算与固定老藤同时生效，先规划再落笔'],
] as const

export function getVineLevel(level: number): VineLevel {
  const safe = Math.min(VINE_LEVELS, Math.max(1, Math.floor(level) || 1))
  let planIndex = 0
  plans.forEach((plan, index) => {
    if (safe >= plan.start) planIndex = index
  })
  const plan = plans[planIndex]
  const index = safe - plan.start
  const seed = seedFor(safe, 11)
  const puzzle = buildVinePuzzle(plan.rows, plan.cols, plan.pairs(index), seed)
  const picker = mulberry32(seedFor(safe, 23))
  const order = shuffle(picker, puzzle.pairs.map((_, position) => position))
  const fixed = order.slice(0, plan.fixed ? plan.fixed(index) : 0).sort((a, b) => a - b)
  const par = puzzle.paths.reduce((sum, path, position) => sum + (fixed.includes(position) ? 0 : path.length), 0)
  const moveLimit = plan.slack ? par + plan.slack(index) : undefined
  const [title, base] = chapterCopy[planIndex]
  return {
    level: safe,
    rows: plan.rows,
    cols: plan.cols,
    chapter: planIndex + 1,
    pairs: puzzle.pairs,
    solution: puzzle.paths,
    fixed,
    par,
    moveLimit,
    title,
    detail: moveLimit ? `${base} · 预算 ${moveLimit} 步` : base,
  }
}

export function createVinePaths(spec: VineLevel): number[][] {
  return spec.pairs.map((_, index) => (spec.fixed.includes(index) ? [...spec.solution[index]] : []))
}
