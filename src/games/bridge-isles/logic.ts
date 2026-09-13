import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { BRIDGE_LEVEL_COUNT, getBridgeLevel } from './levels'

export interface Isle {
  readonly row: number
  readonly col: number
  readonly need: number
}

export interface IsleRun {
  readonly a: number
  readonly b: number
  readonly horizontal: boolean
  readonly cells: readonly number[]
  readonly crosses: readonly number[]
}

export interface BridgePuzzle {
  readonly rows: number
  readonly cols: number
  readonly isles: readonly Isle[]
  readonly runs: readonly IsleRun[]
  readonly solution: readonly number[]
  readonly fixed: readonly number[]
  readonly par: number
  readonly timeLimit: number
}

interface Spot {
  readonly row: number
  readonly col: number
}

type RunDraft = { a: number; b: number; horizontal: boolean; cells: number[]; crosses: number[] }

function growIsles(rng: () => number, coarseRows: number, coarseCols: number, count: number): Map<number, number> | null {
  const start = Math.floor(rng() * coarseRows * coarseCols)
  const parent = new Map<number, number>([[start, -1]])
  const frontier: number[] = []
  const neighbors = (cell: number) => {
    const row = Math.floor(cell / coarseCols)
    const col = cell % coarseCols
    const list: number[] = []
    if (row > 0) list.push(cell - coarseCols)
    if (row + 1 < coarseRows) list.push(cell + coarseCols)
    if (col > 0) list.push(cell - 1)
    if (col + 1 < coarseCols) list.push(cell + 1)
    return list
  }
  frontier.push(...neighbors(start))
  while (parent.size < count && frontier.length > 0) {
    const pick = Math.floor(rng() * frontier.length)
    const cell = frontier[pick]
    frontier[pick] = frontier[frontier.length - 1]
    frontier.pop()
    if (parent.has(cell)) continue
    const anchors = neighbors(cell).filter((next) => parent.has(next))
    if (anchors.length === 0) continue
    parent.set(cell, anchors[Math.floor(rng() * anchors.length)])
    frontier.push(...neighbors(cell))
  }
  return parent.size === count ? parent : null
}

function buildRuns(rows: number, cols: number, spots: readonly Spot[]): RunDraft[] {
  const runs: RunDraft[] = []
  const sweep = (horizontal: boolean, line: number) => {
    const members = spots
      .map((spot, id) => ({ id, at: horizontal ? spot.col : spot.row, on: horizontal ? spot.row : spot.col }))
      .filter((member) => member.on === line)
      .sort((left, right) => left.at - right.at)
    for (let step = 1; step < members.length; step += 1) {
      const cells: number[] = []
      for (let at = members[step - 1].at + 1; at < members[step].at; at += 1) {
        cells.push(horizontal ? line * cols + at : at * cols + line)
      }
      runs.push({ a: members[step - 1].id, b: members[step].id, horizontal, cells, crosses: [] })
    }
  }
  for (let row = 0; row < rows; row += 1) sweep(true, row)
  for (let col = 0; col < cols; col += 1) sweep(false, col)
  for (let left = 0; left < runs.length; left += 1) {
    for (let right = left + 1; right < runs.length; right += 1) {
      if (runs[left].horizontal === runs[right].horizontal) continue
      if (!runs[right].cells.some((cell) => runs[left].cells.includes(cell))) continue
      runs[left].crosses.push(right)
      runs[right].crosses.push(left)
    }
  }
  return runs
}

function unionFind(size: number) {
  const parent = Array.from({ length: size }, (_, index) => index)
  const find = (node: number): number => {
    let root = node
    while (parent[root] !== root) root = parent[root]
    while (parent[node] !== root) {
      const next = parent[node]
      parent[node] = root
      node = next
    }
    return root
  }
  const union = (a: number, b: number): boolean => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return false
    parent[ra] = rb
    return true
  }
  return { find, union }
}

