export type TangramFamily = 'I' | 'L' | 'T' | 'S' | 'Z' | 'O'
export type Cells = [number, number][]

export const TANGRAM_COLORS = ['#fb923c', '#2fd6b8', '#ffc94d', '#7aa2ff', '#ff5f7e', '#c084fc', '#4ade80', '#9db2d8'] as const
export const MAX_MISSES = 3

export function normalize(cells: Cells): Cells {
  const minRow = Math.min(...cells.map((cell) => cell[0]))
  const minCol = Math.min(...cells.map((cell) => cell[1]))
  const moved = cells.map(([row, col]) => [row - minRow, col - minCol] as [number, number])
  moved.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return moved
}

export function rotateCells(cells: Cells): Cells {
  const height = Math.max(...cells.map((cell) => cell[0])) + 1
  return normalize(cells.map(([row, col]) => [col, height - 1 - row] as [number, number]))
}

export function orientCells(base: Cells, orientation: number): Cells {
  let cells = base
  const turns = ((orientation % 4) + 4) % 4
  for (let step = 0; step < turns; step += 1) cells = rotateCells(cells)
  return cells
}

export function orientationSet(base: Cells): Cells[] {
  const out: Cells[] = []
  const seen = new Set<string>()
  let cells = base
  for (let step = 0; step < 4; step += 1) {
    const key = JSON.stringify(cells)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(cells)
    }
    cells = rotateCells(cells)
  }
  return out
}

export interface ShapeCandidate {
  family: TangramFamily
  base: Cells
}

export function shapeCandidates(family: TangramFamily, size: number, rows: number, cols: number): ShapeCandidate[] {
  const out: ShapeCandidate[] = []
  const fits = (cells: Cells) =>
    Math.max(...cells.map((cell) => cell[0])) + 1 <= rows && Math.max(...cells.map((cell) => cell[1])) + 1 <= cols
  if (family === 'I') {
    const cells = Array.from({ length: size }, (_, col) => [0, col] as [number, number])
    if (size >= 2 && fits(cells)) out.push({ family, base: cells })
  }
  if (family === 'L') {
    for (let a = 2; a <= size - 1; a += 1) {
      const b = size + 1 - a
      if (b < 2) break
      const cells: Cells = []
      for (let row = 0; row < a; row += 1) cells.push([row, 0])
      for (let col = 1; col < b; col += 1) cells.push([a - 1, col])
      if (fits(cells)) out.push({ family, base: cells })
    }
  }
  if (family === 'T') {
    for (const width of [3, 5]) {
      const height = size + 1 - width
      if (width > cols || height < 2) continue
      const mid = (width - 1) / 2
      const cells: Cells = []
      for (let col = 0; col < width; col += 1) cells.push([0, col])
      for (let row = 1; row < height; row += 1) cells.push([row, mid])
      if (fits(cells)) out.push({ family, base: cells })
    }
  }
  if (family === 'S' || family === 'Z') {
    if (size >= 4 && size % 2 === 0) {
      const legs = size / 2
      const cells: Cells = []
      for (let row = 0; row < legs; row += 1) {
        const offset = family === 'S' ? row : legs - 1 - row
        cells.push([row, offset], [row, offset + 1])
      }
      if (fits(cells)) out.push({ family, base: cells })
    }
  }
  if (family === 'O') {
    for (let a = 2; a * a <= size; a += 1) {
      if (size % a !== 0) continue
      const b = size / a
      const cells: Cells = []
      for (let row = 0; row < a; row += 1) for (let col = 0; col < b; col += 1) cells.push([row, col])
      if (fits(cells)) out.push({ family, base: cells })
    }
  }
  return out
}

export interface TangramPiece {
  family: TangramFamily
  size: number
  base: Cells
  orientation: number
  color: number
}

export interface TangramPuzzle {
  pieces: TangramPiece[]
  anchors: number[]
  solOrientations: number[]
}


export interface TangramBlock {
  id: number
  family: TangramFamily
  size: number
  base: Cells
  orientation: number
  color: number
}

export interface TangramSpec {
  rows: number
  cols: number
  blocks: TangramBlock[]
  fixed: number[]
  solution: number[]
  solOrientations: number[]
  par: number
  moveLimit?: number
  rotateLocked: boolean
}

export interface TangramState {
  orientations: number[]
  placements: (number | null)[]
  ops: number
  misses: number
}

export interface TangramVerdict {
  placed: number
  covered: number
  overlap: boolean
  overflow: boolean
  solved: boolean
}

