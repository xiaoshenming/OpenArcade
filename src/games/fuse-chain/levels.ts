import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { minDetonations, crossOf, type BombGrid } from './logic'

export const FUSE_LEVEL_COUNT = 60

export type FuseMode = 'spark' | 'field' | 'budget' | 'locked' | 'core'

export interface FuseSpec {
  level: number
  chapter: number
  rows: number
  cols: number
  bombs: number
  locks: number
  slack: number
  par: [number, number]
  mode: FuseMode
  title: string
  detail: string
}

export interface FusePuzzle {
  spec: FuseSpec
  bombs: BombGrid
  locked: BombGrid
  par: number
  budget?: number
  solution: number[]
}

const chapterStart = [1, 12, 23, 34, 45]
const chapterEnd = [11, 22, 33, 44, 60]
const chapterCurve = [
  { rows: 6, cols: 6, bombs: [5, 8], locks: [0, 0], slack: 0, par: [1, 2], mode: 'spark', title: '引信训练场', detail: '点击起爆十字范围内的雷管，爆炸沿十字连锁波及相邻雷管，清空全部雷管即通关' },
  { rows: 6, cols: 8, bombs: [8, 12], locks: [0, 0], slack: 0, par: [2, 3], mode: 'field', title: '雷野扩展', detail: '更宽的雷区被分成多片雷簇，规划最少起爆点让每一波连锁物尽其用' },
  { rows: 8, cols: 8, bombs: [12, 15], locks: [0, 0], slack: 2, par: [2, 4], mode: 'budget', title: '限量引信', detail: '起爆次数预算为参考值加二，预算耗尽仍未清空将扣除一条命并重置雷区' },
  { rows: 8, cols: 9, bombs: [15, 18], locks: [1, 3], slack: 0, par: [2, 4], mode: 'locked', title: '锁芯雷区', detail: '锁定雷管无法直接起爆，只有相邻雷管爆炸产生的连锁才能唤醒它们' },
  { rows: 8, cols: 10, bombs: [18, 22], locks: [2, 5], slack: 2, par: [3, 5], mode: 'core', title: '终局连锁', detail: '起爆预算与锁定雷管同时生效，在大雷区里寻找一击多链的完美起爆点' },
] as const

export function getFuseLevel(level: number): FuseSpec {
  const safe = Math.min(FUSE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = safe < 12 ? 1 : safe < 23 ? 2 : safe < 34 ? 3 : safe < 45 ? 4 : 5
  const curve = chapterCurve[chapter - 1]
  const progress = (safe - chapterStart[chapter - 1]) / (chapterEnd[chapter - 1] - chapterStart[chapter - 1])
  const bombs = Math.round(curve.bombs[0] + (curve.bombs[1] - curve.bombs[0]) * progress)
  const locks = Math.round(curve.locks[0] + (curve.locks[1] - curve.locks[0]) * progress)
  return {
    level: safe,
    chapter,
    rows: curve.rows,
    cols: curve.cols,
    bombs,
    locks,
    slack: curve.slack,
    par: [curve.par[0], curve.par[1]],
    mode: curve.mode,
    title: safe === FUSE_LEVEL_COUNT ? '终局·万雷归一' : curve.title,
    detail: curve.detail,
  }
}

function blankGrid(size: number): BombGrid {
  return Array.from({ length: size }, () => false)
}

function plantField(random: () => number, spec: FuseSpec): { bombs: BombGrid; locked: BombGrid } {
  const total = spec.rows * spec.cols
  const bombs = blankGrid(total)
  const locked = blankGrid(total)
  const order = shuffle(random, Array.from({ length: total }, (_, cell) => cell))
  let cursor = 0
  for (let seed = 0; seed < spec.locks; seed += 1) {
    while (cursor < order.length && (bombs[order[cursor]] || !crossOf(order[cursor], spec.cols, spec.rows).some((next) => next !== order[cursor] && !bombs[next]))) cursor += 1
    if (cursor >= order.length) break
    const cell = order[cursor]
    cursor += 1
    const spots = shuffle(random, crossOf(cell, spec.cols, spec.rows).filter((next) => next !== cell && !bombs[next]))
    bombs[cell] = true
    locked[cell] = true
    if (spots.length) bombs[spots[0]] = true
  }
  let placed = bombs.reduce((count, bomb) => count + (bomb ? 1 : 0), 0)
  for (; cursor < order.length && placed < spec.bombs; cursor += 1) {
    const cell = order[cursor]
    if (bombs[cell]) continue
    bombs[cell] = true
    placed += 1
    if (placed < spec.bombs && random() < 0.45) {
      const spots = shuffle(random, crossOf(cell, spec.cols, spec.rows).filter((next) => next !== cell && !bombs[next]))
      if (spots.length) {
        bombs[spots[0]] = true
        placed += 1
      }
    }
  }
  return { bombs, locked }
}

const attemptSeed = (level: number, attempt: number) => (seedFor(level, attempt) ^ Math.imul(level + 1, 0x85ebca6b)) >>> 0

export function createFusePuzzle(level: number): FusePuzzle {
  const safe = Math.min(FUSE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const spec = getFuseLevel(safe)
  const [lo, hi] = spec.par
  const grade = (par: number) => (par < lo ? lo - par + 10 : par > hi ? par - hi : 0)
  let best: FusePuzzle | null = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const random = mulberry32(attemptSeed(safe, attempt))
    const field = plantField(random, spec)
    const locks = field.locked.reduce((total, lock) => total + (lock ? 1 : 0), 0)
    if (locks !== spec.locks) continue
    const solve = minDetonations(field.bombs, field.locked, spec.cols, spec.rows)
    if (!Number.isFinite(solve.count)) continue
    const puzzle: FusePuzzle = {
      spec,
      bombs: field.bombs,
      locked: field.locked,
      par: solve.count,
      budget: spec.slack > 0 ? solve.count + spec.slack : undefined,
      solution: solve.cells,
    }
    if (grade(solve.count) === 0) return puzzle
    if (!best || grade(solve.count) < grade(best.par)) best = puzzle
  }
  if (best) return best
  const field = plantField(mulberry32(attemptSeed(safe, 97)), spec)
  const solve = minDetonations(field.bombs, field.locked, spec.cols, spec.rows)
  return {
    spec,
    bombs: field.bombs,
    locked: field.locked,
    par: solve.count,
    budget: spec.slack > 0 ? solve.count + spec.slack : undefined,
    solution: solve.cells,
  }
}
