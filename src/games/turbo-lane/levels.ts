import { mulberry32, seedFor } from '../../platform/rng'
import {
  CAR_HALF, SPAWN_AHEAD, TRUCK_HALF, createGameState, meetSpan, type CarKind, type GameState, type RoadCoin,
  type RoadPlan, type TrafficCar,
} from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
export const SWEEP_PAD = 14
export const LANE_GAP = 12
export const COIN_SPACING = 6
export const COIN_PAD = 8
export const RETRY_STEP = 8
export const REGEN_LIMIT = 5
export const MIN_CAR_GAP = 64
export const MIN_COINS = 8

interface ChapterConfig {
  name: string
  title: string
  detail: string
  quota: number
  base: number
  boost: number
  traffic: number
  spread: number
  gapFrom: number
  gapTo: number
  truck: number
  coins: number
}

const CHAPTERS: ChapterConfig[] = [
  { name: 'cruise', title: '晨风巡航', detail: '三车道慢速车流，左右变道避让', quota: 600, base: 38, boost: 0, traffic: 24, spread: 5, gapFrom: 52, gapTo: 44, truck: 0, coins: 0 },
  { name: 'hauler', title: '重卡疾驰', detail: '车流提速，长卡车占据双倍纵深', quota: 800, base: 44, boost: 0, traffic: 26, spread: 6, gapFrom: 44, gapTo: 36, truck: 0.2, coins: 0 },
  { name: 'gold', title: '金币弯道', detail: '金币串现身车道，冒险切入拿取', quota: 1000, base: 48, boost: 0, traffic: 25, spread: 6, gapFrom: 46, gapTo: 38, truck: 0.22, coins: 0.34 },
  { name: 'boost', title: '氮气油门', detail: '按住上键油门冲刺，距离分 ×1.5', quota: 1000, base: 52, boost: 16, traffic: 23, spread: 7, gapFrom: 46, gapTo: 38, truck: 0.24, coins: 0.36 },
  { name: 'grand', title: '终点冲刺', detail: '全机制叠加，1200m 终局决胜', quota: 1200, base: 56, boost: 18, traffic: 22, spread: 7, gapFrom: 48, gapTo: 40, truck: 0.26, coins: 0.4 },
]

export interface Range { from: number; to: number }
export interface Span extends Range { lane: number }
export interface CarSpan { lane: number; slow: Range; quick: Range }

export interface TurboLevelSpec extends RoadPlan {
  level: number
  chapter: number
  variant: number
  modeName: string
  title: string
  detail: string
  traffic: number
  gapFrom: number
  gapTo: number
  carCount: number
  coinCount: number
}

const spawnPoint = (arrival: number) => {
  const at = Math.max(0, arrival - SPAWN_AHEAD)
  return { at, enter: arrival - at }
}

const overlaps = (a: Range, from: number, to: number) => a.from < to && a.to > from

