export type Grid = boolean[]

export function crossOf(index: number, cols: number, rows: number): number[] {
  const row = Math.floor(index / cols)
  const col = index % cols
  return [
    [row, col], [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
  ].filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols).map(([r, c]) => r * cols + c)
}

export function toggleAt(grid: Grid, index: number, cols: number): Grid {
  const rows = grid.length / cols
  const next = [...grid]
  for (const cell of crossOf(index, cols, rows)) next[cell] = !next[cell]
  return next
}

export function applyPresses(grid: Grid, presses: readonly number[], cols: number): Grid {
  return presses.reduce((state, cell) => toggleAt(state, cell, cols), [...grid])
}

export function darkGrid(size: number): Grid {
  return Array.from({ length: size }, () => false)
}

export function isDark(grid: Grid) {
  return grid.every((lit) => !lit)
}

export function litCount(grid: Grid) {
  return grid.reduce((total, lit) => total + (lit ? 1 : 0), 0)
}

export const FAIL_PENALTY = 250

export function scoreFor(moves: number, par: number) {
  return Math.max(100, 1000 - Math.max(0, moves - par) * 20)
}

export function failedScore(moves: number, par: number) {
  return Math.max(0, scoreFor(moves, par) - FAIL_PENALTY)
}

export function isBudgetSpent(moves: number, budget: number | undefined) {
  return budget !== undefined && moves >= budget
}
