import { mulberry32, seedFor } from '../../platform/rng'
import { getGemLevel, type GemLevel } from './levels'

export const SIZE = 7
export const CELLS = SIZE * SIZE
export const COLORS = 6
export const GEM_SCORE = 20
export const CHAIN_CAP = 5
export const JELLY_HITS = 2

export interface BoardState {
  colors: number[]
  locks: boolean[]
  jelly: number[]
}

export interface ResolveResult {
  state: BoardState
  valid: boolean
  cleared: number
  perColor: number[]
  gained: number
  waves: number
  waveCounts: number[]
  unlocked: number
  jellyHits: number
  clearedCells: number[]
  changed: number[]
}

export interface GoalSummary {
  done: boolean
  progress: number
  label: string
}

export const rowOf = (index: number) => Math.floor(index / SIZE)
export const colOf = (index: number) => index % SIZE

export function areAdjacent(a: number, b: number) {
  return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)) === 1
}

export function chainMultiplier(wave: number) {
  return Math.min(CHAIN_CAP, Math.max(1, wave))
}

export function findMatches(colors: readonly number[]): boolean[] {
  const mask = new Array<boolean>(CELLS).fill(false)
  const scan = (map: (position: number) => number) => {
    for (let line = 0; line < SIZE; line += 1) {
      let runStart = 0
      for (let step = 1; step <= SIZE; step += 1) {
        const current = step < SIZE ? colors[map(line * SIZE + step)] : -1
        const previous = colors[map(line * SIZE + step - 1)]
        if (current < 0 || current !== previous) {
          if (previous >= 0 && step - runStart >= 3) {
            for (let back = runStart; back < step; back += 1) mask[map(line * SIZE + back)] = true
          }
          runStart = step
        }
      }
    }
  }
  scan((position) => position)
  scan((position) => colOf(position) * SIZE + rowOf(position))
  return mask
}

export function findValidSwaps(colors: readonly number[], locks: readonly boolean[]): Array<[number, number]> {
  const swaps: Array<[number, number]> = []
  const probe = (index: number, other: number) => {
    if (locks[index] || locks[other]) return
    const next = [...colors]
    ;[next[index], next[other]] = [next[other], next[index]]
    if (findMatches(next).some(Boolean)) swaps.push([index, other])
  }
  for (let index = 0; index < CELLS; index += 1) {
    if (colOf(index) < SIZE - 1) probe(index, index + 1)
    if (rowOf(index) < SIZE - 1) probe(index, index + SIZE)
  }
  return swaps
}

export function hasValidSwap(colors: readonly number[], locks: readonly boolean[]) {
  return findValidSwaps(colors, locks).length > 0
}

function settle(colors: number[], locks: readonly boolean[], random: () => number, changed: number[]) {
  for (let col = 0; col < SIZE; col += 1) {
    let segmentTop = 0
    for (let row = 0; row <= SIZE; row += 1) {
      if (row < SIZE && !locks[row * SIZE + col]) continue
      let write = row - 1
      for (let depth = row - 1; depth >= segmentTop; depth -= 1) {
        const index = depth * SIZE + col
        if (colors[index] < 0) continue
        const target = write * SIZE + col
        if (target !== index) {
          colors[target] = colors[index]
          colors[index] = -1
          changed.push(target)
        }
        write -= 1
      }
      for (let depth = write; depth >= segmentTop; depth -= 1) {
        colors[depth * SIZE + col] = Math.floor(random() * COLORS)
        changed.push(depth * SIZE + col)
      }
      segmentTop = row + 1
    }
  }
}

export function resolveSwap(state: BoardState, a: number, b: number, random: () => number): ResolveResult {
  const idle: ResolveResult = {
    state: { colors: [...state.colors], locks: [...state.locks], jelly: [...state.jelly] }, valid: false, cleared: 0,
    perColor: new Array(COLORS).fill(0), gained: 0, waves: 0, waveCounts: [], unlocked: 0, jellyHits: 0, clearedCells: [], changed: [],
  }
  if (!areAdjacent(a, b) || a < 0 || b < 0 || a >= CELLS || b >= CELLS) return idle
  if (state.locks[a] || state.locks[b] || state.colors[a] < 0 || state.colors[b] < 0) return idle
  const colors = [...state.colors]
  const locks = [...state.locks]
  const jelly = [...state.jelly]
  ;[colors[a], colors[b]] = [colors[b], colors[a]]
  let mask = findMatches(colors)
  if (!mask.some(Boolean)) return idle
  const perColor = new Array(COLORS).fill(0)
  const clearedCells: number[] = []
  const changed: number[] = []
  const waveCounts: number[] = []
  let gained = 0
  let unlocked = 0
  let jellyHits = 0
  let wave = 0
  while (mask.some(Boolean)) {
    wave += 1
    let count = 0
    for (let index = 0; index < CELLS; index += 1) {
      if (!mask[index]) continue
      count += 1
      perColor[colors[index]] += 1
      clearedCells.push(index)
      if (locks[index]) {
        locks[index] = false
        unlocked += 1
      }
      if (jelly[index] > 0) {
        jelly[index] -= 1
        jellyHits += 1
      }
      colors[index] = -1
    }
    gained += GEM_SCORE * chainMultiplier(wave) * count
    waveCounts.push(count)
    settle(colors, locks, random, changed)
    mask = findMatches(colors)
  }
  return { state: { colors, locks, jelly }, valid: true, cleared: clearedCells.length, perColor, gained, waves: wave, waveCounts, unlocked, jellyHits, clearedCells, changed }
}

