import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { carveMaze, evaluatePaths, openDistance, wallIds, wallCount } from './logic'

export const LEVEL_COUNT = 60
const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const

export type LaceMode = 'open' | 'budget' | 'preset' | 'tight' | 'core'

export interface LaceLevel {
  readonly level: number
  readonly chapter: number
  readonly rows: number
  readonly cols: number
  readonly minLen: number
  readonly presetFraction: number
  readonly slack?: number
  readonly mode: LaceMode
  readonly title: string
  readonly detail: string
}

const chapterCurve = [
  { size: 5, base: 8, step: 1, preset: 0, slack: 0, mode: 'open', title: '素毯初织', detail: '5x5 素毯：铺墙让起点到终点只剩一条路，长度恰为起点数字' },
  { size: 6, base: 18, step: 1, preset: 0, slack: 3, mode: 'budget', title: '限墙织机', detail: '6x6 织机：总墙数不得超过参考墙数加 3' },
  { size: 7, base: 28, step: 0.8, preset: 0.4, slack: 3, mode: 'preset', title: '预埋经线', detail: '7x7 织机：一部分答案墙已经铺好，补完剩余即可' },
  { size: 8, base: 36, step: 0.8, preset: 0.3, slack: 1, mode: 'tight', title: '紧墙界限', detail: '8x8 织机：预算收紧到参考墙数加 1，铺墙须精打细算' },
  { size: 8, base: 44, step: 2 / 15, preset: 0.5, mode: 'core', slack: 1, title: '终局·蕾丝成络', detail: '8x8 织机：预埋经线与紧墙预算同时生效' },
] as const

export function getLaceLevel(level: number): LaceLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = safe < 12 ? 1 : safe < 23 ? 2 : safe < 34 ? 3 : safe < 45 ? 4 : 5
  const curve = chapterCurve[chapter - 1]
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  return {
    level: safe,
    chapter,
    rows: curve.size,
    cols: curve.size,
    minLen: curve.base + Math.floor(variant * curve.step),
    presetFraction: curve.preset,
    slack: curve.slack ? curve.slack : undefined,
    mode: curve.mode,
    title: safe === LEVEL_COUNT ? '终局·蕾丝成络' : curve.title,
    detail: curve.detail,
  }
}

export interface LacePuzzle {
  readonly rule: LaceLevel
  readonly start: number
  readonly goal: number
  readonly targetLen: number
  readonly par: number
  readonly solution: Uint8Array
  readonly presets: readonly number[]
}

const ATTEMPTS = 256

export function createLacePuzzle(level: number): LacePuzzle {
  const rule = getLaceLevel(level)
  const goal = rule.rows * rule.cols - 1
  let best: { walls: Uint8Array; len: number } | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const rng = mulberry32(seedFor(rule.level, attempt))
    const walls = carveMaze(rng, rule.rows, rule.cols)
    const len = openDistance(walls, rule.rows, rule.cols, 0, goal)
    if (!best || len > best.len) best = { walls, len }
    if (len >= rule.minLen) break
  }
  const { walls, len } = best as { walls: Uint8Array; len: number }
  const par = wallCount(walls)
  const presets = rule.presetFraction > 0
    ? shuffle(mulberry32(seedFor(rule.level, 9973)), wallIds(walls)).slice(0, Math.round(par * rule.presetFraction))
    : []
  return { rule, start: 0, goal, targetLen: len, par, solution: walls, presets }
}

export function verdictOf(puzzle: LacePuzzle, walls: ArrayLike<number>) {
  return evaluatePaths(walls, puzzle.rule.rows, puzzle.rule.cols, puzzle.start, puzzle.goal, puzzle.targetLen)
}
