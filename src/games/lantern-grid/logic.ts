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
export const SCORE_BASE = 1000
export const SCORE_FLOOR = 100
export const SCORE_CAP = 5000
export const PENALTY_PER_MOVE = 20
export const BONUS_PER_SPARE_MOVE = 15

// 预算章按剩余预算×15 计余量奖励,无预算章按 ceil(par×1.5)−步数 的富余×10,
// 使分数空间与 scorePolicy.max 口径对齐,上限仍钳制在 SCORE_CAP。
export function scoreFor(moves: number, par: number, budget?: number) {
  const penalty = Math.max(0, moves - par) * PENALTY_PER_MOVE
  const spare = budget !== undefined
    ? Math.max(0, budget - moves) * BONUS_PER_SPARE_MOVE
    : Math.max(0, Math.ceil(par * 1.5) - moves) * 10
  return Math.min(SCORE_CAP, Math.max(SCORE_FLOOR, SCORE_BASE - penalty + spare))
}

export function failedScore(moves: number, par: number, budget?: number) {
  return Math.max(0, scoreFor(moves, par, budget) - FAIL_PENALTY)
}

export function isBudgetSpent(moves: number, budget: number | undefined) {
  return budget !== undefined && moves >= budget
}
