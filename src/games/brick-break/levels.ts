import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { BRICK_COLS, type BrickCell, type LevelPlan } from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
export const CHAPTERS = CHAPTER_STARTS.length

export interface BreakLevel extends LevelPlan {
  variant: number
  rows: number
  pattern: number
  hardCount: number
  breakable: number
  metals: number
  title: string
  detail: string
}

const CHAPTER_COPY: readonly (readonly [string, string])[] = [
  ['筑基·砖阵', '固定砖阵教学，砖排逐关加厚'],
  ['坚壁·硬砖', '硬砖需两次击破，提前规划弹道'],
  ['馈赠·道具', '击碎砖块概率掉落宽板、慢球与多球'],
  ['潮汐·移阵', '整排砖块开始缓慢往复移动'],
  ['终局·合金风暴', '硬砖、金属砖、道具与移阵全部登场'],
]

const MAX_ROWS = 8

function rowsFor(chapter: number, variant: number): number {
  if (chapter === 1) return 3 + Math.floor(variant / 4)
  if (chapter === 2) return 4 + Math.floor(variant / 6)
  if (chapter === 3) return 4 + Math.floor(variant / 4)
  if (chapter === 4) return 5 + Math.floor(variant / 6)
  return 5 + Math.floor(variant / 4)
}

function keepCell(pattern: number, row: number, col: number, rows: number): boolean {
  if (pattern === 1) return (row + col) % 2 === 0
  if (pattern === 2) return row === 0 || row === rows - 1 || col < 3 || col > 6
  if (pattern === 3) return col % 4 !== 2
  return true
}

function hardRatioFor(chapter: number, variant: number): number {
  if (chapter === 1) return 0
  if (chapter === 2) return 0.14 + variant * 0.012
  if (chapter === 3) return 0.08
  if (chapter === 4) return 0.12 + variant * 0.008
  return 0.18 + variant * 0.01
}

function metalCountFor(chapter: number, variant: number): number {
  return chapter === 5 ? 2 + Math.floor(variant / 3) : 0
}

function dropChanceFor(chapter: number, variant: number): number {
  if (chapter === 1 || chapter === 2) return 0
  if (chapter === 3) return Math.min(0.34, 0.14 + variant * 0.014)
  if (chapter === 4) return Math.min(0.34, 0.16 + variant * 0.01)
  return Math.min(0.34, 0.2 + variant * 0.01)
}

function buildBricks(chapter: number, variant: number, rows: number, random: () => number): BrickCell[] {
  const pattern = chapter === 1 ? 0 : variant % 4
  const cells: BrickCell[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < BRICK_COLS; col += 1) {
      if (keepCell(pattern, row, col, rows)) cells.push({ row, col, kind: 'normal' })
    }
  }
  const metals = metalCountFor(chapter, variant)
  if (metals > 0) {
    const byRow = new Array(MAX_ROWS).fill(0) as number[]
    const byCol = new Array(BRICK_COLS).fill(0) as number[]
    let placed = 0
    for (const cell of shuffle(random, cells.filter((candidate) => candidate.kind === 'normal'))) {
      if (placed >= metals) break
      if (byRow[cell.row] >= 2 || byCol[cell.col] >= 1) continue
      cell.kind = 'metal'
      byRow[cell.row] += 1
      byCol[cell.col] += 1
      placed += 1
    }
  }
  const hardCount = Math.ceil(cells.filter((cell) => cell.kind === 'normal').length * hardRatioFor(chapter, variant))
  if (hardCount > 0) {
    const pool = shuffle(random, cells.filter((cell) => cell.kind === 'normal'))
    for (let index = 0; index < hardCount && index < pool.length; index += 1) pool[index].kind = 'hard'
  }
  return cells
}

export function validateLevel(spec: BreakLevel): string | null {
  const seen = new Set<string>()
  const metalByRow = new Array(MAX_ROWS).fill(0) as number[]
  const metalByCol = new Array(BRICK_COLS).fill(0) as number[]
  const breakableByRow = new Array(MAX_ROWS).fill(0) as number[]
  let breakable = 0
  for (const cell of spec.bricks) {
    if (cell.row < 0 || cell.row >= MAX_ROWS || cell.col < 0 || cell.col >= BRICK_COLS) return 'cell out of bounds'
    const key = `${cell.row}:${cell.col}`
    if (seen.has(key)) return 'duplicate cell'
    seen.add(key)
    if (cell.kind === 'metal') {
      metalByRow[cell.row] += 1
      metalByCol[cell.col] += 1
      if (metalByRow[cell.row] > 2) return 'metal floods a row'
      if (metalByCol[cell.col] > 1) return 'metal stacks a column'
    } else {
      breakableByRow[cell.row] += 1
      breakable += 1
    }
  }
  if (breakable < 12) return 'too few breakable bricks'
  for (const cell of spec.bricks) {
    if (breakableByRow[cell.row] < 3) return 'a row is nearly solid metal'
  }
  return null
}

const cache = new Map<number, BreakLevel>()

function chapterOf(level: number): number {
  let chapter = 1
  for (let index = 0; index < CHAPTER_STARTS.length; index += 1) if (level >= CHAPTER_STARTS[index]) chapter = index + 1
  return chapter
}

export function getBreakLevel(level: number): BreakLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const chapter = chapterOf(safe)
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  const rows = rowsFor(chapter, variant)
  const random = mulberry32(seedFor(safe, 5))
  const bricks = buildBricks(chapter, variant, rows, random)
  const driftCount = chapter === 4 ? (variant >= 6 ? 2 : 1) : chapter === 5 ? 2 : 0
  const driftRows = driftCount
    ? shuffle(random, Array.from({ length: rows }, (_, index) => index)).slice(0, driftCount).sort((a, b) => a - b)
    : []
  const driftAmplitude = driftCount ? 6 + Math.round(random() * 5) : 0
  const driftPeriod = driftCount ? Math.max(2.4, 3.6 - variant * 0.07) : 3
  const driftPhase = driftCount ? random() : 0
  const breakable = bricks.filter((cell) => cell.kind !== 'metal').length
  const spec: BreakLevel = {
    level: safe,
    chapter,
    variant,
    rows,
    pattern: chapter === 1 ? 0 : variant % 4,
    bricks,
    ballSpeed: 250 + chapter * 14 + variant * 3,
    dropChance: dropChanceFor(chapter, variant),
    driftRows,
    driftAmplitude,
    driftPeriod,
    driftPhase,
    breakable,
    hardCount: bricks.filter((cell) => cell.kind === 'hard').length,
    metals: bricks.filter((cell) => cell.kind === 'metal').length,
    par: Math.round(breakable * (2.4 - chapter * 0.14) + 12),
    title: safe === LEVEL_COUNT ? '终局·合金风暴' : CHAPTER_COPY[chapter - 1][0],
    detail: CHAPTER_COPY[chapter - 1][1],
  }
  cache.set(safe, spec)
  return spec
}
