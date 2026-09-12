import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { FILLED, generatePuzzle, type SilkPuzzle } from './logic'

export type SilkMode = 'weave' | 'shuttle' | 'thread' | 'tempo' | 'grand'

export interface SilkLevelSpec {
  level: number
  chapter: number
  size: number
  density: number
  par: number
  hints: number
  maxMistakes?: number
  lockedRows: number
  timeLimit?: number
  mode: SilkMode
  title: string
  detail: string
}

export const SILK_LEVEL_COUNT = 60
const SIZE_BY_CHAPTER = [0, 5, 6, 8, 10, 12] as const
const HINTS_BY_CHAPTER = [0, 0, 3, 1, 0, 0] as const
const PAR_BY_SIZE = { 5: 60, 6: 100, 8: 180, 10: 300, 12: 480 } as const
const MODE_BY_CHAPTER = ['weave', 'shuttle', 'thread', 'tempo', 'grand'] as const
const CHAPTER_COPY = [
  ['素机初织', '填格与打叉双模式，还原图案'],
  ['金梭引线', '金梭提示可揭示一个正确格'],
  ['经纬失误', '失误预算恒为 3，点错计入超限拆线'],
  ['金梭锁行', '预算仍为 3，每关有行被金梭预先织定为已知正确'],
  ['终局合织', '锁行、失误预算 3 与硬性超时同时生效'],
] as const

export function chapterOf(level: number): number {
  if (level <= 11) return 1
  if (level >= 45) return 5
  return Math.floor((level - 12) / 11) + 2
}

export function getSilkLevel(level: number): SilkLevelSpec {
  const safe = Math.min(SILK_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = chapterOf(safe)
  const size = SIZE_BY_CHAPTER[chapter]
  const par = PAR_BY_SIZE[size as keyof typeof PAR_BY_SIZE]
  const [title, detail] = CHAPTER_COPY[chapter - 1]
  const inChapter = safe - 34
  return {
    level: safe,
    chapter,
    size,
    density: Math.round((0.45 + ((safe - 1) / 59) * 0.15) * 100) / 100,
    par,
    hints: HINTS_BY_CHAPTER[chapter],
    maxMistakes: chapter >= 3 ? 3 : undefined,
    lockedRows: chapter === 4 ? (inChapter >= 6 ? 2 : 1) : chapter === 5 ? 2 : 0,
    timeLimit: chapter === 5 ? Math.round(par * 1.5) : undefined,
    mode: MODE_BY_CHAPTER[chapter - 1],
    title: safe === SILK_LEVEL_COUNT ? '终局·万丝归一' : title,
    detail: safe === SILK_LEVEL_COUNT ? '锁行、失误预算 3 与硬性超时全部生效，织出最后一幅锦缎' : detail,
  }
}

export function createSilkPuzzle(level: number): SilkPuzzle {
  const spec = getSilkLevel(level)
  return generatePuzzle(seedFor(spec.level, 11), spec.size, spec.density)
}

export function lockedRowsFor(level: number): number[] {
  const spec = getSilkLevel(level)
  if (!spec.lockedRows) return []
  const puzzle = createSilkPuzzle(level)
  const rng = mulberry32(seedFor(level, 29))
  const candidates = puzzle.rowClues
    .map((_, row) => row)
    .filter((row) => puzzle.pattern.slice(row * puzzle.size, row * puzzle.size + puzzle.size).some((cell) => cell === FILLED))
  return shuffle(rng, candidates).slice(0, spec.lockedRows).sort((a, b) => a - b)
}
