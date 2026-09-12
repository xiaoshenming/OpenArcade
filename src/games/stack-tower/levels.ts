import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { ALL_KINDS, COLS, EMPTY, GARBAGE, ICE, ROWS, emptyGrid, type Cell, type Grid, type PieceKind, type TowerPlan } from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
export const CHAPTERS = CHAPTER_STARTS.length
const CHAPTER_SIZES = [11, 11, 11, 11, 16] as const
const DROP_SPANS: readonly (readonly [number, number])[] = [[840, 728], [700, 518], [500, 400], [390, 310], [300, 195]]
const CHAPTER_COPY: readonly (readonly [string, string])[] = [
  ['初垒·静水', '慢速下落，消除 6 行实心行即可通关'],
  ['加速·冰潮', '下落提速且目标升至 10 行：场地中部横亘冰层，先消其上一行将其解冻'],
  ['沉渣·垃圾行', '底部预置含洞垃圾行，含垃圾的消除不计入目标'],
  ['限定·残缺序列', '只轮换五种方块，垃圾行依旧堆积'],
  ['终局·重铸风暴', '垃圾、限序、高速叠加，每关一次重铸清除底行'],
]

export interface TowerLevel extends TowerPlan {
  level: number
  chapter: number
  variant: number
  goal: number
  dropMs: number
  garbageRows: number
  iceRow: number
  pieceSet: PieceKind[]
  budget: number
  reforges: number
  sequence: PieceKind[]
  grid: Grid
  title: string
  detail: string
}

function chapterOf(level: number): number {
  let chapter = 1
  for (let index = 0; index < CHAPTER_STARTS.length; index += 1) if (level >= CHAPTER_STARTS[index]) chapter = index + 1
  return chapter
}

function goalFor(chapter: number): number {
  return chapter === 1 ? 6 : 10
}

function garbageRowsFor(chapter: number, variant: number): number {
  if (chapter <= 2) return 0
  if (chapter === 3) return 2 + Math.floor(variant / 4)
  if (chapter === 4) return 3 + Math.floor(variant / 5)
  return 4 + Math.floor(variant / 6)
}

// Chapter 2 plants one frozen row that climbs toward the spawn as the variant rises.
function iceRowFor(chapter: number, variant: number): number {
  if (chapter !== 2) return -1
  return ROWS - 3 - Math.floor(variant / 4)
}

function dropMsFor(chapter: number, variant: number): number {
  const [from, to] = DROP_SPANS[chapter - 1]
  const fraction = variant / (CHAPTER_SIZES[chapter - 1] - 1)
  return Math.round(from + (to - from) * fraction)
}

function limitedSet(level: number): PieceKind[] {
  const picked = shuffle(mulberry32(seedFor(level, 5)), [...ALL_KINDS]).slice(0, 5)
  if (!picked.some((kind) => kind === 'I' || kind === 'O' || kind === 'T')) picked[picked.length - 1] = 'T'
  return picked
}

function buildSequence(set: readonly PieceKind[], count: number, random: () => number): PieceKind[] {
  const out: PieceKind[] = []
  while (out.length < count) out.push(...shuffle(random, [...set]))
  return out.slice(0, count)
}

function buildGrid(garbageRows: number, iceRow: number, level: number): Grid {
  const grid = emptyGrid()
  if (iceRow >= 0) grid[iceRow] = Array.from({ length: COLS }, () => ICE as Cell)
  const random = mulberry32(seedFor(level, 7))
  for (let offset = 0; offset < garbageRows; offset += 1) {
    const row = grid[ROWS - 1 - offset]
    for (let col = 0; col < COLS; col += 1) row[col] = GARBAGE as Cell
    carveHoles(row, random)
  }
  return grid
}

// Holes are carved as spans of 2-3 cells: every piece kind owns a placement at most
// two columns wide, so a span >= 2 wide can always be plugged regardless of the
// level's piece set and the garbage row stays drainable (structural reachability).
function carveHoles(row: Cell[], random: () => number) {
  const spans = 1 + Math.floor(random() * 2)
  const starts = shuffle(random, Array.from({ length: COLS - 1 }, (_, index) => index))
  let placed = 0
  for (const start of starts) {
    if (placed >= spans) break
    const width = random() < 0.45 ? 3 : 2
    if (start + width > COLS) continue
    if (row.slice(start, start + width).some((cell) => cell === EMPTY)) continue
    for (let col = start; col < start + width; col += 1) row[col] = EMPTY as Cell
    placed += 1
  }
  if (!placed) {
    row[0] = EMPTY as Cell
    row[1] = EMPTY as Cell
  }
}

