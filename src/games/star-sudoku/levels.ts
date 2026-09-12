import { mulberry32, seedFor } from '../../platform/rng'
import { digHoles, fillGrid, specFor, type Grid, type SudokuSpec } from './logic'

export const LEVEL_COUNT = 60
const CHAPTER_STARTS = [1, 9, 21, 33, 45] as const

export interface SudokuLevel {
  readonly level: number
  readonly chapter: number
  readonly spec: SudokuSpec
  readonly holes: number
  readonly par: number
  readonly notes: boolean
  readonly freeze: boolean
  readonly errorLimit?: number
  readonly strictTime: boolean
  readonly highlightAll: boolean
  readonly title: string
  readonly detail: string
}

const chapterCopy = [
  ['星图启蒙', '4x4 星图：选中一格，同数字与所在行列宫一起点亮'],
  ['霜锁星域', '6x6 星阵：填错格会被寒霜冻结 3 秒，想好再落子'],
  ['铅笔星轨', '解锁候选笔记，用铅笔在空格里推演数字'],
  ['失误边界', '累计失误 3 次直接失败，冻结与笔记同时生效'],
  ['极限星阵', '冻结、笔记、失误上限与双倍超时惩罚同时生效'],
] as const

export function chapterOf(level: number): number {
  let chapter = 1
  for (let index = 1; index < CHAPTER_STARTS.length; index += 1) if (level >= CHAPTER_STARTS[index]) chapter = index + 1
  return chapter
}

function holeTarget(chapter: number, variant: number) {
  if (chapter === 1) return 7 + Math.floor(variant / 4)
  if (chapter === 2) return 16 + Math.floor(variant / 3)
  if (chapter === 3) return 45 + Math.floor(variant / 4)
  if (chapter === 4) return 48 + Math.floor(variant / 3)
  return 52 + Math.floor(variant / 3)
}

function parFor(chapter: number, size: number) {
  if (size === 4) return 40
  if (size === 6) return 150
  return 510 - chapter * 30
}

export function getSudokuLevel(level: number): SudokuLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  const size = chapter === 1 ? 4 : chapter === 2 ? 6 : 9
  const [title, detail] = chapterCopy[chapter - 1]
  return {
    level: safe,
    chapter,
    spec: specFor(size),
    holes: holeTarget(chapter, variant),
    par: parFor(chapter, size),
    notes: chapter >= 3,
    freeze: chapter >= 2,
    errorLimit: chapter >= 4 ? 3 : undefined,
    strictTime: chapter === 5,
    highlightAll: chapter === 1,
    title,
    detail,
  }
}

export interface SudokuPuzzle {
  readonly givens: Grid
  readonly solution: Grid
}

export function createSudokuPuzzle(level: number): SudokuPuzzle {
  const rule = getSudokuLevel(level)
  const rng = mulberry32(seedFor(level, 7))
  const solution = fillGrid(rng, rule.spec)
  const givens = digHoles(rng, solution, rule.spec, rule.holes)
  return { givens, solution }
}