export function shuffleBoard(state: BoardState, random: () => number): BoardState {
  const cells = state.colors.map((_, index) => index).filter((index) => !state.locks[index])
  const values = cells.map((index) => state.colors[index])
  let fallback: number[] | null = null
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const order = [...values]
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1))
      ;[order[index], order[swap]] = [order[swap], order[index]]
    }
    const colors = [...state.colors]
    cells.forEach((cell, offset) => { colors[cell] = order[offset] })
    if (findMatches(colors).some(Boolean)) continue
    if (hasValidSwap(colors, state.locks)) return { ...state, colors }
    fallback = colors
  }
  return fallback ? { ...state, colors: fallback } : { ...state, colors: [...state.colors] }
}

function placeCells(random: () => number, flags: boolean[], count: number, minRow: number) {
  let placed = 0
  for (let guard = 0; placed < count && guard < 400; guard += 1) {
    const row = minRow + Math.floor(random() * (SIZE - minRow))
    const index = row * SIZE + Math.floor(random() * SIZE)
    if (!flags[index]) {
      flags[index] = true
      placed += 1
    }
  }
}

function buildBoard(spec: GemLevel, salt: number): BoardState {
  const random = mulberry32(seedFor(spec.level, salt))
  const locks = new Array<boolean>(CELLS).fill(false)
  const jellyFlags = new Array<boolean>(CELLS).fill(false)
  placeCells(random, locks, spec.locks ?? 0, 3)
  placeCells(random, jellyFlags, spec.jelly ?? 0, 0)
  const jelly = jellyFlags.map((flag) => (flag ? JELLY_HITS : 0))
  const colors = new Array<number>(CELLS).fill(0)
  for (let index = 0; index < CELLS; index += 1) {
    const row = rowOf(index)
    let color = 0
    for (let guard = 0; guard < 24; guard += 1) {
      color = Math.floor(random() * COLORS)
      const leftRun = colOf(index) >= 2 && colors[index - 1] === color && colors[index - 2] === color
      const upRun = row >= 2 && colors[index - SIZE] === color && colors[index - 2 * SIZE] === color
      if (!leftRun && !upRun) break
    }
    colors[index] = color
  }
  return { colors, locks, jelly }
}

function injectSwap(board: BoardState): BoardState {
  for (let row = 1; row < SIZE - 1; row += 1) {
    for (let col = 0; col < SIZE - 1; col += 1) {
      const pivot = row * SIZE + col
      const partner = pivot + 1
      if (board.locks[pivot] || board.locks[partner] || board.locks[partner - SIZE] || board.locks[partner + SIZE]) continue
      for (let color = 0; color < COLORS; color += 1) {
        const colors = [...board.colors]
        colors[pivot] = color
        colors[partner - SIZE] = color
        colors[partner + SIZE] = color
        if (!findMatches(colors).some(Boolean)) return { ...board, colors }
      }
    }
  }
  return board
}

export function createGemBoard(level: number): BoardState {
  const spec = getGemLevel(level)
  for (let salt = 0; salt < 120; salt += 1) {
    const board = buildBoard(spec, salt)
    if (hasValidSwap(board.colors, board.locks)) return board
  }
  return injectSwap(buildBoard(spec, 0))
}

export function goalSummary(spec: GemLevel, state: BoardState, score: number, collected: readonly number[]): GoalSummary {
  const parts: number[] = []
  const labels: string[] = []
  let done = true
  if (spec.quota !== undefined) {
    parts.push(Math.min(1, score / spec.quota))
    labels.push(`分数 ${Math.min(score, spec.quota)}/${spec.quota}`)
    done = done && score >= spec.quota
  }
  if (spec.targets) {
    const total = spec.targets.reduce((sum, target) => sum + target.count, 0)
    const got = spec.targets.reduce((sum, target) => sum + Math.min(target.count, collected[target.color] ?? 0), 0)
    parts.push(total > 0 ? got / total : 1)
    labels.push(`宝石 ${got}/${total}`)
    done = done && spec.targets.every((target) => (collected[target.color] ?? 0) >= target.count)
  }
  if (spec.jelly) {
    const total = spec.jelly * JELLY_HITS
    const left = state.jelly.reduce((sum, value) => sum + value, 0)
    parts.push(total > 0 ? (total - left) / total : 1)
    labels.push(`果冻 ${total - left}/${total}`)
    done = done && left === 0
  }
  if (spec.locks) {
    const left = state.locks.filter(Boolean).length
    parts.push(spec.locks > 0 ? (spec.locks - left) / spec.locks : 1)
    labels.push(`锁石 ${spec.locks - left}/${spec.locks}`)
    done = done && left === 0
  }
  return { done, progress: parts.length > 0 ? parts.reduce((sum, value) => sum + value, 0) / parts.length : 1, label: labels.join(' · ') }
}
