import { mulberry32, pick, seedFor } from '../../platform/rng'
import { blankNeighbor, slideBlank, solvedTiles, tilesEqual } from './logic'

export const DRIFT_LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const

export interface DriftLevel {
  readonly level: number
  readonly chapter: number
  readonly rows: number
  readonly columns: number
  readonly target: readonly number[]
  readonly board: readonly number[]
  readonly par: number
  readonly walk: readonly number[]
  readonly fog: boolean
  readonly seed: number
}

export function clampLevel(level: number): number {
  return Math.min(DRIFT_LEVEL_COUNT, Math.max(1, Math.floor(level)))
}

export function driftChapter(level: number): number {
  const safe = clampLevel(level)
  return CHAPTER_STARTS.filter((start) => safe >= start).length
}

export function scrambleSteps(level: number): number {
  const safe = clampLevel(level)
  if (safe <= 11) return 20 + (safe - 1) * 2
  if (safe <= 22) return 90 + (safe - 12) * 3
  if (safe <= 33) return 121 + (safe - 23)
  if (safe <= 44) return 200 + (safe - 34) * 6
  return 261 + (safe - 45)
}

export function fogDrift(level: number): number {
  return 6 + ((clampLevel(level) * 7) % 9)
}

function randomWalk(start: readonly number[], columns: number, steps: number, random: () => number): { tiles: number[]; walk: number[] } {
  let tiles = [...start]
  const walk: number[] = []
  let previous = -1
  while (walk.length < steps) {
    const reachable = [0, 1, 2, 3].filter((direction) => blankNeighbor(tiles, columns, direction) >= 0)
    const candidates = reachable.length > 1 ? reachable.filter((direction) => direction !== (previous ^ 2)) : reachable
    const direction = pick(random, candidates)
    const moved = slideBlank(tiles, columns, direction)
    if (!moved) break
    tiles = moved
    walk.push(direction)
    previous = direction
  }
  return { tiles, walk }
}

function build(level: number, salt: number): DriftLevel {
  const chapter = driftChapter(level)
  const columns = chapter >= 4 ? 5 : chapter >= 2 ? 4 : 3
  const rows = columns
  const fog = chapter === 3 || chapter === 5
  const seed = seedFor(level, 17 + salt)
  const random = mulberry32(seed)
  let target: number[] = solvedTiles(columns, rows)
  if (fog) target = randomWalk(target, columns, fogDrift(level), random).tiles
  const scrambled = randomWalk(target, columns, scrambleSteps(level), random)
  return { level, chapter, rows, columns, target, board: scrambled.tiles, par: scrambled.walk.length, walk: scrambled.walk, fog, seed }
}

function isTrivial(candidate: DriftLevel): boolean {
  return tilesEqual(candidate.board, candidate.target) || (candidate.fog && tilesEqual(candidate.target, solvedTiles(candidate.columns, candidate.rows)))
}

export function createDriftLevel(level: number): DriftLevel {
  const safe = clampLevel(level)
  let salt = 0
  let candidate = build(safe, salt)
  while (isTrivial(candidate) && salt < 9) candidate = build(safe, (salt += 1))
  return candidate
}

export function createDriftBoard(level: number): number[] {
  return [...createDriftLevel(level).board]
}
