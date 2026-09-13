import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { buildContext, countSolutions, digHoles, fillSolution, partitionGrid, type PeakContext, type PeakPuzzle } from './logic'

export const LEVEL_COUNT = 60
const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const

interface ChapterRule {
  readonly rows: number
  readonly cols: number
  readonly maxRegion: number
  readonly givenRatio: number
  readonly par: number
  readonly errorLimit?: number
  readonly hintKeep: number
  readonly title: string
  readonly detail: string
}

const CHAPTERS: readonly ChapterRule[] = [
  { rows: 6, cols: 6, maxRegion: 5, givenRatio: 0.52, par: 100, hintKeep: 0, title: '初登缓坡', detail: '6x6 山径：区域填 1 到区格数，相邻八格不同，预填充足' },
  { rows: 8, cols: 6, maxRegion: 7, givenRatio: 0.4, par: 220, hintKeep: 0, title: '雾锁岩壁', detail: '8x6 岩壁：区域最大 7 格，数字更宽，预填开始收紧' },
  { rows: 9, cols: 7, maxRegion: 7, givenRatio: 0.3, par: 400, hintKeep: 0, errorLimit: 3, title: '失足悬崖', detail: '9x7 悬崖：失误预算 3，超过即坠落，落子前多推一步' },
  { rows: 9, cols: 8, maxRegion: 7, givenRatio: 0.17, par: 500, hintKeep: 3, errorLimit: 3, title: '风口刃脊', detail: '9x8 刃脊：挖洞时保留 2-3 个预填提示格，预算仍为 3，全靠区域推理' },
  { rows: 10, cols: 8, maxRegion: 7, givenRatio: 0.15, par: 580, hintKeep: 1, errorLimit: 3, title: '绝顶连峰', detail: '10x8 绝顶：提示格收紧到 1 个，大棋盘、低预填与失误预算 3 组合发力' },
]

export interface PeakLevel {
  readonly level: number
  readonly chapter: number
  readonly rows: number
  readonly cols: number
  readonly maxRegion: number
  readonly holeTarget: number
  readonly par: number
  readonly errorLimit?: number
  readonly hintKeep: number
  readonly title: string
  readonly detail: string
}

export function chapterOf(level: number): number {
  let chapter = 1
  for (let index = 1; index < CHAPTER_STARTS.length; index += 1) if (level >= CHAPTER_STARTS[index]) chapter = index + 1
  return chapter
}

export function getPeakLevel(level: number): PeakLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const rule = CHAPTERS[chapter - 1]
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  const total = rule.rows * rule.cols
  const ratio = Math.max(0.08, rule.givenRatio - variant * 0.004)
  return {
    level: safe,
    chapter,
    rows: rule.rows,
    cols: rule.cols,
    maxRegion: rule.maxRegion,
    holeTarget: Math.min(total - 6, total - Math.round(total * ratio)),
    par: rule.par,
    errorLimit: rule.errorLimit,
    hintKeep: chapter === 4 ? 2 + (variant % 2) : chapter === 5 ? 1 : 0,
    title: rule.title,
    detail: rule.detail,
  }
}

/** 第四章起：从解中挑 hintKeep 个格子作为预填提示格，挖洞时保留不挖。 */
function hintCellsFor(rng: () => number, total: number, keep: number): number[] {
  if (keep <= 0) return []
  return shuffle(rng, Array.from({ length: total }, (_, cell) => cell)).slice(0, keep)
}

export function createPeakPuzzle(level: number): PeakPuzzle {
  const rule = getPeakLevel(level)
  const rng = mulberry32(seedFor(level, 13))
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const { regionOf, regionCells } = partitionGrid(rng, rule.rows, rule.cols, rule.maxRegion)
    const ctx: PeakContext = buildContext(rule.rows, rule.cols, regionOf, regionCells)
    const solution = fillSolution(rng, ctx)
    if (solution.some((value) => !value)) continue
    const givens = digHoles(rng, solution, ctx, rule.holeTarget, hintCellsFor(rng, rule.rows * rule.cols, rule.hintKeep))
    if (countSolutions(givens, ctx, 2) === 1) return { ctx, solution, givens }
  }
  throw new Error(`level ${rule.level} generation exhausted`)
}
