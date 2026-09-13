export const MAX_MISSES = 3

export interface ScaleSpec {
  left: number[]
  slots: number
  child: number | null
}

export interface PoolWeight {
  id: number
  weight: number
}

export interface BalanceSpec {
  scales: ScaleSpec[]
  pool: PoolWeight[]
  solution: number[][]
  par: number
  moveLimit?: number
  timeLimit?: number
}

export interface BalanceState {
  placements: (number | null)[][]
  ops: number
  misses: number
}

export interface ScaleVerdict {
  balanced: boolean[]
  tilt: number[]
  filled: number
  slots: number
  solved: boolean
}

export const sumOf = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0)

export const leftSum = (scale: ScaleSpec) => sumOf(scale.left)

export function createBalanceState(spec: BalanceSpec): BalanceState {
  return {
    placements: spec.scales.map((scale) => Array.from({ length: scale.slots }, () => null)),
    ops: 0,
    misses: 0,
  }
}

export function weightOf(pool: readonly PoolWeight[], poolId: number | null): number {
  if (poolId === null) return 0
  return pool.find((item) => item.id === poolId)?.weight ?? 0
}

export function judgeBalance(spec: BalanceSpec, placements: readonly (number | null)[][]): ScaleVerdict {
  const placedSums = spec.scales.map((_, index) => {
    const row = placements[index] ?? []
    return sumOf(row.map((poolId) => weightOf(spec.pool, poolId)))
  })
  const childOf = (index: number): number | null => {
    const child = spec.scales[index]?.child
    return child === null || child === undefined || child === index || child < 0 || child >= spec.scales.length ? null : child
  }
  const totals = new Array<number>(spec.scales.length).fill(0)
  const resolved = new Array<boolean>(spec.scales.length).fill(false)
  const totalOf = (index: number): number => {
    if (resolved[index]) return totals[index]
    resolved[index] = true
    totals[index] = Number.NaN
    const child = childOf(index)
    const own = leftSum(spec.scales[index]) + placedSums[index]
    totals[index] = child === null ? own : own + totalOf(child)
    return totals[index]
  }
  const hangingOf = (index: number) => {
    const child = childOf(index)
    return child === null ? 0 : totalOf(child)
  }
  const balanced = spec.scales.map((scale, index) => leftSum(scale) === placedSums[index] + hangingOf(index))
  const tilt = spec.scales.map((scale, index) => leftSum(scale) - (placedSums[index] + hangingOf(index)))
  const slots = spec.scales.reduce((sum, scale) => sum + scale.slots, 0)
  const filled = placements.reduce((sum, row) => sum + (row ?? []).filter((poolId) => poolId !== null).length, 0)
  return { balanced, tilt, filled, slots, solved: slots > 0 && filled === slots && balanced.every(Boolean) }
}

export function slotFilled(placements: readonly (number | null)[][], scale: number, slot: number): number | null {
  return placements[scale]?.[slot] ?? null
}

export interface StepResult {
  state: BalanceState
  applied: boolean
}

export function applyPlace(spec: BalanceSpec, state: BalanceState, scale: number, slot: number, poolId: number): StepResult {
  const scaleSpec = spec.scales[scale]
  if (!scaleSpec || slot < 0 || slot >= scaleSpec.slots || poolId < 0 || poolId >= spec.pool.length) return { state, applied: false }
  if (state.placements[scale][slot] !== null) return { state, applied: false }
  const taken = state.placements.some((row) => row.includes(poolId))
  if (taken) return { state, applied: false }
  return {
    state: {
      ...state,
      placements: state.placements.map((row, rowIndex) => (rowIndex === scale ? row.map((spot, slotIndex) => (slotIndex === slot ? poolId : spot)) : row)),
      ops: state.ops + 1,
    },
    applied: true,
  }
}

export function applyRemove(spec: BalanceSpec, state: BalanceState, scale: number, slot: number): StepResult {
  const scaleSpec = spec.scales[scale]
  if (!scaleSpec || slot < 0 || slot >= scaleSpec.slots || state.placements[scale][slot] === null) return { state, applied: false }
  return {
    state: {
      ...state,
      placements: state.placements.map((row, rowIndex) => (rowIndex === scale ? row.map((spot, slotIndex) => (slotIndex === slot ? null : spot)) : row)),
    },
    applied: true,
  }
}

export interface SubmitResult {
  state: BalanceState
  solved: boolean
  miss: boolean
}

export function applySubmit(spec: BalanceSpec, state: BalanceState): SubmitResult {
  const verdict = judgeBalance(spec, state.placements)
  if (verdict.solved) return { state, solved: true, miss: false }
  return {
    state: { ...state, placements: state.placements.map((row) => row.map(() => null)), misses: state.misses + 1 },
    solved: false,
    miss: true,
  }
}

export const scoreFor = (ops: number, par: number, misses = 0) => Math.max(100, 1000 - Math.max(0, ops - par) * 15 - misses * 50)
