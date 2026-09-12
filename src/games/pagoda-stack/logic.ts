export type Board = number[][]

export interface MoveOptions {
  rainbow?: boolean
  lockedPeg?: number
}

export interface SolveSpec {
  pegs: number
  discs: number
  rainbow?: boolean
  lockedPeg?: number
  unlockAfter?: number
}

export interface SolveStep {
  from: number
  to: number
}

export const RAINBOW_TONES = ['#ff5f7e', '#2fd6b8', '#ffc94d'] as const
export const colorOf = (disc: number) => (disc - 1) % 3

export function createBoard(pegs: number, discs: number): Board {
  const safePegs = Math.min(6, Math.max(3, Math.floor(pegs)))
  const safeDiscs = Math.min(12, Math.max(1, Math.floor(discs)))
  return Array.from({ length: safePegs }, (_, peg) => (peg === 0 ? Array.from({ length: safeDiscs }, (_, index) => safeDiscs - index) : []))
}

export function canMove(board: Board, from: number, to: number, options: MoveOptions = {}): boolean {
  if (from === to || !board[from]?.length || !board[to]) return false
  if (options.lockedPeg !== undefined && (from === options.lockedPeg || to === options.lockedPeg)) return false
  const disc = board[from][board[from].length - 1]
  const top = board[to][board[to].length - 1]
  if (top !== undefined && (top < disc || (options.rainbow === true && colorOf(top) === colorOf(disc)))) return false
  return true
}

export function move(board: Board, from: number, to: number, options: MoveOptions = {}): Board {
  if (!canMove(board, from, to, options)) return board
  const next = board.map((peg) => [...peg])
  next[to].push(next[from].pop() as number)
  return next
}

export function isSolved(board: Board): boolean {
  const last = board.length - 1
  return board.every((peg, index) => index === last || peg.length === 0) && board[last].every((disc, index) => disc === board[last].length - index)
}

export const scoreFor = (moves: number, par: number) => Math.max(100, 1000 - Math.max(0, moves - par) * 15)

function eachMove(spec: SolveSpec, config: number, phase: number, powers: readonly number[], visit: (from: number, to: number, disc: number) => void) {
  const { pegs, discs } = spec
  const top = new Array<number>(pegs).fill(0)
  const positions = new Array<number>(discs + 1).fill(0)
  for (let disc = 1; disc <= discs; disc += 1) {
    positions[disc] = Math.floor(config / powers[disc - 1]) % pegs
    if (top[positions[disc]] === 0) top[positions[disc]] = disc
  }
  const sealed = spec.lockedPeg !== undefined && phase < (spec.unlockAfter ?? Number.POSITIVE_INFINITY) ? spec.lockedPeg : -1
  for (let from = 0; from < pegs; from += 1) {
    const disc = top[from]
    if (disc === 0 || from === sealed) continue
    for (let to = 0; to < pegs; to += 1) {
      if (to === from || to === sealed) continue
      const target = top[to]
      if (target !== 0 && (target < disc || (spec.rainbow === true && colorOf(target) === colorOf(disc)))) continue
      visit(from, to, disc)
    }
  }
}

const powersFor = (pegs: number, discs: number) => Array.from({ length: discs }, (_, index) => pegs ** index)
const phaseCount = (spec: SolveSpec) => (spec.lockedPeg === undefined ? 1 : Math.min((spec.unlockAfter ?? 0) + 1, 1024))

export function solveMinMoves(spec: SolveSpec): number {
  const { pegs, discs } = spec
  const span = pegs ** discs
  const phases = phaseCount(spec)
  const size = span * phases
  if (pegs < 3 || discs < 1 || size > 4000000) return -1
  const powers = powersFor(pegs, discs)
  const goal = span - 1
  const seen = new Uint8Array(size)
  const depths = new Uint16Array(size)
  const queue = new Int32Array(size)
  let head = 0
  let tail = 0
  let answer = -1
  seen[0] = 1
  queue[tail++] = 0
  while (head < tail && answer < 0) {
    const state = queue[head++]
    const phase = phases > 1 ? state % phases : 0
    const config = phases > 1 ? Math.floor(state / phases) : state
    const depth = depths[state]
    eachMove(spec, config, phase, powers, (from, to, disc) => {
      if (answer >= 0) return
      const nextConfig = config + (to - from) * powers[disc - 1]
      if (nextConfig === goal) {
        answer = depth + 1
        return
      }
      const nextState = phases > 1 ? nextConfig * phases + Math.min(phase + 1, phases - 1) : nextConfig
      if (seen[nextState]) return
      seen[nextState] = 1
      depths[nextState] = depth + 1
      queue[tail++] = nextState
    })
  }
  return answer
}

export function solvePath(spec: SolveSpec): SolveStep[] | null {
  const { pegs, discs } = spec
  const span = pegs ** discs
  const phases = phaseCount(spec)
  const size = span * phases
  if (pegs < 3 || discs < 1 || size > 300000) return null
  const powers = powersFor(pegs, discs)
  const goal = span - 1
  const parents = new Map<number, number>([[0, -1]])
  const depths = new Map<number, number>([[0, 0]])
  const queue = [0]
  let goalState = -1
  for (let head = 0; head < queue.length && goalState < 0; head += 1) {
    const state = queue[head]
    const phase = phases > 1 ? state % phases : 0
    const config = phases > 1 ? Math.floor(state / phases) : state
    const depth = depths.get(state) as number
    eachMove(spec, config, phase, powers, (from, to, disc) => {
      if (goalState >= 0) return
      const nextConfig = config + (to - from) * powers[disc - 1]
      const nextState = phases > 1 ? nextConfig * phases + Math.min(phase + 1, phases - 1) : nextConfig
      if (nextConfig === goal) {
        parents.set(nextState, state * 64 + from * 8 + to)
        goalState = nextState
        return
      }
      if (parents.has(nextState)) return
      parents.set(nextState, state * 64 + from * 8 + to)
      depths.set(nextState, depth + 1)
      queue.push(nextState)
    })
  }
  if (goalState < 0) return null
  const steps: SolveStep[] = []
  let cursor = goalState
  while (cursor !== 0) {
    const packed = parents.get(cursor) as number
    steps.push({ from: Math.floor(packed / 8) % 8, to: packed % 8 })
    cursor = Math.floor(packed / 64)
  }
  return steps.reverse()
}