export function validateLevel(spec: TowerLevel): string | null {
  if (spec.goal < 1 || spec.goal > 20) return 'goal out of range'
  if (spec.dropMs < 120 || spec.dropMs > 1200) return 'speed out of range'
  if (spec.sequence.length !== spec.budget || spec.budget < spec.goal * 3) return 'budget mismatch'
  if (spec.sequence.some((kind) => !spec.pieceSet.includes(kind))) return 'sequence leaves piece set'
  // Reachability floor: the I piece is the only 4-column span, so when the set offers
  // one the bag must supply enough of them to keep flattening rows within budget.
  if (spec.pieceSet.includes('I') && spec.sequence.filter((kind) => kind === 'I').length < Math.max(2, Math.ceil(spec.goal / 4))) return 'sequence lacks I pieces'
  const limited = spec.chapter >= 4
  if (limited && (spec.pieceSet.length !== 5 || !spec.pieceSet.some((kind) => kind === 'I' || kind === 'O' || kind === 'T'))) return 'limited set invalid'
  if (!limited && spec.pieceSet.length !== 7) return 'full set expected'
  if (spec.reforges !== (spec.chapter === 5 ? 1 : 0)) return 'reforge budget invalid'
  if (spec.garbageRows > ROWS - 4) return 'too much garbage'
  const iceRows = spec.grid.reduce<number[]>((rows, row, index) => {
    if (row.every((cell) => cell === ICE)) rows.push(index)
    return rows
  }, [])
  const hasIce = spec.grid.some((row) => row.some((cell) => cell === ICE))
  if (spec.chapter === 2) {
    if (iceRows.length !== 1) return 'chapter 2 needs exactly one full ice row'
    if (iceRows[0] < 4 || iceRows[0] > ROWS - 3) return 'ice row out of position'
  } else if (hasIce) {
    return 'ice rows only belong to chapter 2'
  }
  for (let row = 0; row < ROWS - spec.garbageRows; row += 1) {
    if (spec.chapter === 2 && row === iceRows[0]) continue
    if (spec.grid[row].some((cell) => cell !== 0)) return 'playable rows must start empty'
  }
  for (let row = ROWS - spec.garbageRows; row < ROWS; row += 1) {
    const holes = spec.grid[row].filter((cell) => cell === 0).length
    if (holes < 2 || holes > 6) return 'garbage holes out of range'
    let span = 0
    for (let col = 0; col <= COLS; col += 1) {
      if (col < COLS && spec.grid[row][col] === 0) {
        span += 1
        continue
      }
      if (span === 1) return 'garbage hole too narrow'
      span = 0
    }
  }
  return null
}

const cache = new Map<number, TowerLevel>()

export function getTowerLevel(level: number): TowerLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const chapter = chapterOf(safe)
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  const goal = goalFor(chapter)
  const garbageRows = garbageRowsFor(chapter, variant)
  const iceRow = iceRowFor(chapter, variant)
  const pieceSet = chapter >= 4 ? limitedSet(safe) : [...ALL_KINDS]
  const budget = goal * 5 + garbageRows * 5 + 12
  const sequence = buildSequence(pieceSet, budget, mulberry32(seedFor(safe, 11)))
  const spec: TowerLevel = {
    level: safe,
    chapter,
    variant,
    goal,
    dropMs: dropMsFor(chapter, variant),
    garbageRows,
    iceRow,
    pieceSet,
    budget,
    reforges: chapter === 5 ? 1 : 0,
    tier: chapter,
    sequence,
    grid: buildGrid(garbageRows, iceRow, safe),
    title: safe === LEVEL_COUNT ? '终局·重铸风暴' : CHAPTER_COPY[chapter - 1][0],
    detail: CHAPTER_COPY[chapter - 1][1],
  }
  cache.set(safe, spec)
  return spec
}
