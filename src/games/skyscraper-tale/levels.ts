import { mulberry32, pick, seedFor } from '../../platform/rng'
import { buildSkyPuzzle, SKY_SIDES, type ClueSide, type SkyPuzzle } from './logic'

export const SKY_LEVEL_COUNT = 60

export type SkyMode = 'foundation' | 'lanterns' | 'skyline' | 'fogbank' | 'summit'

export interface SkyLevelSpec {
  readonly level: number
  readonly chapter: number
  readonly size: number
  readonly removals: number
  readonly par: number
  readonly maxMistakes?: number
  readonly sideClear: boolean
  readonly timeLimit?: number
  readonly strict: boolean
  readonly mode: SkyMode
  readonly title: string
  readonly detail: string
}

const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
const SIZE_BY_CHAPTER = [0, 4, 5, 6, 6, 6] as const
const PAR_BY_CHAPTER = [0, 90, 200, 400, 500, 560] as const
const MODE_BY_CHAPTER = ['foundation', 'lanterns', 'skyline', 'fogbank', 'summit'] as const
const CHAPTER_COPY = [
  ['奠基广厦', '4x4 城区：四边视线 clue 齐全，用底部键盘填出 1 到 4 的拉丁方阵'],
  ['灯火五街', '5x5 城区：撤去约 15% 边缘线索，靠行列唯一性推进天际线'],
  ['六环天际', '6x6 城区：撤去约 25% 线索，行或列重复会立即标红'],
  ['雾锁单岸', '失误预算恒为 3，且一整侧边缘 clue 被浓雾撤空，超限即塌方'],
  ['云顶终局', '撤去 35% 以上线索，叠加失误预算 3 与硬性限时，超时惩罚翻倍'],
] as const

export function chapterOf(level: number): number {
  if (level <= 11) return 1
  if (level >= 45) return 5
  return Math.floor((level - 12) / 11) + 2
}

function removalsFor(chapter: number, variant: number): number {
  if (chapter === 1) return 0
  if (chapter === 2) return 3 + Math.floor(variant / 4)
  if (chapter === 3) return 6 + Math.floor(variant / 4)
  if (chapter === 4) return 9 + Math.floor(variant / 6)
  return 10 + Math.floor(variant / 4)
}

export function getSkyLevel(level: number): SkyLevelSpec {
  const safe = Math.min(SKY_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const [title, detail] = CHAPTER_COPY[chapter - 1]
  const finale = safe === SKY_LEVEL_COUNT
  return {
    level: safe,
    chapter,
    size: SIZE_BY_CHAPTER[chapter],
    removals: removalsFor(chapter, safe - CHAPTER_STARTS[chapter - 1]),
    par: PAR_BY_CHAPTER[chapter],
    maxMistakes: chapter >= 4 ? 3 : undefined,
    sideClear: chapter === 4,
    timeLimit: chapter === 5 ? 640 : undefined,
    strict: chapter === 5,
    mode: MODE_BY_CHAPTER[chapter - 1],
    title: finale ? '终章·云顶之上' : title,
    detail: finale ? '撤 clue、失误预算 3、硬性限时与双倍超时同时生效，登上云顶' : detail,
  }
}

export function createSkyPuzzle(level: number): SkyPuzzle {
  const spec = getSkyLevel(level)
  const clearSide: ClueSide | null = spec.sideClear ? pick(mulberry32(seedFor(spec.level, 31)), SKY_SIDES) : null
  return buildSkyPuzzle(seedFor(spec.level, 17), spec.size, spec.removals, clearSide)
}
