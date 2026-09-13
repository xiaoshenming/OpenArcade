import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { BOTTLES, buildSolution, CHANNELS, neededBottles, STEP, type Channel, type HueLevel, type Rgb } from './logic'

export interface HueSpec {
  readonly level: number
  readonly chapter: number
  readonly mode: string
  readonly active: number
  readonly droplets: readonly number[]
  readonly dudCount: number
  readonly slack: number
  readonly magnitude: number
  readonly jitter: number
  readonly title: string
  readonly detail: string
}

interface ChapterConfig {
  readonly begin: number
  readonly size: number
  readonly active: number
  readonly low: number
  readonly high: number
  readonly jitter: number
  readonly fives: boolean
  readonly duds: number
  readonly slack: number
  readonly mode: string
  readonly title: string
  readonly detail: string
}

const CHAPTERS: readonly ChapterConfig[] = [
  { begin: 1, size: 11, active: 1, low: 3, high: 8, jitter: 0, fives: false, duds: 0, slack: 3, mode: 'tint', title: '初试色阶', detail: '单通道偏差，对准色瓶把烧杯滴到目标色' },
  { begin: 12, size: 11, active: 2, low: 2, high: 6, jitter: 2, fives: false, duds: 0, slack: 4, mode: 'blend', title: '双通道调和', detail: '两条通道同时偏移，规划滴序少走弯路' },
  { begin: 23, size: 11, active: 3, low: 3, high: 5, jitter: 2, fives: false, duds: 0, slack: 2, mode: 'press', title: '预算收紧', detail: '三通道全开，冗余预算被压到最低' },
  { begin: 34, size: 11, active: 3, low: 4, high: 7, jitter: 0, fives: true, duds: 0, slack: 3, mode: 'stream', title: '五滴连珠', detail: '滴量可切 1/5，五连滴一次跨大步' },
  { begin: 45, size: 16, active: 3, low: 5, high: 8, jitter: 0, fives: true, duds: 3, slack: 4, mode: 'gauntlet', title: '终局·迷瓶调律', detail: '五连滴与干扰哑瓶齐上，先辨真瓶再调色' },
]

export function getHueSpec(level: number): HueSpec {
  const safe = Math.min(60, Math.max(1, Math.floor(level)))
  const index = CHAPTERS.findIndex((chapter) => safe < chapter.begin + chapter.size)
  const config = CHAPTERS[index < 0 ? CHAPTERS.length - 1 : index]
  const progress = (safe - config.begin) / (config.size - 1)
  return {
    level: safe,
    chapter: CHAPTERS.indexOf(config) + 1,
    mode: config.mode,
    active: config.active,
    droplets: config.fives ? [1, 5] : [1],
    dudCount: config.duds > 0 ? Math.min(config.duds, 1 + Math.floor(progress * config.duds)) : 0,
    slack: config.slack,
    magnitude: config.low + Math.round(progress * (config.high - config.low)),
    jitter: config.jitter,
    title: safe === 60 ? '终局·迷瓶调律' : config.title,
    detail: config.detail,
  }
}

const pickStart = (random: () => number, lo: number, hi: number) => lo + STEP * Math.floor(random() * ((hi - lo) / STEP + 1))

function startRange(delta: number): [number, number] {
  if (delta === 0) return [30, 225]
  return delta > 0 ? [30, 225 - STEP * delta] : [30 + STEP * -delta, 225]
}

const fiveDelta = (clicks: number, random: () => number) => {
  const minFives = Math.max(1, clicks - 4)
  const maxFives = Math.min(3, clicks)
  const fives = minFives + Math.floor(random() * (maxFives - minFives + 1))
  return 5 * fives + (clicks - fives)
}

function rollDeltas(spec: HueSpec, random: () => number): Record<Channel, number> {
  const order = shuffle(random, [...CHANNELS])
  const deltas: Record<Channel, number> = { r: 0, g: 0, b: 0 }
  const fives = spec.droplets.length > 1
  order.slice(0, spec.active).forEach((channel) => {
    const sign = random() < 0.5 ? 1 : -1
    const size = fives ? fiveDelta(spec.magnitude, random) : spec.magnitude + Math.floor(random() * (spec.jitter + 1))
    deltas[channel] = sign * size
  })
  return deltas
}

function rollStart(deltas: Record<Channel, number>, random: () => number): Rgb {
  const start = {} as Rgb
  for (const channel of CHANNELS) {
    const [lo, hi] = startRange(deltas[channel])
    start[channel] = pickStart(random, lo, hi)
  }
  return start
}

function rollDuds(deltas: Record<Channel, number>, count: number, random: () => number): string[] {
  if (count <= 0) return []
  const needed = new Set(neededBottles(deltas))
  return shuffle(random, BOTTLES.filter((key) => !needed.has(key)).slice()).slice(0, count)
}

export function createHueLevel(level: number): HueLevel {
  const spec = getHueSpec(level)
  const random = mulberry32(seedFor(spec.level, 64))
  const deltas = rollDeltas(spec, random)
  const start = rollStart(deltas, random)
  const target = { ...start }
  for (const channel of CHANNELS) target[channel] += deltas[channel] * STEP
  const solution = buildSolution(deltas, spec.droplets.length > 1)
  const duds = rollDuds(deltas, spec.dudCount, random)
  return { start, target, par: solution.length, budget: solution.length + spec.slack, droplets: spec.droplets, duds, solution }
}
