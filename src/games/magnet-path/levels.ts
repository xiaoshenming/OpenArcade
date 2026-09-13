import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import {
  cellKey,
  inGrid,
  manhattan,
  netForce,
  REACH,
  simulateRun,
  stepBall,
  type Cell,
  type Field,
  type Magnet,
  type MagnetLevel,
} from './logic'

export interface MagnetSpec {
  readonly level: number
  readonly chapter: number
  readonly mode: string
  readonly size: number
  readonly capacity: number
  readonly turns: number
  readonly walls: number
  readonly holeCount: number
  readonly reach: number
  readonly slack: number
  readonly title: string
  readonly detail: string
}

interface ChapterConfig {
  readonly begin: number
  readonly count: number
  readonly size: number
  readonly capacity: number
  readonly turns: number
  readonly walls: number
  readonly holeCount: number
  readonly distLow: number
  readonly distHigh: number
  readonly slack: number
  readonly mode: string
  readonly title: string
  readonly detail: string
}

const CHAPTERS: readonly ChapterConfig[] = [
  { begin: 1, count: 11, size: 6, capacity: 2, turns: 1, walls: 0, holeCount: 1, distLow: 4, distHigh: 5, slack: 4, mode: 'attract', title: '初识磁路', detail: 'N 极吸引铁球、S 极推斥铁球，两枚磁石内把球送入穴中' },
  { begin: 12, count: 11, size: 7, capacity: 3, turns: 2, walls: 0, holeCount: 1, distLow: 5, distHigh: 6, slack: 3, mode: 'budget', title: '三石预算', detail: '场地更大、预算收紧，三枚磁石要规划好每一回合的合力' },
  { begin: 23, count: 11, size: 8, capacity: 3, turns: 2, walls: 5, holeCount: 1, distLow: 6, distHigh: 7, slack: 3, mode: 'walls', title: '障碍磁场', detail: '场地出现障碍墙，磁力推球时必须绕开它们' },
  { begin: 34, count: 11, size: 8, capacity: 4, turns: 3, walls: 7, holeCount: 1, distLow: 7, distHigh: 8, slack: 2, mode: 'tight', title: '极限预算', detail: '预算贴着参考步数，四枚磁石组合出精细的推拉路线' },
  { begin: 45, count: 16, size: 9, capacity: 5, turns: 1, walls: 8, holeCount: 2, distLow: 4, distHigh: 5, slack: 2, mode: 'gauntlet', title: '终局·双穴磁场', detail: '障碍、紧预算与双穴同台：按顺序依次把球送入两穴' },
]

export function getMagnetSpec(level: number): MagnetSpec {
  const safe = Math.min(60, Math.max(1, Math.floor(level)))
  const index = CHAPTERS.findIndex((chapter) => safe < chapter.begin + chapter.count)
  const config = CHAPTERS[index < 0 ? CHAPTERS.length - 1 : index]
  const progress = (safe - config.begin) / (config.count - 1)
  return {
    level: safe,
    chapter: CHAPTERS.indexOf(config) + 1,
    mode: config.mode,
    size: config.size,
    capacity: config.capacity,
    turns: config.turns,
    walls: config.walls + Math.round(progress * 3),
    holeCount: config.holeCount,
    reach: config.distLow + Math.round(progress * (config.distHigh - config.distLow)),
    slack: config.slack,
    title: safe === 60 ? '终局·双穴磁场' : config.title,
    detail: config.detail,
  }
}

interface Anchors {
  readonly start: Cell
  readonly holes: Cell[]
}

const rollFreeCell = (random: () => number, size: number, taken: ReadonlySet<number>): Cell => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const cell = { row: Math.floor(random() * size), col: Math.floor(random() * size) }
    if (!taken.has(cellKey(cell.row, cell.col))) return cell
  }
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) if (!taken.has(cellKey(row, col))) return { row, col }
  }
  return { row: 0, col: 0 }
}