// 构造性公平：基速与油门两种速度剖面分别做占道扫描。新车在任一剖面下至多与一条
// 其他车道区间重叠（归纳保证该剖面任意时刻 ≤2 车道被占），同车道按间距错开。
function buildStream(level: number, cfg: ChapterConfig, attempt: number) {
  const random = mulberry32(seedFor(level, 17 + attempt * 3))
  const queue: TrafficCar[] = []
  const coins: RoadCoin[] = []
  const spans: CarSpan[] = []
  const trails: Span[] = []
  const slowEnd = [-Infinity, -Infinity, -Infinity]
  const quickEnd = [-Infinity, -Infinity, -Infinity]
  const laneSpeed: (number | null)[] = [null, null, null]
  const fastBase = cfg.base + cfg.boost
  let id = 0
  let trailId = 0
  let arrival = 60 + random() * 24
  while (arrival < cfg.quota - 30) {
    const progress = arrival / cfg.quota
    const gap = (cfg.gapFrom + (cfg.gapTo - cfg.gapFrom) * progress) * (0.82 + random() * 0.36)
    const lane = Math.floor(random() * 3)
    const kind: CarKind = cfg.truck > 0 && random() < cfg.truck ? 'truck' : 'car'
    const rolled = Math.round(cfg.traffic + (random() * 2 - 1) * cfg.spread)
    const speed = laneSpeed[lane] ?? Math.min(rolled, cfg.base - 10)
    const half = kind === 'truck' ? TRUCK_HALF : CAR_HALF
    const { at, enter } = spawnPoint(arrival)
    const slowCore = meetSpan(at, enter, speed, cfg.base, half)
    const quickCore = fastBase > cfg.base ? meetSpan(at, enter, speed, fastBase, half) : slowCore
    const slow: Span = { lane, from: slowCore.from - SWEEP_PAD, to: slowCore.to + SWEEP_PAD }
    const quick: Span = { lane, from: quickCore.from - SWEEP_PAD, to: quickCore.to + SWEEP_PAD }
    const union = { lane, from: Math.min(slow.from, quick.from), to: Math.max(slow.to, quick.to) }
    const slowRivals = (candidate: number) => spans.filter((other) => other.lane !== candidate && overlaps(other.slow, slow.from, slow.to)).length
    const quickRivals = (candidate: number) => spans.filter((other) => other.lane !== candidate && overlaps(other.quick, quick.from, quick.to)).length
    const order = [lane, (lane + 1) % 3, (lane + 2) % 3]
    const chosen = order.find((candidate) =>
      slow.from > slowEnd[candidate] + LANE_GAP && quick.from > quickEnd[candidate] + LANE_GAP &&
      !trails.some((trail) => trail.lane === candidate && overlaps(trail, union.from, union.to)) &&
      slowRivals(candidate) <= 1 && quickRivals(candidate) <= 1)
    if (chosen === undefined) {
      arrival += RETRY_STEP
      continue
    }
    id += 1
    queue.push({ id, at, lane: chosen, speed, kind, enter })
    laneSpeed[chosen] = speed
    slowEnd[chosen] = slow.to
    quickEnd[chosen] = quick.to
    spans.push({ lane: chosen, slow, quick })
    if (cfg.coins > 0 && random() < cfg.coins) {
      const count = 4 + Math.floor(random() * 2)
      const roll = Math.floor(random() * 3)
      const start = arrival + 12
      const end = start + (count - 1) * COIN_SPACING
      const trailLane = [roll, (roll + 1) % 3, (roll + 2) % 3]
        .find((candidate) => !spans.some((other) => other.lane === candidate &&
          (overlaps(other.slow, start - COIN_PAD, end + COIN_PAD) || overlaps(other.quick, start - COIN_PAD, end + COIN_PAD))))
      if (trailLane !== undefined) {
        trailId += 1
        trails.push({ lane: trailLane, from: start - COIN_PAD, to: end + COIN_PAD })
        for (let index = 0; index < count; index += 1) {
          const point = spawnPoint(start + index * COIN_SPACING)
          coins.push({ id: 500 + (trailId - 1) * 8 + index, at: point.at, lane: trailLane, enter: point.enter, trail: trailId })
        }
      }
    }
    arrival += gap
  }
  coins.sort((a, b) => a.at - b.at || a.enter - b.enter || a.id - b.id)
  return { queue, coins }
}

function carSpans(spec: RoadPlan): CarSpan[] {
  const quickBase = spec.boost > 0 ? spec.base + spec.boost : spec.base
  return spec.queue.map((car) => {
    const half = car.kind === 'truck' ? TRUCK_HALF : CAR_HALF
    return {
      lane: car.lane,
      slow: meetSpan(car.at, car.enter, car.speed, spec.base, half),
      quick: meetSpan(car.at, car.enter, car.speed, quickBase, half),
    }
  })
}

export function blockedSpans(spec: RoadPlan, pad = 0): Span[] {
  return carSpans(spec).map(({ lane, slow, quick }) => ({
    lane,
    from: Math.min(slow.from, quick.from) - pad,
    to: Math.max(slow.to, quick.to) + pad,
  }))
}

function sweepPeak(list: Span[]): number {
  const events: { d: number; lane: number; open: boolean }[] = []
  for (const span of list) {
    events.push({ d: span.from, lane: span.lane, open: true }, { d: span.to, lane: span.lane, open: false })
  }
  events.sort((a, b) => a.d - b.d || (a.open ? -1 : 1))
  const cover = [0, 0, 0]
  let peak = 0
  for (const event of events) {
    cover[event.lane] += event.open ? 1 : -1
    peak = Math.max(peak, (cover[0] > 0 ? 1 : 0) + (cover[1] > 0 ? 1 : 0) + (cover[2] > 0 ? 1 : 0))
  }
  return peak
}

