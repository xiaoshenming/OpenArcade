import { mulberry32, seedFor } from '../../platform/rng'
import { generateGarden, UNKNOWN, type GardenPuzzle, type LineKind } from './logic'

export const GARDEN_LEVEL_COUNT = 60

export type GardenMode = 'sprout' | 'bloom' | 'thicket' | 'thorn' | 'mist'

export interface GardenLevelSpec {
  readonly level: number
  readonly chapter: number
  readonly size: number
  readonly holes: number
  readonly par: number
  readonly maxMistakes?: number
  readonly fog: boolean
  readonly hintLine: boolean
  readonly mode: GardenMode
  readonly title: string
  readonly detail: string
}

const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
const SIZE_BY_CHAPTER = [0, 4, 6, 8, 8, 8] as const
const MODE_BY_CHAPTER = ['sprout', 'bloom', 'thicket', 'thorn', 'mist'] as const
const PAR_BY_SIZE = { 4: 40, 6: 120, 8: 300 } as const
const CHAPTER_COPY = [
  ['新芽方圃', '4x4 花圃：点击格子在空、0、1 之间轮换，冲突格立即标红'],
  ['繁花六畦', '6x6 花畦：开局亮出一条正确的提示线并锁定，每行每列 0 与 1 各占一半'],
  ['深林八阵', '8x8 花林：规模翻倍，提示线依旧开路，任意两行两列都不能完全相同'],
  ['荆棘预算', '失误预算恒为 3，制造冲突计入失误，超限花园枯萎'],
  ['迷雾终章', '迷雾遮蔽冲突红标，叠加失误预算 3，只靠推理与提示线修剪花园'],
] as const

export function chapterOf(level: number): number {
  if (level <= 11) return 1
  if (level >= 45) return 5
  return Math.floor((level - 12) / 11) + 2
}

function holesFor(chapter: number, variant: number): number {
  if (chapter === 1) return 8 + Math.floor(variant / 4)
  if (chapter === 2) return 20 + Math.floor(variant / 3)
  if (chapter === 3) return 40 + Math.floor(variant / 4)
  if (chapter === 4) return 46 + Math.floor(variant / 3)
  return 50 + Math.floor(variant / 3)
}

export function getGardenLevel(level: number): GardenLevelSpec {
  const safe = Math.min(GARDEN_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const size = SIZE_BY_CHAPTER[chapter]
  const [title, detail] = CHAPTER_COPY[chapter - 1]
  const finale = safe === GARDEN_LEVEL_COUNT
  return {
    level: safe,
    chapter,
    size,
    holes: holesFor(chapter, safe - CHAPTER_STARTS[chapter - 1]),
    par: PAR_BY_SIZE[size as keyof typeof PAR_BY_SIZE],
    maxMistakes: chapter >= 4 ? 3 : undefined,
    fog: chapter === 5,
    hintLine: chapter >= 2,
    mode: MODE_BY_CHAPTER[chapter - 1],
    title: finale ? '终章·雾尽花开' : title,
    detail: finale ? '迷雾、失误预算 3 与 8x8 花林同时生效，为花园点起最后一盏灯' : detail,
  }
}

/** 第二章起：开局预填一条正确的行或列作为提示线，锁定不可更改。 */
function withHintLine(puzzle: GardenPuzzle, level: number): GardenPuzzle {
  const rng = mulberry32(seedFor(level, 41))
  const kind: LineKind = rng() < 0.5 ? 'row' : 'col'
  const at = Math.floor(rng() * puzzle.size) % puzzle.size
  const givens = [...puzzle.givens]
  for (let step = 0; step < puzzle.size; step += 1) {
    const index = kind === 'row' ? at * puzzle.size + step : step * puzzle.size + at
    givens[index] = puzzle.solution[index]
  }
  const holes = givens.reduce((sum, value) => sum + (value === UNKNOWN ? 1 : 0), 0)
  return { ...puzzle, givens, holes, hint: { kind, at } }
}

export function createGardenPuzzle(level: number): GardenPuzzle {
  const spec = getGardenLevel(level)
  const puzzle = generateGarden(seedFor(spec.level, 13), spec.size, spec.holes)
  return spec.hintLine ? withHintLine(puzzle, spec.level) : puzzle
}
