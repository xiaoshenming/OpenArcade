import { mulberry32, seedFor } from '../../platform/rng'
import { HOOP_GAP, TABLE, THROWER, WIND_MAX, launchVelocity, landX, speedFor } from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
export type PegMode = 'calm' | 'drift' | 'twin' | 'gilded' | 'storm'

export interface PegSpec {
  index: number
  baseX: number
  kind: 'normal' | 'gold'
  amp: number
  period: number
  phase: number
}

export interface WindSpec {
  period: number
  force: number
  phase: number
}

export interface PegLevel {
  level: number
  chapter: number
  mode: PegMode
  throws: number
  threshold: number
  meterPeriod: number
  quota: number
  double: boolean
  gold: boolean
  wind: WindSpec | null
  title: string
  detail: string
  seed: number
}

const chapterCopy: readonly (readonly [string, string])[] = [
  ['静台初试', '三根静立木柱，力度条往复摆动，点击锁定让圈稳稳套住柱头'],
  ['游柱回廊', '木柱开始横移，读准滑行相位与抛物线飞行时间的交集'],
  ['连珠双圈', '一次蓄力连投两圈，落点相隔固定间距，成对木柱一箭双雕'],
  ['流金拾贝', '金柱四百分却滑得飞快，普通柱缓移，取舍全在一瞬'],
  ['天风满贯', '阵风推动圈路偏移力度，移动金柱与横柱齐登台争夺满贯'],
] as const

const throwsByChapter = [5, 6, 5, 6, 7] as const
const pegsByChapter = [3, 5, 6, 7, 8] as const
const quotaByChapter = [400, 850, 1300, 1900, 2500] as const
const quotaStep = [20, 35, 40, 55, 60] as const

const canonicalLand = (power: number) => {
  const velocity = launchVelocity(speedFor(power))
  return landX(THROWER.x, THROWER.y, velocity.vx, velocity.vy)
}

export function getPegLevel(level: number): PegLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  let chapter = 1
  for (let index = 0; index < CHAPTER_STARTS.length; index += 1) if (safe >= CHAPTER_STARTS[index]) chapter = index + 1
  const slot = safe - CHAPTER_STARTS[chapter - 1]
  const tail = chapter === 5 ? 15 : 10
  const progress = slot / tail
  const global = (safe - 1) / (LEVEL_COUNT - 1)
  return {
    level: safe,
    chapter,
    mode: (['calm', 'drift', 'twin', 'gilded', 'storm'] as const)[chapter - 1],
    throws: throwsByChapter[chapter - 1],
    threshold: Math.round((6.4 - global * 2.4) * 100) / 100,
    meterPeriod: Math.round((1.5 - global * 0.6) * 100) / 100,
    quota: quotaByChapter[chapter - 1] + quotaStep[chapter - 1] * slot,
    double: chapter === 3,
    gold: chapter >= 4,
    wind:
      chapter === 5
        ? { period: 5.5 - progress, force: Math.round(WIND_MAX * (0.5 + progress * 0.5) * 1000) / 1000, phase: (seedFor(safe, 13) % 628) / 100 }
        : null,
    title: chapterCopy[chapter - 1][0],
    detail: chapterCopy[chapter - 1][1],
    seed: seedFor(safe, 47),
  }
}

function motionFor(rng: () => number, chapter: number, gold: boolean): { amp: number; period: number } {
  if (chapter === 1) return { amp: 0, period: 1 }
  if (chapter === 2) return { amp: 5 + rng() * 4, period: 2.6 + rng() * 0.8 }
  if (chapter === 3) return { amp: 4.5 + rng() * 3.5, period: 2.4 + rng() * 0.8 }
  if (gold) return { amp: 12 + rng() * 3, period: 1.7 + rng() * 0.4 }
  return { amp: rng() * 4, period: 2.8 + rng() * 0.8 }
}

const cache = new Map<number, PegSpec[]>()

export function createPegs(level: number): PegSpec[] {
  const spec = getPegLevel(level)
  const cached = cache.get(spec.level)
  if (cached) return cached
  const rng = mulberry32(spec.seed)
  const count = pegsByChapter[spec.chapter - 1]
  const jitter = () => (rng() * 2 - 1) * spec.threshold * 0.35
  const pegs: PegSpec[] = []
  const push = (baseX: number) => {
    const gold = spec.gold && pegs.length % 3 === 1
    const motion = motionFor(rng, spec.chapter, gold)
    pegs.push({
      index: pegs.length,
      baseX: Math.min(TABLE.right - 3, Math.max(TABLE.left + 3, baseX)),
      kind: gold ? 'gold' : 'normal',
      amp: Math.round(motion.amp * 100) / 100,
      period: Math.round(motion.period * 100) / 100,
      phase: rng() * Math.PI * 2,
    })
  }
  if (spec.double) {
    const pairs = count / 2
    for (let pair = 0; pair < pairs; pair += 1) {
      const base = canonicalLand(0.15 + (pair / (pairs - 1)) * 0.62) + jitter()
      push(base)
      push(base + HOOP_GAP)
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      push(canonicalLand(0.13 + (index / (count - 1)) * 0.72) + jitter())
    }
  }
  cache.set(spec.level, pegs)
  return pegs
}
