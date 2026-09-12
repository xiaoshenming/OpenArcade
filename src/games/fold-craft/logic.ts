export type FoldAxis = 'left' | 'right' | 'up' | 'down'
export interface FoldState { rows: number; cols: number; stacks: number[][] }
export interface FoldTrack { frames: { rows: number; cols: number }[]; state: FoldState }

export const FOLD_LABELS: Record<FoldAxis, string> = { left: '左半向右折', right: '右半向左折', up: '上半向下折', down: '下半向上折' }

export function applyFold(state: FoldState, fold: FoldAxis): FoldState | null {
  const vertical = fold === 'left' || fold === 'right'
  const span = vertical ? state.cols : state.rows
  if (span % 2) return null
  const half = span / 2
  const rows = vertical ? state.rows : half
  const cols = vertical ? half : state.cols
  const slide = (value: number) => {
    if (fold === 'left') return value < half ? state.cols - 1 - value - half : value - half
    if (fold === 'right') return value < half ? value : state.cols - 1 - value
    if (fold === 'up') return value < half ? state.rows - 1 - value - half : value - half
    return value < half ? value : state.rows - 1 - value
  }
  const stacks: number[][] = Array.from({ length: rows * cols }, () => [])
  state.stacks.forEach((stack, position) => {
    const row = Math.floor(position / state.cols)
    const col = position % state.cols
    const next = vertical ? row * cols + slide(col) : slide(row) * cols + col
    stacks[next].push(...stack)
  })
  return { rows, cols, stacks }
}

export function freshPaper(rows: number, cols: number): FoldState {
  return { rows, cols, stacks: Array.from({ length: rows * cols }, (_, cell) => [cell]) }
}

export function foldPaper(rows: number, cols: number, folds: readonly FoldAxis[]): FoldState | null {
  let state = freshPaper(rows, cols)
  for (const fold of folds) {
    const next = applyFold(state, fold)
    if (!next) return null
    state = next
  }
  return state
}

export function trackFolds(rows: number, cols: number, folds: readonly FoldAxis[]): FoldTrack {
  const frames: { rows: number; cols: number }[] = []
  let state = freshPaper(rows, cols)
  for (const fold of folds) {
    frames.push({ rows: state.rows, cols: state.cols })
    const next = applyFold(state, fold)
    if (!next) break
    state = next
  }
  return { frames, state }
}

export function unfoldHoles(state: FoldState, holes: readonly number[]) {
  const set = new Set<number>()
  for (const hole of holes) for (const cell of state.stacks[hole] ?? []) set.add(cell)
  return [...set].sort((a, b) => a - b)
}

/** 中心对称的孪生穿刺位：镜像章里每个穿刺点都会在此自动开第二个孔。 */
export function twinPosition(position: number, rows: number, cols: number): number {
  return (rows - 1 - Math.floor(position / cols)) * cols + (cols - 1 - (position % cols))
}

/** 镜像章校验：穿刺点与其孪生位一起展开，两处落点都算命中目标。 */
export function unfoldMirrorPunch(state: FoldState, holes: readonly number[]) {
  const punched = new Set<number>(holes)
  holes.forEach((hole) => punched.add(twinPosition(hole, state.rows, state.cols)))
  return unfoldHoles(state, [...punched])
}

/** 限时章硬超时：计时到达上限即判负。 */
export function isTimedOut(timed: boolean, elapsed: number, limit: number): boolean {
  return timed && elapsed >= limit
}

export function creaseEdge(state: FoldState, fold: FoldAxis) {
  if (fold === 'left') return Array.from({ length: state.rows }, (_, row) => row * state.cols)
  if (fold === 'right') return Array.from({ length: state.rows }, (_, row) => row * state.cols + state.cols - 1)
  if (fold === 'up') return Array.from({ length: state.cols }, (_, col) => col)
  return Array.from({ length: state.cols }, (_, col) => (state.rows - 1) * state.cols + col)
}
