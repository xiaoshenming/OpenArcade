import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { bandPattern, buildRunContext, countSolutions, digHoles, fillRunGrid, pickClueless, randomPattern, writeClues, type RunContext, type RunPuzzle } from './logic'

export const RUN_LEVEL_COUNT = 60
const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const

interface ChapterRule {
  readonly rows: number
  readonly cols: number
  readonly maxRun: number
  readonly density: number
  readonly keep: number
  readonly par: number
  readonly clueless: number
  readonly minClueless?: number
  readonly errorLimit?: number
  readonly title: string
  readonly detail: string
}

const CHAPTERS: readonly ChapterRule[] = [
  { rows: 5, cols: 5, maxRun: 3, density: 0.3, keep: 0.45, par: 90, clueless: 0, title: '初探小径', detail: '5x5 小段迷径：每段填 1-9 不重复，段和等于端点 clue' },
  { rows: 7, cols: 7, maxRun: 4, density: 0.26, keep: 0.34, par: 200, clueless: 0, title: '回环长廊', detail: '7x7 长廊：段更长交叉更多，预填继续收紧' },
  { rows: 8, cols: 8, maxRun: 5, density: 0.24, keep: 0.28, par: 380, clueless: 0.05, minClueless: 1, errorLimit: 3, title: '断崖栈道', detail: '8x8 栈道：失误预算 3，并提前引入 1 段无 clue 暗段，先算和再落子' },
  { rows: 9, cols: 8, maxRun: 6, density: 0.22, keep: 0.22, par: 470, clueless: 0.25, errorLimit: 3, title: '无标荒径', detail: '9x8 荒径：部分段 clue 缺失，须靠交叉推导段和' },
  { rows: 9, cols: 9, maxRun: 6, density: 0.2, keep: 0.18, par: 540, clueless: 0.35, errorLimit: 3, title: '九宫合流', detail: '9x9 合流：预算 3、无 clue 段与大棋盘组合发力' },
]

export interface RunLevel {
  readonly level: number
  readonly chapter: number
  readonly rows: number
  readonly cols: number
  readonly maxRun: number
  readonly density: number
  readonly par: number
  readonly clueless: number
  readonly minClueless: number
  readonly keepFraction: number
  readonly errorLimit?: number
  readonly title: string
  readonly detail: string
}

export function chapterOf(level: number): number {
  let chapter = 1
  for (let index = 1; index < CHAPTER_STARTS.length; index += 1) if (level >= CHAPTER_STARTS[index]) chapter = index + 1
  return chapter
}

export function getRunLevel(level: number): RunLevel {
  const safe = Math.min(RUN_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const rule = CHAPTERS[chapter - 1]
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  return {
    level: safe,
    chapter,
    rows: rule.rows,
    cols: rule.cols,
    maxRun: rule.maxRun,
    density: rule.density,
    par: rule.par,
    clueless: rule.clueless,
    minClueless: rule.minClueless ?? 0,
    keepFraction: Math.max(0.08, rule.keep - variant * 0.004),
    errorLimit: rule.errorLimit,
    title: rule.title,
    detail: rule.detail,
  }
}

function repairPattern(random: () => number, rows: number, cols: number, maxRun: number, black: boolean[]): boolean[] {
  const lineOf = (dir: number, a: number, b: number) => (dir === 0 ? a * cols + b : b * cols + a)
  const scanRuns = (visit: (dir: number, a: number, start: number, end: number) => void) => {
    for (let dir = 0; dir < 2; dir += 1) {
      const outer = dir === 0 ? rows : cols
      const inner = dir === 0 ? cols : rows
      for (let a = 0; a < outer; a += 1) {
        let start = -1
        for (let b = 0; b <= inner; b += 1) {
          const on = b < inner && !black[lineOf(dir, a, b)]
          if (on && start < 0) start = b
          if (!on && start >= 0) { visit(dir, a, start, b); start = -1 }
        }
      }
    }
  }
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false
    scanRuns((dir, a, start, end) => {
      if (end - start <= maxRun) return
      const lo = Math.max(start + 1, end - 1 - maxRun)
      const hi = Math.min(end - 1, start + maxRun)
      black[lineOf(dir, a, hi >= lo ? lo + Math.floor(random() * (hi - lo + 1)) : start)] = true
      changed = true
    })
    if (!changed) break
  }
  for (let pass = 0; pass < 10; pass += 1) {
    const inRun = new Array<boolean>(rows * cols).fill(false)
    scanRuns((dir, a, start, end) => {
      if (end - start >= 2) for (let c = start; c < end; c += 1) inRun[lineOf(dir, a, c)] = true
    })
    const lonely: number[] = []
    inRun.forEach((flag, index) => { if (!flag && !black[index]) lonely.push(index) })
    if (!lonely.length) break
    lonely.forEach((index) => { black[index] = true })
  }
  return black
}

/** 抽出无 clue 暗段；第三章起保证至少 minClueless 段提前引入。 */
function cluelessIdsFor(rng: () => number, ctx: RunContext, rule: RunLevel): number[] {
  const ids = pickClueless(rng, ctx.runs.length, rule.clueless)
  if (ids.length >= rule.minClueless) return ids
  const rest = shuffle(rng, ctx.runs.map((run) => run.id).filter((id) => !ids.includes(id)))
  while (ids.length < rule.minClueless && rest.length) ids.push(rest.pop() as number)
  return ids
}

export function createRunPuzzle(level: number): RunPuzzle {
  const rule = getRunLevel(level)
  const rng = mulberry32(seedFor(level, 29))
  const assemble = (ctx: RunContext): RunPuzzle | null => {
    const solution = fillRunGrid(rng, ctx)
    if (solution.some((value, index) => !value && !ctx.black[index])) return null
    writeClues(ctx, solution, cluelessIdsFor(rng, ctx, rule))
    const target = ctx.whiteCount - Math.round(ctx.whiteCount * rule.keepFraction)
    const givens = digHoles(rng, solution, ctx, target)
    return countSolutions(givens, ctx, 2) === 1 ? { ctx, solution, givens } : null
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const density = Math.min(0.45, rule.density + (attempt % 4) * 0.04)
    const pattern = repairPattern(rng, rule.rows, rule.cols, rule.maxRun, randomPattern(rng, rule.rows * rule.cols, density))
    const ctx = buildRunContext(rule.rows, rule.cols, pattern, rule.maxRun)
    if (!ctx) continue
    const puzzle = assemble(ctx)
    if (puzzle) return puzzle
  }
  const fallback = buildRunContext(rule.rows, rule.cols, bandPattern(rule.rows, rule.cols, rule.maxRun), rule.maxRun)
  const puzzle = fallback ? assemble(fallback) : null
  if (!puzzle) throw new Error(`level ${rule.level} generation exhausted`)
  return puzzle
}