export function createTangramState(spec: TangramSpec): TangramState {
  return {
    orientations: spec.blocks.map((block, id) => (spec.fixed.includes(id) ? spec.solOrientations[id] : block.orientation)),
    placements: spec.blocks.map((_, id) => (spec.fixed.includes(id) ? spec.solution[id] : null)),
    ops: 0,
    misses: 0,
  }
}

export const blockCells = (block: TangramBlock, orientation: number) => orientCells(block.base, orientation)

function ownerMap(rows: number, cols: number, blocks: readonly TangramBlock[], orientations: readonly number[], placements: readonly (number | null)[]) {
  const total = rows * cols
  const owner = new Int16Array(total).fill(-1)
  let covered = 0
  let overlap = false
  let overflow = false
  let placed = 0
  blocks.forEach((block, id) => {
    const anchor = placements[id]
    if (anchor === null || anchor === undefined || anchor < 0 || anchor >= total) return
    placed += 1
    const r0 = Math.floor(anchor / cols)
    const c0 = anchor - r0 * cols
    for (const [dr, dc] of blockCells(block, orientations[id])) {
      const row = r0 + dr
      const col = c0 + dc
      if (row < 0 || row >= rows || col < 0 || col >= cols) {
        overflow = true
        continue
      }
      const cell = row * cols + col
      if (owner[cell] >= 0) overlap = true
      else {
        owner[cell] = id
        covered += 1
      }
    }
  })
  return { owner, covered, overlap, overflow, placed, total }
}

export function judgeTangram(rows: number, cols: number, blocks: readonly TangramBlock[], orientations: readonly number[], placements: readonly (number | null)[]): TangramVerdict {
  const map = ownerMap(rows, cols, blocks, orientations, placements)
  return {
    placed: map.placed,
    covered: map.covered,
    overlap: map.overlap,
    overflow: map.overflow,
    solved: map.placed === blocks.length && map.covered === map.total && !map.overlap && !map.overflow,
  }
}

export function coveredOwner(rows: number, cols: number, blocks: readonly TangramBlock[], orientations: readonly number[], placements: readonly (number | null)[]) {
  return ownerMap(rows, cols, blocks, orientations, placements).owner
}

export interface StepResult {
  state: TangramState
  applied: boolean
}

export function fitsAt(rows: number, cols: number, cells: Cells, anchor: number, owner: Int16Array): boolean {
  const r0 = Math.floor(anchor / cols)
  const c0 = anchor - r0 * cols
  for (const [dr, dc] of cells) {
    const row = r0 + dr
    const col = c0 + dc
    if (row < 0 || row >= rows || col < 0 || col >= cols) return false
    if (owner[row * cols + col] >= 0) return false
  }
  return true
}

export function applyPlace(spec: TangramSpec, state: TangramState, blockId: number, anchor: number): StepResult {
  const total = spec.rows * spec.cols
  const invalidBlock = blockId < 0 || blockId >= spec.blocks.length || state.placements[blockId] !== null
  if (invalidBlock || anchor < 0 || anchor >= total) return { state, applied: false }
  const cells = blockCells(spec.blocks[blockId], state.orientations[blockId])
  if (!fitsAt(spec.rows, spec.cols, cells, anchor, coveredOwner(spec.rows, spec.cols, spec.blocks, state.orientations, state.placements))) {
    return { state: { ...state, misses: state.misses + 1 }, applied: false }
  }
  return {
    state: { ...state, placements: state.placements.map((spot, id) => (id === blockId ? anchor : spot)), ops: state.ops + 1 },
    applied: true,
  }
}

export function applyRotate(spec: TangramSpec, state: TangramState, blockId: number): StepResult {
  const blocked = spec.rotateLocked || spec.fixed.includes(blockId) || state.placements[blockId] !== null
  if (blocked || blockId < 0 || blockId >= spec.blocks.length) return { state, applied: false }
  return {
    state: { ...state, orientations: state.orientations.map((value, id) => (id === blockId ? (value + 1) % 4 : value)), ops: state.ops + 1 },
    applied: true,
  }
}

export function applyRemove(spec: TangramSpec, state: TangramState, blockId: number): StepResult {
  if (spec.fixed.includes(blockId) || state.placements[blockId] === null) return { state, applied: false }
  return { state: { ...state, placements: state.placements.map((spot, id) => (id === blockId ? null : spot)) }, applied: true }
}

export const scoreFor = (ops: number, par: number, misses = 0) => Math.max(100, 1000 - Math.max(0, ops - par) * 15 - misses * 50)
