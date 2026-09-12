export const COLS = 10
export const ROWS = 14
export const EMPTY = 0, STACK = 1, GARBAGE = 2, ACTIVE = 3, ICE = 4
export const SCORE_CAP = 10000
export const SCORE_TABLE = [0, 100, 300, 500, 800] as const
export type Cell = 0 | 1 | 2 | 3 | 4
export type Grid = Cell[][]
export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type StepEvent = 'rotate' | 'lock' | 'clear' | 'melt' | 'reforge' | 'win' | 'lose'
export type TowerStatus = 'playing' | 'won' | 'lost'
export const ALL_KINDS: readonly PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

type Matrix = number[][]

const BASE: Record<PieceKind, Matrix> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
}

const rotateCW = (matrix: Matrix): Matrix => matrix.map((row, r) => row.map((_, c) => matrix[matrix.length - 1 - c][r]))

export const SHAPES: Record<PieceKind, Matrix[]> = Object.fromEntries((Object.keys(BASE) as PieceKind[]).map((kind) => {
  const variants: Matrix[] = [BASE[kind]]
  for (let index = 1; index < 4; index += 1) variants.push(rotateCW(variants[index - 1]))
  return [kind, variants]
})) as Record<PieceKind, Matrix[]>

export interface Piece { kind: PieceKind; rot: number; x: number; y: number }
export interface TowerPlan { grid: Grid; sequence: PieceKind[]; goal: number; tier: number; reforges: number }
export interface TowerState extends TowerPlan {
  piece: Piece
  nextIndex: number
  cleared: number
  score: number
  status: TowerStatus
  events: StepEvent[]
}

const KICKS: readonly (readonly [number, number])[] = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]
const SPAWN_X = (kind: PieceKind) => (kind === 'O' ? 4 : 3)
const SPAWN_Y = (kind: PieceKind) => (kind === 'I' ? -1 : 0)

export const spawnPiece = (kind: PieceKind): Piece => ({ kind, rot: 0, x: SPAWN_X(kind), y: SPAWN_Y(kind) })
export const shapeAt = (piece: Piece): Matrix => SHAPES[piece.kind][piece.rot]

export function emptyGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => EMPTY as Cell))
}

export function collides(grid: Grid, shape: Matrix, x: number, y: number): boolean {
  for (let r = 0; r < shape.length; r += 1) {
    for (let c = 0; c < shape[r].length; c += 1) {
      if (!shape[r][c]) continue
      const gx = x + c
      const gy = y + r
      if (gx < 0 || gx >= COLS || gy >= ROWS) return true
      if (gy >= 0 && grid[gy][gx] !== EMPTY) return true
    }
  }
  return false
}

export function lineScore(lines: number, tier: number): number {
  return (SCORE_TABLE[Math.min(4, Math.max(0, lines))] ?? 0) * Math.max(1, tier)
}

export function createTowerState(plan: TowerPlan): TowerState {
  const base: TowerState = {
    grid: plan.grid.map((row) => [...row]),
    sequence: [...plan.sequence],
    goal: plan.goal,
    tier: plan.tier,
    reforges: plan.reforges,
    piece: spawnPiece('T'),
    nextIndex: 0,
    cleared: 0,
    score: 0,
    status: 'lost',
    events: ['lose'],
  }
  if (!base.sequence.length) return base
  const piece = spawnPiece(base.sequence[0])
  if (collides(base.grid, shapeAt(piece), piece.x, piece.y)) return { ...base, piece }
  return { ...base, piece, status: 'playing', events: [] }
}

// Event-less actions must emit an empty event list: the UI replays state.events on
// every state change, so carrying the previous action's events would replay its sounds.
export function movePiece(state: TowerState, dx: number): TowerState {
  if (state.status !== 'playing' || !Number.isInteger(dx)) return state
  const { piece } = state
  if (collides(state.grid, shapeAt(piece), piece.x + dx, piece.y)) return state
  return { ...state, piece: { ...piece, x: piece.x + dx }, events: [] }
}

