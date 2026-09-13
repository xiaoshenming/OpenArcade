import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { buildStripPuzzle, buildTangramPuzzle } from './generate'
import { type TangramBlock, type TangramFamily, type TangramSpec } from './logic'

export const TANGRAM_LEVELS = 60

export interface TangramLevel extends TangramSpec {
  level: number
  chapter: number
  title: string
  detail: string
}

interface Plan {
  start: number
  rows: number
  cols: number
  blocks: (index: number) => number
  sizeMin: number
  sizeMax: number
  families: readonly TangramFamily[]
  rotate: boolean
  zigzag?: boolean
  slack?: (index: number) => number
  fixed?: (index: number) => number
}

const plans: Plan[] = [
  { start: 1, rows: 5, cols: 5, blocks: (index) => (index < 5 ? 3 : 4), sizeMin: 4, sizeMax: 10, families: ['I', 'L', 'O'], rotate: false },
  { start: 12, rows: 6, cols: 6, blocks: (index) => (index < 6 ? 4 : 5), sizeMin: 5, sizeMax: 12, families: ['I', 'L', 'O', 'T'], rotate: true },
  { start: 23, rows: 6, cols: 7, blocks: (index) => (index < 6 ? 5 : 6), sizeMin: 5, sizeMax: 10, families: ['I', 'L', 'O', 'T'], rotate: true, slack: (index) => Math.max(4, 7 - Math.floor(index / 2)) },
  { start: 34, rows: 6, cols: 7, blocks: (index) => (index < 6 ? 6 : 7), sizeMin: 5, sizeMax: 9, families: ['I', 'L', 'O', 'T'], rotate: true, fixed: (index) => (index < 6 ? 1 : 2) },
  { start: 45, rows: 6, cols: 8, blocks: (index) => (index < 8 ? 6 : 7), sizeMin: 6, sizeMax: 10, families: ['I', 'L', 'O', 'T', 'S', 'Z'], rotate: true, zigzag: true, slack: (index) => Math.max(3, 5 - Math.floor(index / 3)), fixed: (index) => (index < 8 ? 1 : 2) },
]

const chapterCopy = [
  ['初启拼台', '把彩块逐一嵌满剪影，本章色块不可旋转'],
  ['旋转场', '更大拼台解锁旋转，点击色块顺时针转 90°'],
  ['步数预算', '旋转与安放都计一步，预算耗尽即告失败'],
  ['定桩锁块', '部分色块已固定在正确位置，围绕补全余下拼台'],
  ['万象终章', '预算、固定块与 S/Z 折块同时登场，先谋后动'],
] as const

export function chapterOf(level: number) {
  return level <= 11 ? 1 : level <= 22 ? 2 : level <= 33 ? 3 : level <= 44 ? 4 : 5
}

export function getTangramLevel(level: number): TangramLevel {
  const safe = Math.min(TANGRAM_LEVELS, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  let planIndex = 0
  plans.forEach((plan, index) => {
    if (safe >= plan.start) planIndex = index
  })
  const plan = plans[planIndex]
  const index = safe - plan.start
  const count = plan.blocks(index)
  const seed = seedFor(safe, 48)
  const puzzle =
    buildTangramPuzzle({ rows: plan.rows, cols: plan.cols, count, families: plan.families, sizeMin: plan.sizeMin, sizeMax: plan.sizeMax, allowRotate: plan.rotate, zigzag: plan.zigzag, seed }) ??
    buildStripPuzzle(plan.rows, plan.cols, count)
  const picker = mulberry32(seedFor(safe, 91))
  const fixed = shuffle(picker, puzzle.pieces.map((_, id) => id))
    .slice(0, plan.fixed ? plan.fixed(index) : 0)
    .sort((a, b) => a - b)
  const par = count - fixed.length
  const slack = plan.slack
  const moveLimit = slack ? par + slack(index) : undefined
  const orientations = puzzle.pieces.map((piece) => piece.orientation)
  if (slack && moveLimit !== undefined) {
    let extra = puzzle.pieces.reduce((sum, _, id) => (fixed.includes(id) ? sum : sum + (puzzle.solOrientations[id] - orientations[id] + 4) % 4), 0)
    for (let id = 0; extra > slack(index) && id < puzzle.pieces.length; id += 1) {
      if (fixed.includes(id)) continue
      const cost = (puzzle.solOrientations[id] - orientations[id] + 4) % 4
      if (cost > 0) {
        orientations[id] = puzzle.solOrientations[id]
        extra -= cost
      }
    }
  }
  const blocks: TangramBlock[] = puzzle.pieces.map((piece, id) => ({ id, family: piece.family, size: piece.size, base: piece.base, orientation: orientations[id], color: piece.color }))
  const [title, base] = chapterCopy[planIndex]
  const extras = [fixed.length > 0 ? `固定 ${fixed.length} 块` : '', moveLimit ? `预算 ${moveLimit} 步` : ''].filter(Boolean).join(' · ')
  return {
    level: safe,
    rows: plan.rows,
    cols: plan.cols,
    chapter: planIndex + 1,
    blocks,
    fixed,
    solution: puzzle.anchors,
    solOrientations: puzzle.solOrientations,
    par,
    moveLimit,
    rotateLocked: !plan.rotate,
    title,
    detail: extras ? `${base} · ${extras}` : base,
  }
}