// 两种速度剖面下分别扫描，返回最坏的同时占道车道数（≥3 即无活路）。
export function roadSaturation(spec: RoadPlan, pad = 0): number {
  const list = carSpans(spec)
  const padded = (span: Range): Span => ({ lane: 0, from: span.from - pad, to: span.to + pad })
  return Math.max(
    sweepPeak(list.map(({ lane, slow }) => ({ ...padded(slow), lane }))),
    sweepPeak(list.map(({ lane, quick }) => ({ ...padded(quick), lane }))),
  )
}

export function validateLevel(spec: TurboLevelSpec): string | null {
  let lastArrival = -Infinity
  const ids = new Set<number>()
  for (const car of spec.queue) {
    const arrival = car.at + car.enter
    if (!(arrival > lastArrival)) return 'car arrivals not increasing'
    lastArrival = arrival
    if (car.at < 0 || car.enter <= 0 || car.enter > SPAWN_AHEAD) return 'car spawn out of window'
    if (arrival < 40 || arrival > spec.quota - 18) return 'car arrival outside run'
    if (!Number.isInteger(car.lane) || car.lane < 0 || car.lane > 2) return 'lane out of range'
    if (car.speed < 8 || car.speed >= spec.base - 6) return 'car speed unfair'
    if (car.kind === 'truck' && spec.chapter < 2) return 'truck before chapter 2'
    if (ids.has(car.id)) return 'duplicate car id'
    ids.add(car.id)
  }
  if (spec.queue.length * MIN_CAR_GAP < spec.quota - 80) return 'traffic too sparse'
  if (spec.chapter < 3 && spec.coins.length > 0) return 'coins before chapter 3'
  if (spec.chapter >= 3 && spec.coins.length < MIN_COINS) return 'coin trails too sparse'
  const guarded = blockedSpans(spec, COIN_PAD)
  for (const coin of spec.coins) {
    const arrival = coin.at + coin.enter
    if (arrival < 40 || arrival > spec.quota - 10) return 'coin outside run'
    if (guarded.some((span) => span.lane === coin.lane && overlaps(span, arrival - 4, arrival + 4))) return 'coin overlaps traffic'
  }
  if (roadSaturation(spec, 0) >= 3) return 'road saturates'
  return null
}

export function chapterOf(level: number): number {
  let chapter = 1
  CHAPTER_STARTS.forEach((start, index) => { if (level >= start) chapter = index + 1 })
  return chapter
}

function configFor(level: number, chapter: number): ChapterConfig {
  const base = CHAPTERS[chapter - 1]
  const variant = level - CHAPTER_STARTS[chapter - 1]
  return {
    ...base,
    base: base.base + variant * 0.3,
    traffic: base.traffic + variant * 0.15,
    gapFrom: Math.max(24, base.gapFrom - variant * 0.35),
    gapTo: Math.max(20, base.gapTo - variant * 0.35),
  }
}

function assembleLevel(level: number, cfg: ChapterConfig, attempt: number): TurboLevelSpec {
  const chapter = chapterOf(level)
  const { queue, coins } = buildStream(level, cfg, attempt)
  return {
    level, chapter, variant: level - CHAPTER_STARTS[chapter - 1], ...cfg, modeName: cfg.name, queue, coins,
    carCount: queue.length, coinCount: coins.length,
  }
}

// 校验闸门：密度/金币配额不足等罕见种子会被换 seed 重生成，上限 REGEN_LIMIT 次。
export function resolveTurboLevel(level: number, cfg: ChapterConfig): { spec: TurboLevelSpec; attempts: number } {
  let attempts = 0
  let spec = assembleLevel(level, cfg, 0)
  while (validateLevel(spec) !== null && attempts < REGEN_LIMIT) {
    attempts += 1
    spec = assembleLevel(level, cfg, attempts)
  }
  return { spec, attempts }
}

const cache = new Map<number, TurboLevelSpec>()

export function getTurboLevel(level: number): TurboLevelSpec {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const { spec } = resolveTurboLevel(safe, configFor(safe, chapterOf(safe)))
  cache.set(safe, spec)
  return spec
}

export function createTurboState(level: number): GameState {
  const spec = getTurboLevel(level)
  const plan: RoadPlan = { quota: spec.quota, base: spec.base, boost: spec.boost, queue: spec.queue, coins: spec.coins }
  return createGameState(plan)
}