export function rotatePiece(state: TowerState): TowerState {
  if (state.status !== 'playing') return state
  const { piece } = state
  const rot = (piece.rot + 1) % 4
  const shape = SHAPES[piece.kind][rot]
  for (const [dx, dy] of KICKS) {
    if (!collides(state.grid, shape, piece.x + dx, piece.y + dy)) {
      return { ...state, piece: { ...piece, rot, x: piece.x + dx, y: piece.y + dy }, events: ['rotate'] }
    }
  }
  return state
}

export function softDrop(state: TowerState): TowerState {
  if (state.status !== 'playing') return state
  const { piece } = state
  if (!collides(state.grid, shapeAt(piece), piece.x, piece.y + 1)) return { ...state, piece: { ...piece, y: piece.y + 1 }, events: [] }
  return lockActive(state)
}

export function hardDrop(state: TowerState): TowerState {
  if (state.status !== 'playing') return state
  let piece = state.piece
  while (!collides(state.grid, shapeAt(piece), piece.x, piece.y + 1)) piece = { ...piece, y: piece.y + 1 }
  return lockActive({ ...state, piece })
}

export function lockActive(state: TowerState): TowerState {
  if (state.status !== 'playing') return state
  const events: StepEvent[] = ['lock']
  const shape = shapeAt(state.piece)
  const grid: Grid = state.grid.map((row) => [...row])
  let overflow = false
  shape.forEach((row, r) => row.forEach((cell, c) => {
    if (!cell) return
    const gy = state.piece.y + r
    if (gy < 0) overflow = true
    else grid[gy][state.piece.x + c] = STACK
  }))
  if (overflow) return { ...state, grid, status: 'lost', events: [...events, 'lose'] }
  const fullRows = grid.map((row, index) => (row.every((cell) => cell !== EMPTY) ? index : -1)).filter((index) => index >= 0)
  // Ice rows stay frozen: they never clear while any ICE cell remains, and clearing
  // the row directly above one melts it into plain stack cells (cleared one lock later).
  const frozenRows = fullRows.filter((index) => grid[index].some((cell) => cell === ICE))
  const clearable = fullRows.filter((index) => !frozenRows.includes(index))
  const melts = new Set(clearable.filter((index) => grid[index + 1]?.some((cell) => cell === ICE)).map((index) => index + 1))
  const pureRows = clearable.filter((index) => grid[index].every((cell) => cell === STACK))
  const score = Math.min(SCORE_CAP, state.score + lineScore(clearable.length, state.tier))
  const cleared = state.cleared + pureRows.length
  const melted: Grid = melts.size
    ? grid.map((row, index) => (melts.has(index) ? row.map((cell) => (cell === ICE ? STACK : cell)) : row))
    : grid
  const kept = melted.filter((_, index) => !clearable.includes(index))
  const nextGrid: Grid = Array.from({ length: clearable.length }, () => Array.from({ length: COLS }, () => EMPTY as Cell)).concat(kept)
  if (clearable.length) events.push('clear')
  if (melts.size) events.push('melt')
  if (cleared >= state.goal) return { ...state, grid: nextGrid, score, cleared, status: 'won', events: [...events, 'win'] }
  const nextIndex = state.nextIndex + 1
  if (nextIndex >= state.sequence.length) return { ...state, grid: nextGrid, score, cleared, nextIndex, status: 'lost', events: [...events, 'lose'] }
  const piece = spawnPiece(state.sequence[nextIndex])
  if (collides(nextGrid, shapeAt(piece), piece.x, piece.y)) return { ...state, grid: nextGrid, score, cleared, nextIndex, piece, status: 'lost', events: [...events, 'lose'] }
  return { ...state, grid: nextGrid, score, cleared, nextIndex, piece, events }
}

export function castReforge(state: TowerState): TowerState {
  if (state.status !== 'playing' || state.reforges <= 0) return state
  const row: Cell[] = Array.from({ length: COLS }, () => EMPTY as Cell)
  return { ...state, grid: [row, ...state.grid.slice(0, ROWS - 1)], reforges: state.reforges - 1, events: ['reforge'] }
}