function placeAnchors(spec: MagnetSpec, random: () => number): Anchors | null {
  const start = rollFreeCell(random, spec.size, new Set())
  const taken = new Set([cellKey(start.row, start.col)])
  const holes: Cell[] = []
  for (let index = 0; index < spec.holeCount; index += 1) {
    const anchor = index === 0 ? start : holes[index - 1]
    let hole: Cell | null = null
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const cell = rollFreeCell(random, spec.size, taken)
      if (manhattan(anchor, cell) !== spec.reach) continue
      if (spec.holeCount > 1 && (cell.row === anchor.row || cell.col === anchor.col)) continue
      hole = cell
      break
    }
    if (!hole) return null
    holes.push(hole)
    taken.add(cellKey(hole.row, hole.col))
  }
  return { start, holes }
}

function composition(total: number, parts: number, random: () => number): number[] {
  if (parts <= 1 || total < parts) return [total]
  const cuts = shuffle(random, Array.from({ length: total - 1 }, (_, index) => index + 1)).slice(0, parts - 1).sort((a, b) => a - b)
  const pieces: number[] = []
  let last = 0
  for (const cut of [...cuts, total]) {
    pieces.push(cut - last)
    last = cut
  }
  return pieces
}

function staircase(from: Cell, to: Cell, runs: number, random: () => number): Cell[] {
  const dx = Math.sign(to.col - from.col)
  const dy = Math.sign(to.row - from.row)
  const hTotal = Math.abs(to.col - from.col)
  const vTotal = Math.abs(to.row - from.row)
  const startH = random() < 0.5
  const hParts = composition(hTotal, startH ? Math.ceil(runs / 2) : Math.floor(runs / 2), random)
  const vParts = composition(vTotal, startH ? Math.floor(runs / 2) : Math.ceil(runs / 2), random)
  const moves: Cell[] = []
  const push = (dr: number, dc: number, count: number) => {
    for (let index = 0; index < count; index += 1) moves.push({ row: dr, col: dc })
  }
  let hi = 0
  let vi = 0
  let axisH = startH
  while (hi < hParts.length || vi < vParts.length) {
    if (axisH && hi < hParts.length) push(0, dx, hParts[hi])
    else if (!axisH && vi < vParts.length) push(dy, 0, vParts[vi])
    else if (hi < hParts.length) push(0, dx, hParts[hi])
    else push(dy, 0, vParts[vi])
    if (axisH && hi < hParts.length) hi += 1
    else if (!axisH && vi < vParts.length) vi += 1
    else if (hi < hParts.length) hi += 1
    else vi += 1
    axisH = !axisH
  }
  const path = [from]
  let current = from
  for (const move of moves) {
    current = { row: current.row + move.row, col: current.col + move.col }
    path.push(current)
  }
  return path
}

function buildSteps(anchors: Anchors, spec: MagnetSpec, random: () => number): Cell[] {
  const steps: Cell[] = [anchors.start]
  let anchor = anchors.start
  for (const hole of anchors.holes) {
    steps.push(...staircase(anchor, hole, spec.turns, random).slice(1))
    anchor = hole
  }
  return steps
}

function placeWalls(spec: MagnetSpec, steps: readonly Cell[], random: () => number): Cell[] {
  const taken = new Set(steps.map((step) => cellKey(step.row, step.col)))
  const walls: Cell[] = []
  for (let index = 0; index < spec.walls; index += 1) {
    const wall = rollFreeCell(random, spec.size, taken)
    walls.push(wall)
    taken.add(cellKey(wall.row, wall.col))
  }
  return walls
}

function prefixMatches(field: Field, steps: readonly Cell[], magnets: readonly Magnet[], upto: number) {
  let ball = { row: steps[0].row, col: steps[0].col, filled: 0 }
  for (let index = 1; index <= upto; index += 1) {
    ball = stepBall(field, ball, magnets)
    if (ball.row !== steps[index].row || ball.col !== steps[index].col) return false
  }
  return true
}