function attemptPuzzle(rng: () => number, spec: ReturnType<typeof getBridgeLevel>): BridgePuzzle | null {
  const coarseRows = Math.ceil(spec.rows / 2)
  const coarseCols = Math.ceil(spec.cols / 2)
  if (coarseRows * coarseCols < spec.islands) return null
  const tree = growIsles(rng, coarseRows, coarseCols, spec.islands)
  if (!tree) return null
  const rowOffset = spec.rows % 2 === 0 ? Math.floor(rng() * 2) : 0
  const colOffset = spec.cols % 2 === 0 ? Math.floor(rng() * 2) : 0
  const cells = [...tree.keys()]
  const coarseIndex = new Map<number, number>()
  cells.forEach((cell, index) => coarseIndex.set(cell, index))
  const spots: Spot[] = cells.map((cell) => ({
    row: 2 * Math.floor(cell / coarseCols) + rowOffset,
    col: 2 * (cell % coarseCols) + colOffset,
  }))
  const runs = buildRuns(spec.rows, spec.cols, spots)
  const chosen = new Set<number>()
  for (const [cell, parentCell] of tree) {
    if (parentCell < 0) continue
    const a = coarseIndex.get(cell) ?? -1
    const b = coarseIndex.get(parentCell) ?? -1
    const id = runs.findIndex((run) => (run.a === a && run.b === b) || (run.a === b && run.b === a))
    if (id < 0) return null
    chosen.add(id)
  }
  if (chosen.size !== spots.length - 1) return null
  for (const id of shuffle(rng, runs.map((_, runId) => runId))) {
    if (chosen.has(id) || rng() >= spec.extraChance) continue
    if (runs[id].crosses.some((other) => chosen.has(other))) continue
    chosen.add(id)
  }
  const need = spots.map(() => 0)
  const solution = runs.map(() => 0)
  for (const id of chosen) {
    const weight = rng() < spec.doubleChance ? 2 : 1
    solution[id] = weight
    need[runs[id].a] += weight
    need[runs[id].b] += weight
  }
  const fixed = runs.map(() => 0)
  const edges = [...chosen]
  if (spec.lockRatio > 0) {
    const quota = Math.min(edges.length - 1, Math.max(1, Math.round(edges.length * spec.lockRatio)))
    for (const id of shuffle(rng, edges).slice(0, quota)) fixed[id] = solution[id]
  }
  const total = solution.reduce((sum, count) => sum + count, 0)
  const welded = fixed.reduce((sum, count) => sum + count, 0)
  return {
    rows: spec.rows,
    cols: spec.cols,
    isles: spots.map((spot, index) => ({ row: spot.row, col: spot.col, need: need[index] })),
    runs,
    solution,
    fixed,
    par: total - welded,
    timeLimit: spec.timeBase > 0 ? spec.timeBase + total * spec.timeScale : 0,
  }
}

export function generateBridgePuzzle(level: number): BridgePuzzle {
  const safe = Math.min(BRIDGE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const spec = getBridgeLevel(safe)
  const rng = mulberry32(seedFor(safe, 46))
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const puzzle = attemptPuzzle(rng, spec)
    if (puzzle) return puzzle
  }
  throw new Error(`bridge-isles level ${safe} generation exhausted`)
}

export function islandCounts(puzzle: BridgePuzzle, state: readonly number[]): number[] {
  const counts = new Array<number>(puzzle.isles.length).fill(0)
  puzzle.runs.forEach((run, id) => {
    const bridges = state[id] ?? 0
    if (!bridges) return
    counts[run.a] += bridges
    counts[run.b] += bridges
  })
  return counts
}

export function isConnected(puzzle: BridgePuzzle, state: readonly number[]): boolean {
  const groups = unionFind(puzzle.isles.length)
  puzzle.runs.forEach((run, id) => {
    if (state[id]) groups.union(run.a, run.b)
  })
  const root = groups.find(0)
  return puzzle.isles.every((_, index) => groups.find(index) === root)
}

export interface BridgeAudit {
  readonly counts: readonly number[]
  readonly crossed: readonly boolean[]
  readonly connected: boolean
  readonly matched: boolean
  readonly solved: boolean
}

export function auditBridge(puzzle: BridgePuzzle, state: readonly number[]): BridgeAudit {
  const counts = islandCounts(puzzle, state)
  const crossed = puzzle.runs.map((run, id) => state[id] > 0 && run.crosses.some((other) => state[other] > 0))
  const connected = isConnected(puzzle, state)
  const matched = counts.every((count, index) => count === puzzle.isles[index].need)
  return { counts, crossed, connected, matched, solved: matched && connected && !crossed.some(Boolean) }
}

export type ToggleError = 'locked' | 'overfull' | 'crossed' | null

export interface TogglePlan {
  readonly next: readonly number[]
  readonly error: ToggleError
}

export function planToggle(puzzle: BridgePuzzle, state: readonly number[], runId: number): TogglePlan {
  const run = puzzle.runs[runId]
  if (!run || (puzzle.fixed[runId] ?? 0) > 0) return { next: state, error: 'locked' }
  const next = state.slice()
  next[runId] = ((state[runId] ?? 0) + 1) % 3
  if (next[runId] > state[runId]) {
    const counts = islandCounts(puzzle, next)
    if (counts[run.a] > puzzle.isles[run.a].need || counts[run.b] > puzzle.isles[run.b].need) {
      return { next: state, error: 'overfull' }
    }
    if (run.crosses.some((other) => next[other] > 0)) return { next: state, error: 'crossed' }
  }
  return { next, error: null }
}

export function runAtCell(puzzle: BridgePuzzle, state: readonly number[], cell: number): number {
  const here = puzzle.runs.map((run, id) => ({ id, run })).filter(({ run }) => run.cells.includes(cell))
  if (here.length === 0) return -1
  if (here.length === 1) return here[0].id
  const active = here.find(({ id }) => state[id] > 0)
  if (active) return active.id
  const horizontal = here.find(({ run }) => run.horizontal)
  return horizontal ? horizontal.id : here[0].id
}

export function runBetween(puzzle: BridgePuzzle, a: number, b: number): number {
  return puzzle.runs.findIndex((run) => (run.a === a && run.b === b) || (run.a === b && run.b === a))
}

export function bridgeScore(ops: number, par: number, mistakes: number): number {
  return Math.max(100, 1000 - Math.max(0, ops - par) * 10 - mistakes * 60)
}
