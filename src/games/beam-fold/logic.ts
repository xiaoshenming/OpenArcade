import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { BEAM_LEVEL_COUNT, getBeamLevel } from './levels'

export const DIR_DR = [-1, 0, 1, 0] as const
export const DIR_DC = [0, 1, 0, -1] as const

export const PIECE_NONE = 0
export const PIECE_MIRROR_A = 1
export const PIECE_MIRROR_B = 2
export const PIECE_SPLIT_A = 3
export const PIECE_SPLIT_B = 4
export const KIND_NAMES = ['空位', '平面镜 ╱', '平面镜 ╲', '分光器 ╱', '分光器 ╲'] as const

export function pieceExits(piece: number, dir: number): readonly number[] {
  if (piece === PIECE_MIRROR_A) return [dir ^ 1]
  if (piece === PIECE_MIRROR_B) return [3 - dir]
  if (piece === PIECE_SPLIT_A) return [dir ^ 1, dir]
  if (piece === PIECE_SPLIT_B) return [3 - dir, dir]
  return [dir]
}

export interface BeamState {
  readonly lit: readonly boolean[]
  readonly beams: readonly number[]
  readonly litCount: number
}

export function traceBeam(rows: number, cols: number, pieces: readonly number[], blocks: readonly boolean[], source: number, dir: number): BeamState {
  const total = rows * cols
  const lit = Array.from({ length: total }, () => false)
  const beams = Array.from({ length: total }, () => 0)
  const stack = [source * 4 + dir]
  const seen = new Set<number>()
  for (let head = 0; head < stack.length; head += 1) {
    const state = stack[head]
    if (seen.has(state)) continue
    seen.add(state)
    const cell = state >> 2
    const entry = state & 3
    lit[cell] = true
    beams[cell] |= 1 << ((entry + 2) % 4)
    const row = Math.floor(cell / cols)
    const col = cell % cols
    for (const exit of pieceExits(pieces[cell] ?? PIECE_NONE, entry)) {
      beams[cell] |= 1 << exit
      const nr = row + DIR_DR[exit]
      const nc = col + DIR_DC[exit]
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      const next = nr * cols + nc
      lit[next] = true
      if (blocks[next]) {
        beams[next] |= 1 << ((exit + 2) % 4)
        continue
      }
      stack.push(next * 4 + exit)
    }
  }
  const litCount = lit.reduce((sum, on) => sum + (on ? 1 : 0), 0)
  return { lit, beams, litCount }
}

export function coversAll(state: BeamState, targets: readonly number[]) {
  return targets.every((cell) => state.lit[cell])
}

export interface BeamPuzzle {
  readonly rows: number
  readonly cols: number
  readonly source: number
  readonly sourceDir: number
  readonly blocks: readonly boolean[]
  readonly slots: readonly number[]
  readonly targets: readonly number[]
  readonly allowSplitter: boolean
  readonly blackBox: boolean
  readonly budget: number | undefined
  readonly solution: readonly number[]
  readonly par: number
  readonly depth: number
}

function litCells(trace: BeamState) {
  return trace.lit.reduce<number[]>((list, on, cell) => { if (on) list.push(cell); return list }, [])
}