function candidatesFor(field: Field, steps: readonly Cell[], magnets: readonly Magnet[], index: number, random: () => number): Magnet[] {
  const anchor = steps[index - 1]
  const goal = steps[index]
  const desired = { fx: Math.sign(goal.col - anchor.col), fy: Math.sign(goal.row - anchor.row) }
  const reserved = new Set<number>([
    ...field.walls.map((wall) => cellKey(wall.row, wall.col)),
    ...field.holes.map((hole) => cellKey(hole.row, hole.col)),
    ...steps.map((step) => cellKey(step.row, step.col)),
    ...magnets.map((magnet) => cellKey(magnet.row, magnet.col)),
  ])
  const list: Magnet[] = []
  for (let dr = -REACH; dr <= REACH; dr += 1) {
    for (let dc = -REACH; dc <= REACH; dc += 1) {
      const d = Math.abs(dr) + Math.abs(dc)
      if (d < 1 || d > REACH) continue
      const row = anchor.row + dr
      const col = anchor.col + dc
      if (!inGrid(field.size, row, col) || reserved.has(cellKey(row, col))) continue
      list.push({ row, col, polarity: 'N' }, { row, col, polarity: 'S' })
    }
  }
  const alignment = (magnet: Magnet) => {
    const force = netForce(anchor, [...magnets, magnet])
    return Math.abs(force.fx * desired.fx + force.fy * desired.fy)
  }
  return shuffle(random, list).sort((a, b) => alignment(b) - alignment(a))
}

function synthesize(field: Field, steps: readonly Cell[], capacity: number, random: () => number, index: number, magnets: readonly Magnet[]): Magnet[] | null {
  if (index >= steps.length) return [...magnets]
  if (prefixMatches(field, steps, magnets, index)) return synthesize(field, steps, capacity, random, index + 1, magnets)
  if (magnets.length >= capacity) return null
  for (const candidate of candidatesFor(field, steps, magnets, index, random)) {
    const next = [...magnets, candidate]
    if (!prefixMatches(field, steps, next, index)) continue
    const deep = synthesize(field, steps, capacity, random, index + 1, next)
    if (deep) return deep
  }
  return null
}

function straightFallback(): { field: Field; start: Cell; magnets: Magnet[] } {
  const field: Field = { size: 6, holes: [{ row: 1, col: 3 }], walls: [] }
  return { field, start: { row: 1, col: 1 }, magnets: [{ row: 1, col: 0, polarity: 'S' }] }
}

function fallbackLevel(spec: MagnetSpec, random: () => number): MagnetLevel {
  const field: Field = { size: 6, holes: spec.holeCount > 1 ? [{ row: 1, col: 3 }, { row: 3, col: 3 }] : [{ row: 1, col: 3 }], walls: [] }
  const start: Cell = { row: 1, col: 1 }
  const steps: Cell[] = spec.holeCount > 1 ? [start, { row: 1, col: 2 }, field.holes[0], { row: 2, col: 3 }, field.holes[1]] : [start, { row: 1, col: 2 }, field.holes[0]]
  const magnets = synthesize(field, steps, spec.capacity, random, 1, [])
  if (magnets) {
    const run = simulateRun(field, start, magnets)
    if (run.won) return { ...field, start, capacity: spec.capacity, par: run.turns, budget: run.turns + spec.slack, solution: magnets }
  }
  const plain = straightFallback()
  const safe = simulateRun(plain.field, plain.start, plain.magnets)
  return { ...plain.field, start: plain.start, capacity: spec.capacity, par: safe.turns, budget: safe.turns + spec.slack, solution: plain.magnets }
}

export function createMagnetLevel(level: number): MagnetLevel {
  const spec = getMagnetSpec(level)
  const random = mulberry32(seedFor(spec.level, 68))
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const anchors = placeAnchors(spec, random)
    if (!anchors) continue
    const steps = buildSteps(anchors, spec, random)
    const walls = placeWalls(spec, steps, random)
    const field: Field = { size: spec.size, holes: anchors.holes, walls }
    const magnets = synthesize(field, steps, spec.capacity, random, 1, [])
    if (!magnets) continue
    const run = simulateRun(field, anchors.start, magnets)
    if (!run.won || run.turns !== steps.length - 1) continue
    return { ...field, start: anchors.start, capacity: spec.capacity, par: run.turns, budget: run.turns + spec.slack, solution: magnets }
  }
  return fallbackLevel(spec, random)
}
