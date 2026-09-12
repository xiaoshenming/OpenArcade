import type { BonsaiLevel } from './levels'

export type BonsaiPulse = 'cut' | 'undone' | 'won' | 'lost'

export interface BonsaiState {
  cuts: number[]
  steps: number
  totalCuts: number
  undos: number
  over: 'play' | 'won' | 'lost'
  pulse: BonsaiPulse
}

export const UNDO_STEP_COST = 5
export const MIN_SCORE = 100
export const EXACT_PRUNE_BONUS = 300
export const STEADY_HAND_BONUS = 50

export function createBonsaiState(): BonsaiState {
  return { cuts: [], steps: 0, totalCuts: 0, undos: 0, over: 'play', pulse: 'cut' }
}

export function silhouette(level: BonsaiLevel, cuts: number[]): number[] {
  const cutSet = new Set(cuts)
  const out: number[] = []
  const walk = (id: number) => {
    if (cutSet.has(id)) return
    const node = level.nodes[id]
    if (node.leaf) {
      out.push(node.leafNo)
      return
    }
    if (node.left !== null) walk(node.left)
    if (node.right !== null) walk(node.right)
  }
  walk(0)
  return out
}

export function isSolved(level: BonsaiLevel, cuts: number[]): boolean {
  const now = silhouette(level, cuts)
  return now.length === level.target.length && now.every((leafNo, index) => leafNo === level.target[index])
}

export function isRemoved(level: BonsaiLevel, id: number, cuts: number[]): boolean {
  const cutSet = new Set(cuts)
  let cur: number | null = id
  while (cur !== null) {
    if (cutSet.has(cur)) return true
    cur = level.nodes[cur].parent
  }
  return false
}

export function removedNodes(level: BonsaiLevel, cuts: number[]): Set<number> {
  return new Set(level.nodes.filter((node) => isRemoved(level, node.id, cuts)).map((node) => node.id))
}

// 精确剪法奖励:剪数恰等于 par +300,全程零撤销再 +50,
// 使分数带宽从固定 1000 扩展到 1350,与 scorePolicy.max 拉开层次;下限仍钳制在 MIN_SCORE。
export function bonsaiScore(level: BonsaiLevel, state: BonsaiState): number {
  const bonus = (state.totalCuts === level.par ? EXACT_PRUNE_BONUS : 0) + (state.undos === 0 ? STEADY_HAND_BONUS : 0)
  return Math.max(MIN_SCORE, 1000 + bonus - Math.max(0, state.totalCuts - level.par) * 60 - state.undos * UNDO_STEP_COST)
}

function settle(level: BonsaiLevel, state: BonsaiState): BonsaiState {
  if (isSolved(level, state.cuts)) return { ...state, over: 'won', pulse: 'won' }
  if (level.budget !== null && state.steps > level.budget) return { ...state, over: 'lost', pulse: 'lost' }
  return state
}

export function cutBranch(level: BonsaiLevel, state: BonsaiState, id: number): BonsaiState {
  if (state.over !== 'play' || id === 0 || state.cuts.includes(id) || isRemoved(level, id, state.cuts)) return state
  return settle(level, { ...state, cuts: [...state.cuts, id], totalCuts: state.totalCuts + 1, steps: state.steps + 1, pulse: 'cut' })
}

export function undoCut(level: BonsaiLevel, state: BonsaiState): BonsaiState {
  if (state.over !== 'play' || state.cuts.length === 0) return state
  return settle(level, {
    ...state, cuts: state.cuts.slice(0, -1), undos: state.undos + 1,
    steps: state.steps + UNDO_STEP_COST, pulse: 'undone',
  })
}