export function generateBeamPuzzle(level: number): BeamPuzzle {
  const safe = Math.min(BEAM_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const spec = getBeamLevel(safe)
  const rows = spec.rows
  const cols = spec.cols
  const total = rows * cols
  const rng = mulberry32(seedFor(safe, 29))
  const pieceNeed = spec.mirrors + spec.splitters
  const runLength = (cell: number, dir: number, walls: readonly boolean[]) => {
    let row = Math.floor(cell / cols) + DIR_DR[dir]
    let col = (cell % cols) + DIR_DC[dir]
    let steps = 0
    while (row >= 0 && row < rows && col >= 0 && col < cols && !walls[row * cols + col]) {
      steps += 1
      row += DIR_DR[dir]
      col += DIR_DC[dir]
    }
    return steps
  }
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const source = Math.floor(rng() * total)
    const sourceDir = Math.floor(rng() * 4)
    const others = shuffle(rng, Array.from({ length: total }, (_, cell) => cell).filter((cell) => cell !== source))
    const blocks = Array.from({ length: total }, () => false)
    others.slice(0, spec.blocks).forEach((cell) => { blocks[cell] = true })
    const solution = Array.from({ length: total }, () => PIECE_NONE)
    const used = new Set<number>([source])
    const cursors: [number, number][] = [[source, sourceDir]]
    let placed = 0
    while (placed < pieceNeed && cursors.length > 0) {
      const order = shuffle(rng, cursors.map((_, index) => index))
      let chosen = -1
      let ahead: number[] = []
      for (const index of order) {
        const [cell, dir] = cursors[index]
        const options: number[] = []
        let row = Math.floor(cell / cols) + DIR_DR[dir]
        let col = (cell % cols) + DIR_DC[dir]
        while (row >= 0 && row < rows && col >= 0 && col < cols) {
          const probe = row * cols + col
          if (blocks[probe] || used.has(probe)) break
          options.push(probe)
          row += DIR_DR[dir]
          col += DIR_DC[dir]
        }
        if (options.length > 0) { chosen = index; ahead = options; break }
      }
      if (chosen < 0) break
      const [, dir] = cursors[chosen]
      const cell = ahead[Math.floor(rng() * ahead.length)]
      const splitter = placed >= spec.mirrors
      const kinds = splitter ? [PIECE_SPLIT_A, PIECE_SPLIT_B] : [PIECE_MIRROR_A, PIECE_MIRROR_B]
      const dirs = [dir ^ 1, 3 - dir]
      let pick = 0
      const deep = [0, 1].filter((side) => runLength(cell, dirs[side], blocks) >= 2)
      if (deep.length > 0) pick = deep[Math.floor(rng() * deep.length)]
      solution[cell] = kinds[pick]
      used.add(cell)
      placed += 1
      cursors[chosen] = [cell, dirs[pick]]
      if (splitter) cursors.push([cell, dir])
    }
    if (placed < pieceNeed) continue
    const trace = traceBeam(rows, cols, solution, blocks, source, sourceDir)
    if (trace.litCount < spec.minCovered) continue
    const targets = litCells(trace)
    const bare = traceBeam(rows, cols, solution.map(() => PIECE_NONE), blocks, source, sourceDir)
    if (coversAll(bare, targets)) continue
    const free = others.filter((cell) => !trace.lit[cell] && !blocks[cell])
    if (free.length < spec.decoys) continue
    const slots = shuffle(rng, [...used].filter((cell) => cell !== source).concat(free.slice(0, spec.decoys)))
    const par = placed
    return {
      rows, cols, source, sourceDir, blocks, slots, targets,
      allowSplitter: spec.splitters > 0, blackBox: spec.blackBox,
      budget: spec.budgeted ? par * 4 + 2 : undefined, solution, par,
      depth: targets.length + spec.blocks * 4 + (spec.blackBox ? 8 : 0),
    }
  }
  // 对齐 calc-casket:160 次尝试全败说明关卡参数已退化,显式抛错而不是静默发布退化逃生舱关
  throw new Error(`beam-fold level ${safe} generation exhausted after 160 attempts without a valid puzzle`)
}

function searchBeam(puzzle: BeamPuzzle, cap: number): [number[] | null, number] {
  const options = puzzle.allowSplitter
    ? [PIECE_NONE, PIECE_MIRROR_A, PIECE_MIRROR_B, PIECE_SPLIT_A, PIECE_SPLIT_B]
    : [PIECE_NONE, PIECE_MIRROR_A, PIECE_MIRROR_B]
  const pieces = Array.from({ length: puzzle.rows * puzzle.cols }, () => PIECE_NONE)
  let found: number[] | null = null
  let count = 0
  const walk = (index: number): boolean => {
    if (index >= puzzle.slots.length) {
      const trace = traceBeam(puzzle.rows, puzzle.cols, pieces, puzzle.blocks, puzzle.source, puzzle.sourceDir)
      if (!coversAll(trace, puzzle.targets)) return false
      count += 1
      if (!found) found = [...pieces]
      return count >= cap
    }
    for (const option of options) {
      pieces[puzzle.slots[index]] = option
      if (walk(index + 1)) return true
    }
    pieces[puzzle.slots[index]] = PIECE_NONE
    return false
  }
  walk(0)
  return [found, count]
}

export function solveBeam(puzzle: BeamPuzzle): number[] | null {
  return searchBeam(puzzle, 1)[0]
}

export function countBeamSolutions(puzzle: BeamPuzzle, cap = 64): number {
  return searchBeam(puzzle, cap)[1]
}

export const MAX_MISTAKES = 3
export const MISTAKE_PENALTY = 150

export function scoreFor(ops: number, par: number, mistakes: number) {
  return Math.max(100, 1000 - Math.max(0, ops - par) * 12 - mistakes * MISTAKE_PENALTY)
}
