import { mulberry32, seedFor } from '../../platform/rng'
import { applyOp, cancels, gridsEqual, opChanges, opInverse, paintOp, rotOp, type LoomLevel, type LoomOp, type LoomTool } from './logic'

export interface LoomSpec {
  readonly level: number
  readonly chapter: number
  readonly mode: string
  readonly size: number
  readonly tools: readonly LoomTool[]
  readonly weights: Record<LoomTool, number>
  readonly ops: number
  readonly slack: number
  readonly title: string
  readonly detail: string
}

interface ChapterConfig {
  readonly begin: number
  readonly size: number
  readonly grid: number
  readonly tools: readonly LoomTool[]
  readonly weights: Record<LoomTool, number>
  readonly base: number
  readonly span: number
  readonly slack: number
  readonly mode: string
  readonly title: string
  readonly detail: string
}

const CHAPTERS: readonly ChapterConfig[] = [
  { begin: 1, size: 11, grid: 4, tools: ['paint'], weights: { paint: 1, shift: 0, rotate: 0 }, base: 2, span: 4, slack: 2, mode: 'sketch', title: '初经纬线', detail: '用画笔逐格切换，把空白织布补成目标图案' },
  { begin: 12, size: 11, grid: 4, tools: ['paint', 'shift'], weights: { paint: 4, shift: 6, rotate: 0 }, base: 4, span: 5, slack: 2, mode: 'weave', title: '牵经引纬', detail: '整行整列循环移位，与画笔配合复制图案' },
  { begin: 23, size: 11, grid: 5, tools: ['paint', 'shift'], weights: { paint: 2, shift: 8, rotate: 0 }, base: 6, span: 6, slack: 1, mode: 'dense', title: '密纬收紧', detail: '更大的织布、更密的移位与更紧的工具配额' },
  { begin: 34, size: 11, grid: 5, tools: ['paint', 'shift', 'rotate'], weights: { paint: 3, shift: 6, rotate: 3 }, base: 7, span: 6, slack: 2, mode: 'spin', title: '回旋提花', detail: '2x2 区域可以旋转，先转后补更快' },
  { begin: 45, size: 16, grid: 6, tools: ['paint', 'shift', 'rotate'], weights: { paint: 2, shift: 6, rotate: 3 }, base: 9, span: 7, slack: 1, mode: 'gauntlet', title: '终局·万象织机', detail: '全工具与紧配额同时生效' },
]

export function getLoomSpec(level: number): LoomSpec {
  const safe = Math.min(60, Math.max(1, Math.floor(level)))
  const index = CHAPTERS.findIndex((chapter) => safe < chapter.begin + chapter.size)
  const config = CHAPTERS[index < 0 ? CHAPTERS.length - 1 : index]
  const progress = (safe - config.begin) / (config.size - 1)
  return {
    level: safe,
    chapter: CHAPTERS.indexOf(config) + 1,
    mode: config.mode,
    size: config.grid,
    tools: config.tools,
    weights: config.weights,
    ops: config.base + Math.round(progress * config.span),
    slack: config.slack,
    title: safe === 60 ? '终局·万象织机' : config.title,
    detail: config.detail,
  }
}

function uniformLines(grid: readonly (readonly number[])[]) {
  const size = grid.length
  let count = 0
  for (let index = 0; index < size; index += 1) {
    if (grid[index].every((cell) => cell === grid[index][0])) count += 1
    if (grid.every((line) => line[index] === grid[0][index])) count += 1
  }
  return count
}

function weaveTarget(spec: LoomSpec, random: () => number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const grid = Array.from({ length: spec.size }, () => Array.from({ length: spec.size }, () => (random() < 0.45 ? 1 : 0)))
    const ones = grid.flat().filter(Boolean).length
    if (ones < 2 || ones > spec.size * spec.size - 2) continue
    if (spec.tools.includes('shift') && uniformLines(grid) > spec.size * 2 - 2) continue
    return grid
  }
  return Array.from({ length: spec.size }, (_, row) => Array.from({ length: spec.size }, (_, col) => ((row + col) % 2)))
}

function randomOp(spec: LoomSpec, random: () => number): LoomOp {
  const total = spec.tools.reduce((sum, tool) => sum + spec.weights[tool], 0)
  let roll = random() * total
  let tool: LoomTool = spec.tools[spec.tools.length - 1]
  for (const candidate of spec.tools) {
    roll -= spec.weights[candidate]
    if (roll < 0) {
      tool = candidate
      break
    }
  }
  const size = spec.size
  if (tool === 'paint') return paintOp(Math.floor(random() * size), Math.floor(random() * size))
  if (tool === 'rotate') return rotOp(Math.floor(random() * (size - 1)), Math.floor(random() * (size - 1)), random() < 0.5 ? 1 : -1)
  const dir = random() < 0.5 ? 1 : -1
  if (random() < 0.5) return { kind: 'row', row: Math.floor(random() * size), col: 0, dir }
  return { kind: 'col', row: 0, col: Math.floor(random() * size), dir }
}

function pickOp(grid: readonly (readonly number[])[], spec: LoomSpec, painted: ReadonlySet<string>, random: () => number, last: LoomOp | null): LoomOp {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const op = randomOp(spec, random)
    if (op.kind === 'paint' && painted.has(`${op.row}:${op.col}`)) continue
    if (last && cancels(op, last)) continue
    if (!opChanges(grid, op)) continue
    return op
  }
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const op = randomOp(spec, random)
    if (op.kind === 'paint' && painted.has(`${op.row}:${op.col}`)) continue
    if (opChanges(grid, op)) return op
  }
  return paintOp(0, 0)
}

function unwind(target: readonly (readonly number[])[], spec: LoomSpec, random: () => number) {
  let current = target.map((line) => [...line])
  const solution: LoomOp[] = []
  const painted = new Set<string>()
  let last: LoomOp | null = null
  for (let applied = 0; applied < spec.ops; applied += 1) {
    const op = pickOp(current, spec, painted, random, last)
    current = applyOp(current, op)
    if (op.kind === 'paint') painted.add(`${op.row}:${op.col}`)
    solution.unshift(opInverse(op))
    last = op
  }
  return { start: current, solution }
}

export function createLoomLevel(level: number): LoomLevel {
  const spec = getLoomSpec(level)
  const random = mulberry32(seedFor(spec.level, 35))
  const target = weaveTarget(spec, random)
  const first = unwind(target, spec, random)
  let start = first.start
  let solution = first.solution
  let guard = 0
  while (gridsEqual(start, target) && guard < 20) {
    const extra = unwind(start, { ...spec, ops: 1 }, random)
    start = extra.start
    solution = [...extra.solution, ...solution]
    guard += 1
  }
  return { size: spec.size, target, start, par: solution.length, quota: solution.length + spec.slack, solution }
}
