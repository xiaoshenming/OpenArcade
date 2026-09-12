import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { applyPresses, darkGrid, litCount, type Grid } from './logic'

export const LANTERN_LEVEL_COUNT = 60

export type LanternMode = 'garden' | 'hall' | 'budget' | 'locked' | 'core'

export interface LanternSpec {
  level: number
  chapter: number
  rows: number
  cols: number
  presses: number
  locks: number
  budget?: number
  mode: LanternMode
  title: string
  detail: string
}

export interface LanternPuzzle {
  spec: LanternSpec
  lights: Grid
  locks: number[]
  solution: number[]
  par: number
}

const chapterStart = [1, 12, 23, 34, 45]
const chapterEnd = [11, 22, 33, 44, 60]
const chapterCurve = [
  { size: 4, presses: [6, 9], locks: [0, 0], slack: 0, mode: 'garden', title: '初醒灯廊', detail: '点击翻转自身与上下左右的十字灯，熄灭整片灯阵' },
  { size: 5, presses: [9, 12], locks: [0, 0], slack: 0, mode: 'hall', title: '广庭灯海', detail: '更大的 5×5 灯阵，亮灯联动更复杂' },
  { size: 5, presses: [12, 16], locks: [0, 0], slack: 7, mode: 'budget', title: '限步回廊', detail: '步数预算耗尽仍未熄灭整阵即失败' },
  { size: 6, presses: [16, 20], locks: [2, 5], slack: 0, mode: 'locked', title: '锁孔迷园', detail: '锁定格无法点击，但会被相邻翻转波及' },
  { size: 7, presses: [20, 24], locks: [4, 8], slack: 6, mode: 'core', title: '核心灯阵', detail: '锁定格与步数预算同时生效，谨慎规划路线' },
] as const

export function getLanternLevel(level: number): LanternSpec {
  const safe = Math.min(LANTERN_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = safe < 12 ? 1 : safe < 23 ? 2 : safe < 34 ? 3 : safe < 45 ? 4 : 5
  const curve = chapterCurve[chapter - 1]
  const progress = (safe - chapterStart[chapter - 1]) / (chapterEnd[chapter - 1] - chapterStart[chapter - 1])
  const presses = Math.round(curve.presses[0] + (curve.presses[1] - curve.presses[0]) * progress)
  const [lockFrom, lockTo] = curve.locks
  const locks = Math.round(lockFrom + (lockTo - lockFrom) * progress)
  const slack = curve.slack ? Math.max(3, curve.slack - Math.round(progress * (curve.slack - 3))) : 0
  return {
    level: safe,
    chapter,
    rows: curve.size,
    cols: curve.size,
    presses,
    locks,
    budget: slack ? presses + slack : undefined,
    mode: curve.mode,
    title: safe === LANTERN_LEVEL_COUNT ? '终局·万灯归寂' : curve.title,
    detail: curve.detail,
  }
}

export function createLanternPuzzle(level: number): LanternPuzzle {
  const spec = getLanternLevel(level)
  const total = spec.rows * spec.cols
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const order = shuffle(mulberry32(seedFor(level, attempt)), Array.from({ length: total }, (_, cell) => cell))
    const solution = order.slice(0, spec.presses)
    const locks = order.slice(spec.presses, spec.presses + spec.locks)
    const lights = applyPresses(darkGrid(total), solution, spec.cols)
    if (litCount(lights) > 0) return { spec, lights, locks, solution, par: solution.length }
  }
  const order = Array.from({ length: total }, (_, cell) => cell)
  const solution = order.slice(0, spec.presses)
  return { spec, lights: applyPresses(darkGrid(total), solution, spec.cols), locks: order.slice(spec.presses, spec.presses + spec.locks), solution, par: solution.length }
}
