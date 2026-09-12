export const BLANK = 0

export function solvedTiles(columns: number, rows: number): number[] {
  return Array.from({ length: columns * rows }, (_, index) => (index + 1) % (columns * rows))
}

export function blankNeighbor(tiles: readonly number[], columns: number, direction: number): number {
  const blank = tiles.indexOf(BLANK)
  const rows = tiles.length / columns
  const row = Math.floor(blank / columns)
  const column = blank % columns
  if (direction === 0) return row > 0 ? blank - columns : -1
  if (direction === 1) return column < columns - 1 ? blank + 1 : -1
  if (direction === 2) return row < rows - 1 ? blank + columns : -1
  return column > 0 ? blank - 1 : -1
}

export function slideBlank(tiles: readonly number[], columns: number, direction: number): number[] | null {
  const neighbor = blankNeighbor(tiles, columns, direction)
  if (neighbor < 0) return null
  const next = [...tiles]
  const blank = next.indexOf(BLANK)
  ;[next[blank], next[neighbor]] = [next[neighbor], next[blank]]
  return next
}

export function slideTile(tiles: readonly number[], columns: number, index: number): number[] | null {
  if (index < 0 || index >= tiles.length || tiles[index] === BLANK) return null
  const blank = tiles.indexOf(BLANK)
  const vertical = Math.abs(index - blank) === columns
  const horizontal = Math.abs(index - blank) === 1 && Math.floor(index / columns) === Math.floor(blank / columns)
  if (!vertical && !horizontal) return null
  const next = [...tiles]
  ;[next[blank], next[index]] = [next[index], next[blank]]
  return next
}

export function tileIndexForArrow(tiles: readonly number[], columns: number, key: string): number {
  const blank = tiles.indexOf(BLANK)
  const rows = tiles.length / columns
  const row = Math.floor(blank / columns)
  const column = blank % columns
  switch (key.toLowerCase()) {
    case 'arrowup': case 'w': return row < rows - 1 ? blank + columns : -1
    case 'arrowdown': case 's': return row > 0 ? blank - columns : -1
    case 'arrowleft': case 'a': return column < columns - 1 ? blank + 1 : -1
    case 'arrowright': case 'd': return column > 0 ? blank - 1 : -1
    default: return -1
  }
}

export function tilesEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((tile, index) => tile === right[index])
}

export function isSolved(tiles: readonly number[], target: readonly number[]): boolean {
  return tilesEqual(tiles, target)
}

export function inversionParity(tiles: readonly number[]): number {
  const values = tiles.filter((tile) => tile !== BLANK)
  let inversions = 0
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) if (values[left] > values[right]) inversions += 1
  }
  return inversions % 2
}

export function solvabilityClass(tiles: readonly number[], columns: number): number {
  const rows = tiles.length / columns
  const rowFromBottom = rows - 1 - Math.floor(tiles.indexOf(BLANK) / columns)
  return columns % 2 === 1 ? inversionParity(tiles) : (inversionParity(tiles) + rowFromBottom) % 2
}

export function isSolvable(tiles: readonly number[], columns: number): boolean {
  return solvabilityClass(tiles, columns) === solvabilityClass(solvedTiles(columns, tiles.length / columns), columns)
}

export function replayWalk(tiles: readonly number[], columns: number, walk: readonly number[]): number[] {
  let current = [...tiles]
  for (let index = walk.length - 1; index >= 0; index -= 1) {
    const reverted = slideBlank(current, columns, walk[index] ^ 2)
    if (!reverted) break
    current = reverted
  }
  return current
}

export interface DriftAssessment {
  completed: boolean
  failed: boolean
}

export function assessProgress(tiles: readonly number[], target: readonly number[], moves: number, moveLimit?: number): DriftAssessment {
  const completed = tilesEqual(tiles, target)
  return { completed, failed: !completed && moveLimit !== undefined && moves >= moveLimit }
}

export function scoreFor(moves: number, par: number, fogViews = 0): number {
  return Math.max(100, 1000 - Math.max(0, moves - par) * 8 - fogViews * 30)
}
