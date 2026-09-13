import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { cellKey, hexDisk, hexRing, NECTAR_MAX, NECTAR_MIN, type HiveLevel, type RingClue, type RingKind } from './logic'

export interface HiveSpec {
  readonly level: number
  readonly chapter: number
  readonly mode: string
  readonly radius: number
  readonly kinds: readonly RingKind[]
  readonly deviations: readonly [number, number]
  readonly deltaCount: number
  readonly budget: number | null
  readonly par: number
  readonly title: string
  readonly detail: string
}

interface ChapterConfig {
  readonly begin: number
  readonly size: number
  readonly radius: number
  readonly kinds: readonly RingKind[]
  readonly dev: readonly [number, number]
  readonly deltaBase: number
  readonly deltaRamp: number
  readonly budget: number | null
  readonly par: number
  readonly mode: string
  readonly title: string
  readonly detail: string
}

const CHAPTERS: readonly ChapterConfig[] = [
  { begin: 1, size: 11, radius: 2, kinds: ['uniform', 'uniform'], dev: [1, 2], deltaBase: 0, deltaRamp: 0, budget: null, par: 90, mode: 'flow', title: '初尝花蜜', detail: '每圈花蜜总和须等于环线索，先从内环酿起' },
  { begin: 12, size: 11, radius: 3, kinds: ['single', 'uniform', 'uniform'], dev: [2, 4], deltaBase: 0, deltaRamp: 0, budget: null, par: 200, mode: 'honey', title: '三环蜂巢', detail: '更大蜂巢开盘，独孔环要用心算补齐差值' },
  { begin: 23, size: 11, radius: 3, kinds: ['single', 'single', 'uniform'], dev: [2, 3], deltaBase: 0, deltaRamp: 0, budget: 3, par: 380, mode: 'guard', title: '封盖检验', detail: '失误预算三次，放错的花蜜会让整环发酵' },
  { begin: 34, size: 11, radius: 3, kinds: ['single', 'uniform', 'single'], dev: [2, 3], deltaBase: 1, deltaRamp: 1, budget: 3, par: 470, mode: 'delta', title: '差分暗环', detail: '部分环只给相邻差值，先算内环和再推外环' },
  { begin: 45, size: 16, radius: 4, kinds: ['single', 'single', 'uniform', 'single'], dev: [2, 3], deltaBase: 2, deltaRamp: 1, budget: 3, par: 540, mode: 'gauntlet', title: '终局·四环蜜巢', detail: '半径四蜂巢叠加差分暗环与失误预算' },
]

export function getHiveSpec(level: number): HiveSpec {
  const safe = Math.min(60, Math.max(1, Math.floor(level)))
  const index = CHAPTERS.findIndex((chapter) => safe < chapter.begin + chapter.size)
  const config = CHAPTERS[index < 0 ? CHAPTERS.length - 1 : index]
  const progress = (safe - config.begin) / (config.size - 1)
  return {
    level: safe,
    chapter: CHAPTERS.indexOf(config) + 1,
    mode: config.mode,
    radius: config.radius,
    kinds: config.kinds,
    deviations: config.dev,
    deltaCount: config.deltaBase + (progress >= 0.5 ? config.deltaRamp : 0),
    budget: config.budget,
    par: config.par,
    title: safe === 60 ? '终局·四环蜜巢' : config.title,
    detail: config.detail,
  }
}

const roll = (random: () => number, lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))

export function createHiveLevel(level: number): HiveLevel {
  const spec = getHiveSpec(level)
  const random = mulberry32(seedFor(spec.level, 65))
  const rings = Array.from({ length: spec.radius + 1 }, (_, k) => hexRing(k))
  const cells = hexDisk(spec.radius)
  const ringIndex: Record<string, number> = {}
  rings.forEach((ring, index) => ring.forEach((cell) => { ringIndex[cellKey(cell)] = index }))
  const solution: Record<string, number> = {}
  const givens: Record<string, number> = {}
  const center = roll(random, NECTAR_MIN, NECTAR_MAX)
  solution['0,0'] = center
  givens['0,0'] = center
  const sums: number[] = [center]
  rings.forEach((ring, index) => {
    if (index === 0) return
    const kind = spec.kinds[index - 1]
    const order = shuffle(random, ring.slice())
    const low = random() < 0.5
    const devCount = kind === 'uniform' ? roll(random, spec.deviations[0], spec.deviations[1]) : 0
    const devCells = new Set(order.slice(0, Math.min(devCount, ring.length - 1)).map(cellKey))
    const hole = order[order.length - 1]
    let sum = 0
    ring.forEach((cell) => {
      const key = cellKey(cell)
      const value = kind === 'uniform' ? (devCells.has(key) ? (low ? roll(random, 2, NECTAR_MAX) : roll(random, NECTAR_MIN, 5)) : low ? 1 : 6) : 1 + Math.floor(random() * 6)
      solution[key] = value
      if (kind === 'uniform' ? devCells.has(key) : key !== cellKey(hole)) givens[key] = value
      sum += value
    })
    sums[index] = sum
  })
  const deltaRings = Array.from({ length: spec.radius }, (_, k) => spec.radius - k).slice(0, spec.deltaCount)
  const clues: RingClue[] = sums.map((value, index) =>
    index > 0 && deltaRings.includes(index) ? { kind: 'delta', value: value - sums[index - 1] } : { kind: 'sum', value },
  )
  return {
    radius: spec.radius,
    rings,
    cells,
    ringIndex,
    solution,
    givens,
    clues,
    empties: cells.length - Object.keys(givens).length,
    singles: spec.kinds.filter((kind) => kind === 'single').length,
    deltaRings: deltaRings.length,
    budget: spec.budget,
    par: spec.par,
  }
}
