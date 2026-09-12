import { mulberry32, seedFor } from '../../platform/rng'
import { digHoles, fillGrid, specFor, type Grid, type SudokuSpec } from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_LENGTH = 12
export const CHAPTER_COUNT = 5

export interface SudokuLevel {
  readonly level: number
  readonly chapter: number
  readonly spec: SudokuSpec
  readonly holes: number
  readonly par: number
  readonly notes: boolean
  readonly errorLimit?: number
  readonly strictTime: boolean
  readonly highlightAll: boolean
  readonly title: string
  readonly detail: string
}

const chapterCopy = [
  ['星图启蒙', '选中一格，同数字与所在行列宫一起点亮'],
  ['窄域观测', '同数高亮熄灭，只有所选行列宫仍在发光'],
  ['铅笔星轨', '解锁候选笔记，用铅笔在空格里推演数字'],
  ['失误边界', '累计失误 3 次直接失败，落子前多想一步'],
  ['极限星阵', '笔记、失误上限与双倍超时惩罚同时生效'],
] as const

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
  const chapter = Math.floor((safe - 1) / CHAPTER_LENGTH) + 1
  const variant = (safe - 1) % CHAPTER_LENGTH
  const size = chapter === 1 ? 4 : chapter === 2 ? 6 : 9
  const [title, detail] = chapterCopy[chapter - 1]
  return {
    level: safe,
    chapter,
    spec: specFor(size),
    holes: holeTarget(chapter, variant),
    par: parFor(chapter, size),
    notes: chapter >= 3,
    errorLimit: chapter >= 4 ? 3 : undefined,
    strictTime: chapter >= 5,
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
