import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { BLACK, countSolutions, endsOfEdge, turnAt, validateLoop, WHITE } from './logic'

export const LEVEL_COUNT = 60

export type SlalomMode = 'lesson' | 'sprint' | 'fault' | 'veil' | 'grand'

export interface SlalomSpec {
  readonly level: number
  readonly chapter: number
  readonly mode: SlalomMode
  readonly cols: number
  readonly rows: number
  readonly loopLen: number
  readonly ratio: number
  readonly mistakeLimit?: number
  readonly par: number
  readonly title: string
  readonly detail: string
}

export interface SlalomPuzzle {
  readonly spec: SlalomSpec
  readonly clues: number[]
  readonly solution: number[]
}

const chapterStart = [1, 12, 23, 34, 45]
const chapterEnd = [11, 22, 33, 44, 60]
const chapterCurve = [
  { span: [6, 6], loop: [8, 12], ratio: [0.8, 0.72], mistakes: 0, mode: 'lesson', title: '初学滑径', detail: '白圈直行且至少一侧邻格转折，黑圈转折且两侧直行，画出唯一闭环' },
  { span: [8, 6], loop: [12, 16], ratio: [0.72, 0.6], mistakes: 0, mode: 'sprint', detail: '更长的回环在更宽的雪场展开，超时会计入扣分', title: '竞速回廊' },
  { span: [8, 8], loop: [16, 20], ratio: [0.6, 0.5], mistakes: 3, mode: 'fault', detail: '闭合出不合规则的环路会记一次失误并清空，累计 3 次判负', title: '失稳弯道' },
  { span: [10, 8], loop: [20, 24], ratio: [0.5, 0.42], mistakes: 0, mode: 'veil', detail: '圈示密布的宽幅雪场：闭环必须穿过每一枚圆圈，且逐枚满足直转弯规则', title: '雪幕长廊' },
  { span: [10, 10], loop: [24, 32], ratio: [0.42, 0.35], mistakes: 3, mode: 'grand', detail: '最大雪场、圈示密布与失误上限同时生效，穿过全部圆圈才能收环', title: '极限回环' },
] as const

export function chapterOf(level: number): number {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  return safe < 12 ? 1 : safe < 23 ? 2 : safe < 34 ? 3 : safe < 45 ? 4 : 5
}

export function getSlalomLevel(level: number): SlalomSpec {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const curve = chapterCurve[chapter - 1]
  const progress = (safe - chapterStart[chapter - 1]) / (chapterEnd[chapter - 1] - chapterStart[chapter - 1])
  const cols = curve.span[0]
  const rows = curve.span[1]
  const loopLen = curve.loop[0] + Math.round((curve.loop[1] - curve.loop[0]) * progress)
  const ratio = curve.ratio[0] + (curve.ratio[1] - curve.ratio[0]) * progress
  return {
    level: safe,
    chapter,
    mode: curve.mode,
    cols,
    rows,
    loopLen,
    ratio,
    mistakeLimit: curve.mistakes > 0 ? curve.mistakes : undefined,
    par: loopLen * 5 + cols + rows,
    title: safe === LEVEL_COUNT ? '终局·万象归环' : curve.title,
    detail: curve.detail,
  }
}

export function hasClosedLoop(edges: readonly number[], cols: number, rows: number): boolean {
  const parent = new Array<number>(cols * rows).fill(-1)
  const find = (cell: number): number => {
    while (parent[cell] >= 0) cell = parent[cell]
    return cell
  }
  for (const edge of edges) {
    const [a, b] = endsOfEdge(edge, cols, rows)
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return true
    if (parent[ra] > parent[rb]) { parent[rb] += parent[ra]; parent[ra] = rb } else { parent[ra] += parent[rb]; parent[rb] = ra }
  }
  return false
}

function eligibleOf(order: readonly number[]) {
  const turns = order.map((_, index) => turnAt(order, index))
  const whites: number[] = []
  const blacks: number[] = []
  for (let index = 0; index < order.length; index += 1) {
    const prev = (index + order.length - 1) % order.length
    const next = (index + 1) % order.length
    if (!turns[index] && (turns[prev] || turns[next])) whites.push(order[index])
    if (turns[index] && !turns[prev] && !turns[next]) blacks.push(order[index])
  }
  return { whites, blacks }
}

