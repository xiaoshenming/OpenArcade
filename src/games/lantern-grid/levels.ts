import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { applyPresses, crossOf, darkGrid, litCount, type Grid } from './logic'

export const LANTERN_LEVEL_COUNT = 60

export type LanternMode = 'garden' | 'hall' | 'budget' | 'locked' | 'core'

export interface LanternSpec {
  level: number
  chapter: number
  rows: number
  cols: number
  presses: number
  prelit: number
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
  prelit: number[]
  solution: number[]
  /** 生成灯阵的朴素按钮集：解冲突锁关卡中含锁定格，是被锁封死的自然路径 */
  sealedPath: number[]
  par: number
}

const chapterStart = [1, 12, 23, 34, 45]
const chapterEnd = [11, 22, 33, 44, 60]
const chapterCurve = [
  { size: 4, presses: [6, 9], prelit: [0, 0], locks: [0, 0], slack: 0, mode: 'garden', title: '初醒灯廊', detail: '点击翻转自身与上下左右的十字灯，熄灭整片灯阵' },
  { size: 5, presses: [9, 12], prelit: [2, 3], locks: [0, 0], slack: 0, mode: 'hall', title: '广庭灯海', detail: '预亮迷格开局已亮且无法点击，借相邻翻转将其熄灭' },
  { size: 5, presses: [12, 16], prelit: [0, 0], locks: [0, 0], slack: 7, mode: 'budget', title: '限步回廊', detail: '步数预算耗尽仍未熄灭整阵即失败' },
  { size: 6, presses: [16, 20], prelit: [0, 0], locks: [2, 5], slack: 0, mode: 'locked', title: '锁孔迷园', detail: '锁定格无法点击，但会被相邻翻转波及' },
  { size: 7, presses: [20, 24], prelit: [0, 0], locks: [4, 8], slack: 6, mode: 'core', title: '核心灯阵', detail: '锁定格与步数预算同时生效，谨慎规划路线' },
] as const

export function getLanternLevel(level: number): LanternSpec {
  const safe = Math.min(LANTERN_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = safe < 12 ? 1 : safe < 23 ? 2 : safe < 34 ? 3 : safe < 45 ? 4 : 5
  const curve = chapterCurve[chapter - 1]
  const progress = (safe - chapterStart[chapter - 1]) / (chapterEnd[chapter - 1] - chapterStart[chapter - 1])
  const presses = Math.round(curve.presses[0] + (curve.presses[1] - curve.presses[0]) * progress)
  const [prelitFrom, prelitTo] = curve.prelit
  const prelit = Math.round(prelitFrom + (prelitTo - prelitFrom) * progress)
  const [lockFrom, lockTo] = curve.locks
  const locks = Math.round(lockFrom + (lockTo - lockFrom) * progress)
  const slack = curve.slack ? Math.max(3, curve.slack - Math.round(progress * (curve.slack - 3))) : 0
  return {
    level: safe,
    chapter,
    rows: curve.size,
    cols: curve.size,
    presses,
    prelit,
    locks,
    budget: slack ? presses + slack : undefined,
    mode: curve.mode,
    title: safe === LANTERN_LEVEL_COUNT ? '终局·万灯归寂' : curve.title,
    detail: curve.detail,
  }
}

// 与解按钮曼哈顿距离 ≤1 的格子（正交邻居，不含解本身），锁定格优先从这里取以形成贴脸干扰。
function adjacentTo(path: readonly number[], spec: LanternSpec): number[] {
  const pathSet = new Set(path)
  const seen = new Set<number>()
  for (const cell of path) {
    for (const neighbor of crossOf(cell, spec.cols, spec.rows)) {
      if (neighbor !== cell && !pathSet.has(neighbor)) seen.add(neighbor)
    }
  }
  return [...seen]
}

// 预亮格即谜面:按钮集的前 spec.prelit 个已被预先施加并展示为常亮封格,
// 剩余按钮集合就是完整解——重放剩余按钮必然全灭,par 相应扣减 K。
// 锁定章偶数关引入「解冲突锁」:锁定格取自朴素按钮集,把该按钮换成两步邻居组合
// (先点其正交邻居再抵消,每个冲突锁 par +1),灯阵改由绕行解生成并验证重放全灭;
// 其余锁定格贴着解按钮放置,保证每关至少一个锁与解按钮曼哈顿距离 ≤1。
export function createLanternPuzzle(level: number): LanternPuzzle {
  const spec = getLanternLevel(level)
  const total = spec.rows * spec.cols
  const cells = Array.from({ length: total }, (_, cell) => cell)
  const remaining = Math.max(0, spec.presses - spec.prelit)
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const random = mulberry32(seedFor(level, attempt))
    const order = shuffle(random, [...cells])
    const solution = order.slice(0, remaining)
    const solutionSet = new Set(solution)
    if (spec.locks === 0) {
      const lights = applyPresses(darkGrid(total), solution, spec.cols)
      if (litCount(lights) === 0) continue
      if (spec.prelit > 0) {
        const candidates = shuffle(mulberry32(seedFor(level, attempt + 64)), lights
          .map((lit, cell) => (lit && !solutionSet.has(cell) ? cell : -1))
          .filter((cell) => cell >= 0))
        if (candidates.length < spec.prelit) continue
        return { spec, lights, locks: [], prelit: candidates.slice(0, spec.prelit), solution, sealedPath: solution, par: solution.length }
      }
      return { spec, lights, locks: [], prelit: [], solution, sealedPath: solution, par: solution.length }
    }
    const adjacent = shuffle(mulberry32(seedFor(level, attempt + 64)), adjacentTo(solution, spec))
    if (level % 2 === 0) {
      const conflictCount = Math.min(2, spec.locks - 1)
      const conflictLocks = solution.slice(0, conflictCount)
      const conflictSet = new Set(conflictLocks)
      const kept = solution.filter((cell) => !conflictSet.has(cell))
      const used = new Set([...kept, ...conflictLocks])
      const detour: number[] = []
      for (const lock of conflictLocks) {
        const picks = shuffle(random, crossOf(lock, spec.cols, spec.rows).filter((cell) => cell !== lock && !used.has(cell)))
        if (picks.length < 2) break
        detour.push(picks[0], picks[1])
        used.add(picks[0])
        used.add(picks[1])
      }
      if (detour.length < conflictCount * 2) continue
      const bypass = [...kept, ...detour]
      const lights = applyPresses(darkGrid(total), bypass, spec.cols)
      if (litCount(lights) === 0) continue
      const bypassSet = new Set(bypass)
      const spare = adjacent.filter((cell) => !conflictSet.has(cell) && !bypassSet.has(cell))
      if (spare.length < spec.locks - conflictCount) continue
      return {
        spec,
        lights,
        locks: [...conflictLocks, ...spare.slice(0, spec.locks - conflictCount)],
        prelit: [],
        solution: bypass,
        sealedPath: solution,
        par: bypass.length,
      }
    }
    const lights = applyPresses(darkGrid(total), solution, spec.cols)
    if (litCount(lights) === 0) continue
    if (adjacent.length < spec.locks) continue
    return { spec, lights, locks: adjacent.slice(0, spec.locks), prelit: [], solution, sealedPath: solution, par: solution.length }
  }
  const order = shuffle(mulberry32(seedFor(level, 64)), [...cells])
  const solution = order.slice(0, remaining)
  return {
    spec,
    lights: applyPresses(darkGrid(total), solution, spec.cols),
    locks: spec.prelit > 0 ? [] : order.slice(remaining, remaining + spec.locks),
    prelit: [],
    solution,
    sealedPath: solution,
    par: solution.length,
  }
}
