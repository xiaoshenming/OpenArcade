export const REACH = 4
export const WEIGHTS = [0, 4, 3, 2, 1]
export type Polarity = 'N' | 'S'

export interface Cell {
  readonly row: number
  readonly col: number
}

export interface Magnet {
  readonly row: number
  readonly col: number
  readonly polarity: Polarity
}

export interface BallState {
  readonly row: number
  readonly col: number
  readonly filled: number
}

export interface Field {
  readonly size: number
  readonly holes: readonly Cell[]
  readonly walls: readonly Cell[]
}

export interface MagnetLevel extends Field {
  readonly start: Cell
  readonly capacity: number
  readonly par: number
  readonly budget: number
  readonly solution: readonly Magnet[]
}

export interface RunResult {
  readonly turns: number
  readonly won: boolean
  readonly ball: BallState
}

export const cellKey = (row: number, col: number) => row * 32 + col
export const sameCell = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col
export const inGrid = (size: number, row: number, col: number) => row >= 0 && col >= 0 && row < size && col < size
export const manhattan = (a: Cell, b: Cell) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col)

export function magnetForce(ball: Cell, magnet: Magnet): { fx: number; fy: number } {
  const dr = magnet.row - ball.row
  const dc = magnet.col - ball.col
  const d = Math.abs(dr) + Math.abs(dc)
  if (d < 1 || d > REACH) return { fx: 0, fy: 0 }
  const weight = WEIGHTS[d] * (magnet.polarity === 'N' ? 1 : -1)
  return { fx: Math.sign(dc) * weight || 0, fy: Math.sign(dr) * weight || 0 }
}

export function netForce(ball: Cell, magnets: readonly Magnet[]): { fx: number; fy: number } {
  return magnets.reduce(
    (sum, magnet) => {
      const force = magnetForce(ball, magnet)
      return { fx: sum.fx + force.fx, fy: sum.fy + force.fy }
    },
    { fx: 0, fy: 0 },
  )
}

const wallKeys = (field: Field) => new Set(field.walls.map((wall) => cellKey(wall.row, wall.col)))
const magnetKeys = (magnets: readonly Magnet[]) => new Set(magnets.map((magnet) => cellKey(magnet.row, magnet.col)))

export function stepBall(field: Field, ball: BallState, magnets: readonly Magnet[]): BallState {
  const { fx, fy } = netForce(ball, magnets)
  if (fx === 0 && fy === 0) return ball
  const sideways = Math.abs(fx) > Math.abs(fy)
  const row = ball.row + (sideways ? 0 : Math.sign(fy))
  const col = ball.col + (sideways ? Math.sign(fx) : 0)
  if (!inGrid(field.size, row, col)) return ball
  const key = cellKey(row, col)
  if (wallKeys(field).has(key) || magnetKeys(magnets).has(key)) return ball
  for (let index = ball.filled + 1; index < field.holes.length; index += 1) {
    if (sameCell(field.holes[index], { row, col })) return ball
  }
  const filled = ball.filled < field.holes.length && sameCell(field.holes[ball.filled], { row, col }) ? ball.filled + 1 : ball.filled
  return { row, col, filled }
}

export function bfsMinTurns(field: Field, start: Cell, magnets: readonly Magnet[], limit = 256): number {
  const goal = field.holes.length
  const seen = new Set([`${start.row}.${start.col}.0`])
  let frontier: BallState[] = [{ row: start.row, col: start.col, filled: 0 }]
  for (let turns = 1; turns <= limit; turns += 1) {
    const next: BallState[] = []
    for (const ball of frontier) {
      const moved = stepBall(field, ball, magnets)
      if (moved.filled === goal) return turns
      const key = `${moved.row}.${moved.col}.${moved.filled}`
      if (seen.has(key)) continue
      seen.add(key)
      next.push(moved)
    }
    if (!next.length) return -1
    frontier = next
  }
  return -1
}

export function simulateRun(field: Field, start: Cell, magnets: readonly Magnet[], maxTurns = 64): RunResult {
  let ball: BallState = { row: start.row, col: start.col, filled: 0 }
  for (let turns = 1; turns <= maxTurns; turns += 1) {
    ball = stepBall(field, ball, magnets)
    if (ball.filled === field.holes.length) return { turns, won: true, ball }
  }
  return { turns: maxTurns, won: false, ball }
}

export const magnetAt = (magnets: readonly Magnet[], cell: Cell): Magnet | null =>
  magnets.find((magnet) => sameCell(magnet, cell)) ?? null

export function canPlace(field: Field, start: Cell, magnets: readonly Magnet[], capacity: number, ball: BallState, cell: Cell) {
  if (!inGrid(field.size, cell.row, cell.col)) return false
  if (magnets.length >= capacity) return false
  if (sameCell(ball, cell) || sameCell(start, cell)) return false
  const key = cellKey(cell.row, cell.col)
  if (magnetKeys(magnets).has(key) || wallKeys(field).has(key)) return false
  return !field.holes.some((hole) => sameCell(hole, cell))
}

export const scoreFor = (turns: number, par: number) => Math.max(100, 1000 - Math.max(0, turns - par) * 12)
