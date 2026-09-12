export type LoomDir = 1 | -1
export type LoomKind = 'paint' | 'row' | 'col' | 'rot'
export type LoomTool = 'paint' | 'shift' | 'rotate'

export interface LoomOp {
  readonly kind: LoomKind
  readonly row: number
  readonly col: number
  readonly dir: LoomDir
}

export interface LoomLevel {
  readonly size: number
  readonly target: readonly (readonly number[])[]
  readonly start: readonly (readonly number[])[]
  readonly par: number
  readonly quota: number
  readonly solution: readonly LoomOp[]
}

const mod = (value: number, size: number) => ((value % size) + size) % size

export const paintOp = (row: number, col: number): LoomOp => ({ kind: 'paint', row, col, dir: 1 })
export const rowOp = (row: number, dir: LoomDir): LoomOp => ({ kind: 'row', row, col: 0, dir })
export const colOp = (col: number, dir: LoomDir): LoomOp => ({ kind: 'col', row: 0, col, dir })
export const rotOp = (row: number, col: number, dir: LoomDir): LoomOp => ({ kind: 'rot', row, col, dir })

export function opTool(op: LoomOp): LoomTool {
  return op.kind === 'paint' ? 'paint' : op.kind === 'rot' ? 'rotate' : 'shift'
}

export function applyOp(grid: readonly (readonly number[])[], op: LoomOp): number[][] {
  const size = grid.length
  const next = grid.map((line) => [...line])
  if (op.kind === 'paint') {
    if (op.row < 0 || op.col < 0 || op.row >= size || op.col >= size) return next
    next[op.row][op.col] = next[op.row][op.col] ? 0 : 1
    return next
  }
  if (op.kind === 'row') {
    if (op.row < 0 || op.row >= size) return next
    for (let col = 0; col < size; col += 1) next[op.row][mod(col + op.dir, size)] = grid[op.row][col]
    return next
  }
  if (op.kind === 'col') {
    if (op.col < 0 || op.col >= size) return next
    for (let row = 0; row < size; row += 1) next[mod(row + op.dir, size)][op.col] = grid[row][op.col]
    return next
  }
  if (op.row < 0 || op.col < 0 || op.row + 1 >= size || op.col + 1 >= size) return next
  const [a, b] = [grid[op.row][op.col], grid[op.row][op.col + 1]]
  const [c, d] = [grid[op.row + 1][op.col], grid[op.row + 1][op.col + 1]]
  if (op.dir === 1) {
    next[op.row][op.col] = c
    next[op.row][op.col + 1] = a
    next[op.row + 1][op.col] = d
    next[op.row + 1][op.col + 1] = b
  } else {
    next[op.row][op.col] = b
    next[op.row][op.col + 1] = d
    next[op.row + 1][op.col] = a
    next[op.row + 1][op.col + 1] = c
  }
  return next
}

export const opInverse = (op: LoomOp): LoomOp => (op.kind === 'paint' ? op : { ...op, dir: op.dir === 1 ? -1 : 1 })

export const sameOp = (a: LoomOp, b: LoomOp) => a.kind === b.kind && a.row === b.row && a.col === b.col && a.dir === b.dir

export const cancels = (op: LoomOp, last: LoomOp) =>
  sameOp(opInverse(op), last) || (op.kind === 'rot' && last.kind === 'rot' && op.row === last.row && op.col === last.col)

export function gridsEqual(a: readonly (readonly number[])[], b: readonly (readonly number[])[]) {
  return a.length === b.length && a.every((line, row) => line.length === b[row].length && line.every((cell, col) => cell === b[row][col]))
}

export function diffCount(a: readonly (readonly number[])[], b: readonly (readonly number[])[]) {
  let count = 0
  a.forEach((line, row) => line.forEach((cell, col) => { if (cell !== b[row]?.[col]) count += 1 }))
  return count
}

export const opChanges = (grid: readonly (readonly number[])[], op: LoomOp) => !gridsEqual(applyOp(grid, op), grid)