// axis-aligned rings whose sides are two or three steps: every ring cell legally carries a circle.
// Each listed (x, y, w, h) placement on the 6x6 rink is verified to host a unique full-clue board.
const ch1Rinks: Array<[number, number, number, number]> = [
  [1, 1, 4, 4], [0, 1, 4, 4], [2, 1, 4, 4], [1, 0, 4, 4], [1, 2, 4, 4],
  [0, 1, 3, 4], [1, 1, 3, 4], [2, 1, 3, 4], [3, 1, 3, 4],
  [1, 1, 4, 3], [2, 1, 4, 3], [0, 2, 4, 3], [1, 2, 4, 3], [2, 2, 4, 3],
  [0, 1, 5, 3], [1, 1, 5, 3], [0, 2, 5, 3], [1, 2, 5, 3],
]

function ringLoop(x: number, y: number, w: number, h: number, cols: number): number[] {
  const start = y * cols + x
  const path = [start]
  for (let i = 1; i < w; i += 1) path.push(start + i)
  for (let i = 1; i < h; i += 1) path.push(start + (w - 1) + i * cols)
  for (let i = 1; i < w; i += 1) path.push(start + (w - 1 - i) + (h - 1) * cols)
  for (let i = 1; i < h - 1; i += 1) path.push(start + (h - 1 - i) * cols)
  return path
}

// self-avoiding walk of straight runs, each two or three steps long, so every loop cell stays cluable
function runLoop(random: () => number, cols: number, rows: number, minLen: number, maxLen: number): number[] | null {
  const dirs = [1, -1, cols, -cols]
  const axisOf = (d: number) => (d === 1 || d === -1 ? 0 : 1)
  for (let outer = 0; outer < 200; outer += 1) {
    const start = Math.floor(random() * (cols * rows))
    const path = [start]
    const used = new Set([start])
    let budget = 6000
    const walk = (cell: number, lastDir: number, total: number): number[] | null => {
      for (const len of [2, 3]) {
        for (const d of dirs) {
          if (axisOf(d) === axisOf(lastDir)) continue
          const mid = Array.from({ length: len - 1 }, (_, step) => cell + (step + 1) * d)
          if (mid.some((c) => used.has(c))) continue
          if (cell + len * d === start && total + len >= minLen && total + len <= maxLen) return [...path, ...mid]
        }
      }
      if (total + 2 > maxLen || budget <= 0) return null
      budget -= 1
      for (const d of shuffle(random, [...dirs])) {
        if (axisOf(d) === axisOf(lastDir)) continue
        const len = random() < 0.5 ? 2 : 3
        const step = Array.from({ length: len }, (_, off) => cell + (off + 1) * d)
        if (step.some((c) => c < 0 || c >= cols * rows || used.has(c))) continue
        if (axisOf(d) === 0 && Math.floor(step[len - 1] / cols) !== Math.floor(cell / cols)) continue
        step.forEach((c) => { used.add(c); path.push(c) })
        const found = walk(step[len - 1], d, total + len)
        if (found) return found
        step.forEach(() => { path.pop() })
        step.forEach((c) => { used.delete(c) })
      }
      return null
    }
    const first = shuffle(random, [...dirs])[0]
    const firstLen = random() < 0.5 ? 2 : 3
    const step = Array.from({ length: firstLen }, (_, off) => start + (off + 1) * first)
    if (step.some((c) => c < 0 || c >= cols * rows || used.has(c))) continue
    if (axisOf(first) === 0 && Math.floor(step[firstLen - 1] / cols) !== Math.floor(start / cols)) continue
    step.forEach((c) => { used.add(c); path.push(c) })
    const found = walk(step[firstLen - 1], first, firstLen)
    if (found) return found
  }
  return null
}

function reflect(order: number[], variant: number, cols: number, rows: number): number[] {
  return order.map((cell) => {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    const nextRow = variant >= 2 ? rows - 1 - row : row
    const nextCol = variant % 2 === 1 ? cols - 1 - col : col
    return nextRow * cols + nextCol
  })
}

