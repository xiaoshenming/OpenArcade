import { mulberry32 } from '../../platform/rng'

export type CellMark = 0 | 1 | 2 | 3
export const EMPTY = 0
export const FILLED = 1
export const CROSSED = 2
export const ERROR = 3

export interface SilkPuzzle {
  size: number
  pattern: number[]
  rowClues: number[][]
  colClues: number[][]
  density: number
  lineSolvable: boolean
}

export function lineClue(cells: readonly number[]): number[] {
  const runs: number[] = []
  let run = 0
  for (const cell of cells) {
    if (cell === FILLED) run += 1
    else if (run) { runs.push(run); run = 0 }
  }
  if (run) runs.push(run)
  return runs
}

export function computeClues(pattern: readonly number[], size: number) {
  const rowClues = Array.from({ length: size }, (_, row) => lineClue(pattern.slice(row * size, row * size + size)))
  const colClues = Array.from({ length: size }, (_, col) => lineClue(Array.from({ length: size }, (_, row) => pattern[row * size + col])))
  return { rowClues, colClues }
}

const placementCache = new Map<string, number[]>()

function linePlacements(length: number, clue: readonly number[]): number[] {
  const runs = clue.filter((run) => run > 0)
  const key = `${length}|${runs.join(',')}`
  const cached = placementCache.get(key)
  if (cached) return cached
  const placements: number[] = []
  const walk = (start: number, run: number, mask: number) => {
    if (run === runs.length) { placements.push(mask); return }
    const tail = runs.slice(run + 1).reduce((sum, value) => sum + value + 1, 0)
    const last = length - tail - runs[run]
    for (let at = start; at <= last; at += 1) {
      let next = mask
      for (let offset = 0; offset < runs[run]; offset += 1) next |= 1 << (at + offset)
      walk(at + runs[run] + 1, run + 1, next)
    }
  }
  walk(0, 0, 0)
  placementCache.set(key, placements)
  return placements
}

export interface LineNarrowing { line: number[]; contradictory: boolean }

export function solveLine(clue: readonly number[], line: readonly number[]): LineNarrowing {
  const length = line.length
  const all = (1 << length) - 1
  let filledKnown = 0
  let emptyKnown = 0
  line.forEach((state, index) => {
    if (state === FILLED) filledKnown |= 1 << index
    else if (state === EMPTY) emptyKnown |= 1 << index
  })
  let filled = all
  let empty = all
  let viable = 0
  for (const placement of linePlacements(length, clue)) {
    if ((placement & filledKnown) !== filledKnown || (placement & emptyKnown) !== 0) continue
    viable += 1
    filled &= placement
    empty &= ~placement
  }
  if (!viable) return { line: [...line], contradictory: true }
  return {
    line: line.map((state, index) => {
      const bit = 1 << index
      if (filled & bit) return FILLED
      if (empty & bit) return EMPTY
      return state
    }),
    contradictory: false,
  }
}

export interface Propagation { rows: number[][]; cols: number[][]; contradictory: boolean }

export function propagate(rowClues: readonly (readonly number[])[], colClues: readonly (readonly number[])[]): Propagation {
  const size = rowClues.length
  const rows = Array.from({ length: size }, () => Array<number>(size).fill(-1))
  const cols = Array.from({ length: size }, () => Array<number>(size).fill(-1))
  let contradictory = false
  let changed = true
  while (changed && !contradictory) {
    changed = false
    for (let row = 0; row < size && !contradictory; row += 1) {
      const result = solveLine(rowClues[row], rows[row])
      if (result.contradictory) { contradictory = true; break }
      result.line.forEach((cell, col) => {
        if (cell !== -1 && rows[row][col] === -1) { rows[row][col] = cell; cols[col][row] = cell; changed = true }
      })
    }
    for (let col = 0; col < size && !contradictory; col += 1) {
      const result = solveLine(colClues[col], cols[col])
      if (result.contradictory) { contradictory = true; break }
      result.line.forEach((cell, row) => {
        if (cell !== -1 && cols[col][row] === -1) { cols[col][row] = cell; rows[row][col] = cell; changed = true }
      })
    }
  }
  return { rows, cols, contradictory }
}

