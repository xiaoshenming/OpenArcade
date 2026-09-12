import { seedFor } from '../../platform/rng'
import { generatePuzzle, type SilkPuzzle } from './logic'

export type SilkMode = 'weave' | 'shuttle' | 'thread' | 'tempo' | 'grand'

export interface SilkLevelSpec {
  level: number
  chapter: number
  size: number
  density: number
  par: number
  hints: number
  maxMistakes?: number
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
  ['经纬失误', '失误预算生效，点错计入超限拆线'],
  ['疾纬催织', '预算收紧，par 计时开始催促'],
  ['终局合织', '失误预算与硬性超时同时生效'],
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
  return {
    level: safe,
    chapter,
    size,
    density: Math.round((0.45 + ((safe - 1) / 59) * 0.15) * 100) / 100,
    par,
    hints: HINTS_BY_CHAPTER[chapter],
    maxMistakes: chapter >= 3 ? chapter : undefined,
    timeLimit: chapter === 5 ? Math.round(par * 1.5) : undefined,
    mode: MODE_BY_CHAPTER[chapter - 1],
    title: safe === SILK_LEVEL_COUNT ? '终局·万丝归一' : title,
    detail: safe === SILK_LEVEL_COUNT ? '失误预算与硬性超时全部生效，织出最后一幅锦缎' : detail,
  }
}

export function createSilkPuzzle(level: number): SilkPuzzle {
  const spec = getSilkLevel(level)
  return generatePuzzle(seedFor(spec.level, 11), spec.size, spec.density)
}