function cluesFor(order: readonly number[], cols: number, rows: number): { clues: number[]; count: number } {
  const { whites, blacks } = eligibleOf(order)
  const board = new Array<number>(cols * rows).fill(0)
  whites.forEach((cell) => { board[cell] = WHITE })
  blacks.forEach((cell) => { board[cell] = BLACK })
  return { clues: board, count: whites.length + blacks.length }
}

const puzzleCache = new Map<number, SlalomPuzzle>()

export function createSlalomPuzzle(level: number): SlalomPuzzle {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const cached = puzzleCache.get(safe)
  if (cached) return cached
  const puzzle = buildSlalomPuzzle(safe)
  puzzleCache.set(safe, puzzle)
  return puzzle
}

// 逐枚削圈的唯一性验证预算（countSolutions 节点上限）：返回 1 才保留削圈；
// 多解(2)放回该圈；预算耗尽(-1)同样放回并累计，连续无法证明即停手——
// 保留更多圈 = 更强约束，唯一性更易维持（评审方案 1 的「失败则不削该圈」）。
const SOLVE_BUDGET = 60000
const MAX_SOLVE_ABORTS = 6

function buildSlalomPuzzle(level: number): SlalomPuzzle {
  const spec = getSlalomLevel(level)
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const random = mulberry32(seedFor(spec.level, attempt * 11 + 3))
    const fitting = ch1Rinks.filter(([, , w, h]) => 2 * (w + h) - 4 >= spec.loopLen)
    let solution = spec.chapter === 1 ? ringLoop(...fitting[(spec.level - 1 + attempt) % fitting.length], spec.cols) : runLoop(random, spec.cols, spec.rows, spec.loopLen, spec.loopLen + 6)
    if (!solution) continue
    if (spec.chapter !== 1) solution = reflect(solution, Math.floor(random() * 4), spec.cols, spec.rows)
    const { clues, count } = cluesFor(solution, spec.cols, spec.rows)
    if (count < 4 || !validateLoop(solution, clues, spec.cols, spec.rows)) continue
    // 全板预检：预算内检出「确定多解」就换一条回环重来，绝不让已知非唯一板面出厂；
    // 只有「证明唯一」或「预算内无法判定」才进入削圈。
    const fullVerdict = countSolutions(spec.cols, spec.rows, clues, 2, SOLVE_BUDGET)
    if (fullVerdict === 2) continue
    const keep = spec.chapter === 1 ? count - 2 - ((spec.level - 1) % 3) : Math.max(4, Math.round(count * spec.ratio))
    const ring = [...clues.keys()].filter((cell) => clues[cell] > 0)
    const shift = (spec.level * 5) % Math.max(1, ring.length)
    const ordered = [...ring.slice(shift), ...ring.slice(0, shift)]
    let kept = count
    let aborted = fullVerdict === -1 ? 4 : 0
    for (const cell of ordered) {
      if (kept <= keep || aborted >= MAX_SOLVE_ABORTS) break
      const color = clues[cell]
      clues[cell] = 0
      // 削圈逐枚举验证唯一性：唯一才削；多解或预算内无法证明就放回该圈，继续尝试下一枚。
      // 每次成功削圈都在更大约束的子板上证明了唯一，故返回的板面在预算内可证唯一。
      const verdict = countSolutions(spec.cols, spec.rows, clues, 2, SOLVE_BUDGET)
      if (verdict === 1) kept -= 1
      else {
        clues[cell] = color
        if (verdict === -1) aborted += 1
      }
    }
    return { spec, clues, solution }
  }
  const solution: number[] = []
  for (let col = 0; col < spec.cols; col += 1) solution.push(col)
  for (let row = 1; row < spec.rows; row += 1) solution.push(row * spec.cols + spec.cols - 1)
  for (let col = spec.cols - 2; col >= 0; col -= 1) solution.push((spec.rows - 1) * spec.cols + col)
  for (let row = spec.rows - 2; row >= 1; row -= 1) solution.push(row * spec.cols)
  const { clues } = cluesFor(solution, spec.cols, spec.rows)
  return { spec, clues, solution }
}