export function isLineSolvable(rowClues: readonly (readonly number[])[], colClues: readonly (readonly number[])[]): boolean {
  const { rows, contradictory } = propagate(rowClues, colClues)
  return !contradictory && rows.every((line) => line.every((cell) => cell !== -1))
}

function neighbors(index: number, size: number) {
  const row = Math.floor(index / size)
  const col = index % size
  const list: number[] = []
  if (row > 0) list.push(index - size)
  if (row < size - 1) list.push(index + size)
  if (col > 0) list.push(index - 1)
  if (col < size - 1) list.push(index + 1)
  return list
}

function growPattern(random: () => number, size: number, target: number): number[] {
  const pattern = Array<number>(size * size).fill(EMPTY)
  let filled = 0
  while (filled < target) {
    const free: number[] = []
    for (let index = 0; index < pattern.length; index += 1) if (!pattern[index]) free.push(index)
    if (!free.length) break
    const start = free[Math.floor(random() * free.length) % free.length]
    pattern[start] = FILLED
    filled += 1
    const frontier = [start]
    while (filled < target && frontier.length) {
      const growing: number[] = []
      frontier.forEach((cell, at) => { if (neighbors(cell, size).some((next) => !pattern[next])) growing.push(at) })
      if (!growing.length) { frontier.length = 0; break }
      const at = growing[Math.floor(random() * growing.length) % growing.length]
      const open = neighbors(frontier[at], size).filter((next) => !pattern[next])
      const next = open[Math.floor(random() * open.length) % open.length]
      pattern[next] = FILLED
      filled += 1
      frontier.splice(at, 1)
      if (neighbors(next, size).some((cell) => !pattern[cell])) frontier.push(next)
    }
  }
  return pattern
}

function fallbackPattern(size: number): number[] {
  return Array.from({ length: size * size }, (_, index) => (Math.floor(index / size) % 2 === 0 ? FILLED : EMPTY))
}

export function generatePuzzle(seedBase: number, size: number, density: number): SilkPuzzle {
  let attemptDensity = Math.min(0.62, Math.max(0.35, density))
  for (let round = 0; round < 3; round += 1) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const seed = (seedBase + attempt * 0x9e3779b1 + round * 0x85ebca6b) >>> 0
      const pattern = growPattern(mulberry32(seed), size, Math.round(size * size * attemptDensity))
      const { rowClues, colClues } = computeClues(pattern, size)
      if (isLineSolvable(rowClues, colClues)) {
        const filled = pattern.filter((cell) => cell === FILLED).length
        return { size, pattern, rowClues, colClues, density: filled / (size * size), lineSolvable: true }
      }
    }
    attemptDensity = Math.max(0.4, attemptDensity - 0.05)
  }
  const pattern = fallbackPattern(size)
  const { rowClues, colClues } = computeClues(pattern, size)
  const filled = pattern.filter((cell) => cell === FILLED).length
  return { size, pattern, rowClues, colClues, density: filled / (size * size), lineSolvable: isLineSolvable(rowClues, colClues) }
}

export function lineDone(patternLine: readonly number[], markLine: readonly CellMark[]): boolean {
  return patternLine.every((cell, index) => (cell === FILLED) === (markLine[index] === FILLED))
}

export function puzzleComplete(pattern: readonly number[], marks: readonly CellMark[]): boolean {
  return pattern.every((cell, index) => cell === EMPTY || marks[index] === FILLED)
}

export function scoreFor(mistakes: number, elapsed: number, par: number): number {
  return Math.max(100, 1000 - mistakes * 80 - Math.max(0, Math.floor((elapsed - par) / 10)) * 12)
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}
