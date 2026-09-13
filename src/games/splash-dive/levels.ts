import { mulberry32, seedFor } from '../../platform/rng'
import {
  DRIFT_MAX, DIVER_R, FIELD, JELLY_MAX, JELLY_R, JELLY_RISE, MINE_R_MAX, MINE_R_MIN, PEARL_R, SPAWN_BELOW,
  createGameState, jellyArrivalSpan, type CurrentZone, type DivePlan, type GameState, type Hazard,
  type HazardKind, type Pearl,
} from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
export const FAIR_WIDTH = FIELD.width * 0.72
export const SWEEP_PAD = 18
export const JELLY_TAU_MAX = (FAIR_WIDTH / 2 - JELLY_R - DIVER_R - 2) / JELLY_MAX
export const JELLY_ENTER_MAX = Math.max(24, Math.floor(JELLY_TAU_MAX * (24 + JELLY_RISE)))
export const PEARL_SPACING = 9
export const PEARL_PAD = 10
export const RETRY_STEP = 6
export const REGEN_LIMIT = 5
export const MIN_HAZARD_GAP = 46
export const MIN_PEARLS = 6

interface ChapterConfig {
  name: string
  title: string
  detail: string
  quota: number
  base: number
  boost: number
  gapFrom: number
  gapTo: number
  drift: number
  jelly: number
  currents: number
  currentPower: number
  pearls: number
  combo: boolean
}

const CHAPTERS: ChapterConfig[] = [
  { name: 'drift', title: '浅海拾贝', detail: '缓慢下潜收集珍珠，小心锚定水雷', quota: 300, base: 20, boost: 12, gapFrom: 40, gapTo: 34, drift: 0, jelly: 0, currents: 0, currentPower: 0, pearls: 0.4, combo: false },
  { name: 'tide', title: '暗礁密林', detail: '雷区更密，水雷开始横向漂移', quota: 450, base: 22, boost: 12, gapFrom: 34, gapTo: 28, drift: 16, jelly: 0, currents: 0, currentPower: 0, pearls: 0.42, combo: false },
  { name: 'stream', title: '洋流回廊', detail: '留意顶部预警：洋流会水平推移你', quota: 600, base: 24, boost: 12, gapFrom: 32, gapTo: 26, drift: 20, jelly: 0, currents: 2, currentPower: 55, pearls: 0.44, combo: false },
  { name: 'lure', title: '幽光水母', detail: '发光水母会缓慢将你吸向它们', quota: 650, base: 24, boost: 13, gapFrom: 30, gapTo: 24, drift: 22, jelly: 0.16, currents: 3, currentPower: 60, pearls: 0.46, combo: false },
  { name: 'abyss', title: '深渊万珠', detail: '全机制叠加，连收珍珠提升倍率', quota: 800, base: 26, boost: 14, gapFrom: 28, gapTo: 22, drift: 26, jelly: 0.14, currents: 4, currentPower: 68, pearls: 0.38, combo: true },
]

export interface Box { from: number; to: number; xMin: number; xMax: number; kind: HazardKind }

export interface DiveLevelSpec extends DivePlan {
  level: number
  chapter: number
  variant: number
  modeName: string
  title: string
  detail: string
  gapFrom: number
  gapTo: number
  drift: number
  hazardCount: number
  pearlCount: number
}

function mineBox(hazard: Hazard, base: number, boost: number): Box {
  const depth = hazard.at + hazard.enter
  const r = hazard.r + DIVER_R
  const tauMin = hazard.enter / (base + boost)
  const tauMax = hazard.enter / base
  const x0 = hazard.x + hazard.drift * tauMin
  const x1 = hazard.x + hazard.drift * tauMax
  return {
    from: depth - r - SWEEP_PAD,
    to: depth + r + SWEEP_PAD,
    xMin: Math.min(x0, x1) - r,
    xMax: Math.max(x0, x1) + r,
    kind: 'mine',
  }
}

// 水母追踪包络：以最大横移速度 JELLY_MAX 乘以下沉耗时 tau（慢速剖面，最坏情况）。
// 到达前水母可能横扫的横向范围按 ±JELLY_MAX×tau 计，不再用经验 pad 低估。
function jellyBox(hazard: Hazard, base: number, boost: number): Box {
  const span = jellyArrivalSpan(hazard.at, hazard.enter, base, boost)
  const r = hazard.r + DIVER_R
  const tau = hazard.enter / (base + JELLY_RISE)
  const reach = JELLY_MAX * tau + r
  return {
    from: span.from - r - SWEEP_PAD,
    to: span.to + r + SWEEP_PAD,
    xMin: hazard.x - reach,
    xMax: hazard.x + reach,
    kind: 'jelly',
  }
}

const boxOf = (hazard: Hazard, base: number, boost: number) =>
  hazard.kind === 'jelly' ? jellyBox(hazard, base, boost) : mineBox(hazard, base, boost)

function sweepWidth(boxes: Box[]): number {
  const events: { d: number; w: number; open: boolean }[] = []
  for (const box of boxes) {
    const width = box.xMax - box.xMin
    events.push({ d: box.from, w: width, open: true }, { d: box.to, w: width, open: false })
  }
  events.sort((a, b) => a.d - b.d || (a.open ? -1 : 1))
  let open = 0
  let peak = 0
  for (const event of events) {
    open = event.open ? open + event.w : open - event.w
    peak = Math.max(peak, open)
  }
  return peak
}

export function hazardBoxes(plan: DivePlan): Box[] {
  return plan.hazards.map((hazard) => boxOf(hazard, plan.base, plan.base + plan.boost))
}

export function maxBlockedWidth(plan: DivePlan): number {
  return sweepWidth(hazardBoxes(plan))
}

const pearlUnsafe = (box: Box, from: number, to: number, xMin: number, xMax: number) =>
  box.from < to && box.to > from && box.xMin < xMax && box.xMax > xMin

// 构造性公平：逐雷计算「到达深度 × 漂移后横向占宽」的箱体，扫描线保证任意深度
// 的同时占宽 ≤ FAIR_WIDTH；水母的追踪包络（±JELLY_MAX×tau）过宽，因此收紧水母生成
// 区（更小的 enter，缩短可追踪时长）；珍珠串避开所有危险箱体，后续危险物也回避已布珍珠串。
function buildStream(level: number, cfg: ChapterConfig, attempt: number) {
  const random = mulberry32(seedFor(level, 23 + attempt * 3))
  const enterCap = Math.max(24, Math.floor(JELLY_TAU_MAX * (cfg.base + JELLY_RISE)))
  const hazards: Hazard[] = []
  const pearls: Pearl[] = []
  const boxes: Box[] = []
  const pearlSpans: Box[] = []
  let id = 0
  let trailId = 0
  let arrival = 55 + random() * 20
  while (arrival < cfg.quota - 25) {
    const progress = arrival / cfg.quota
    const gap = (cfg.gapFrom + (cfg.gapTo - cfg.gapFrom) * progress) * (0.8 + random() * 0.4)
    const forced = cfg.jelly > 0 && id > 0 && id % 9 === 0
    const kind: HazardKind = forced || (cfg.jelly > 0 && random() < cfg.jelly) ? 'jelly' : 'mine'
    const at = Math.max(0, arrival - (kind === 'jelly' ? enterCap : SPAWN_BELOW))
    const r = kind === 'jelly' ? JELLY_R : MINE_R_MIN + Math.round(random() * (MINE_R_MAX - MINE_R_MIN))
    const drift = kind === 'mine' && cfg.drift > 0 ? Math.round((random() * 2 - 1) * cfg.drift) : 0
    const x = 40 + random() * (FIELD.width - 80)
    const hazard: Hazard = { id: id + 1, at, x, enter: arrival - at, r, drift, kind }
    const box = boxOf(hazard, cfg.base, cfg.base + cfg.boost)
    const clashesPearl = pearlSpans.some((span) => pearlUnsafe(box, span.from, span.to, span.xMin, span.xMax))
    if (sweepWidth([...boxes, box]) > FAIR_WIDTH || clashesPearl) {
      arrival += RETRY_STEP
      continue
    }
    id += 1
    hazards.push(hazard)
    boxes.push(box)
    if (random() < cfg.pearls) {
      const count = 3 + Math.floor(random() * 3)
      const px = 36 + random() * (FIELD.width - 72)
      const start = arrival + 10
      const end = start + (count - 1) * PEARL_SPACING
      const xMin = px - PEARL_R - 6
      const xMax = px + PEARL_R + 6
      if (!boxes.some((other) => pearlUnsafe(other, start - PEARL_PAD, end + PEARL_PAD, xMin, xMax))) {
        trailId += 1
        pearlSpans.push({ from: start - PEARL_PAD, to: end + PEARL_PAD, xMin, xMax, kind: 'mine' })
        for (let index = 0; index < count; index += 1) {
          const depth = start + index * PEARL_SPACING
          const pAt = Math.max(0, depth - SPAWN_BELOW)
          pearls.push({ id: 400 + (trailId - 1) * 8 + index, at: pAt, x: px, enter: depth - pAt, trail: trailId })
        }
      }
    }
    arrival += gap
  }
  pearls.sort((a, b) => a.at - b.at || a.enter - b.enter || a.id - b.id)
  return { hazards, pearls }
}

function buildZones(cfg: ChapterConfig, random: () => number): CurrentZone[] {
  const zones: CurrentZone[] = []
  const slot = (cfg.quota - 120) / Math.max(1, cfg.currents)
  for (let index = 0; index < cfg.currents; index += 1) {
    const from = 60 + index * slot + random() * 12
    const to = Math.min(cfg.quota - 20, from + slot * (0.55 + random() * 0.3))
    const vx = (random() < 0.5 ? -1 : 1) * Math.round(cfg.currentPower * (0.7 + random() * 0.5))
    zones.push({ from: Math.round(from), to: Math.round(to), vx })
  }
  return zones
}

export function validateLevel(spec: DiveLevelSpec): string | null {
  let lastArrival = -Infinity
  const ids = new Set<number>()
  for (const hazard of spec.hazards) {
    const arrival = hazard.at + hazard.enter
    if (!(arrival > lastArrival)) return 'hazard arrivals not increasing'
    lastArrival = arrival
    if (hazard.at < 0 || hazard.enter <= 0 || hazard.enter > SPAWN_BELOW) return 'hazard spawn out of window'
    if (arrival < 40 || arrival > spec.quota - 15) return 'hazard arrival outside dive'
    if (hazard.x < 30 || hazard.x > FIELD.width - 30) return 'hazard x out of range'
    if (hazard.kind === 'mine' && (hazard.r < MINE_R_MIN || hazard.r > MINE_R_MAX)) return 'mine radius out of range'
    if (hazard.kind === 'jelly' && hazard.r !== JELLY_R) return 'jelly radius malformed'
    if (Math.abs(hazard.drift) > DRIFT_MAX) return 'drift too strong'
    if (Math.abs(hazard.drift) > 0 && spec.chapter < 2) return 'drift before chapter 2'
    if (hazard.kind === 'jelly' && spec.chapter < 4) return 'jelly before chapter 4'
    if (ids.has(hazard.id)) return 'duplicate hazard id'
    ids.add(hazard.id)
  }
  if (spec.hazards.length * MIN_HAZARD_GAP < spec.quota - 90) return 'hazards too sparse'
  if (spec.chapter >= 2 && !spec.hazards.some((hazard) => hazard.drift !== 0)) return 'drift missing'
  if (spec.chapter >= 4 && !spec.hazards.some((hazard) => hazard.kind === 'jelly')) return 'jelly missing'
  if (spec.chapter < 3 && spec.zones.length > 0) return 'currents before chapter 3'
  if (spec.chapter >= 3 && spec.zones.length < 2) return 'currents missing'
  for (const zone of spec.zones) {
    if (zone.from >= zone.to || zone.from < 30 || zone.to > spec.quota) return 'zone out of range'
    if (Math.abs(zone.vx) < 30 || Math.abs(zone.vx) > 120) return 'zone strength out of range'
  }
  if (spec.pearls.length < MIN_PEARLS) return 'pearls too sparse'
  const guarded = hazardBoxes(spec)
  for (const pearl of spec.pearls) {
    const depth = pearl.at + pearl.enter
    if (depth < 40 || depth > spec.quota - 8) return 'pearl outside dive'
    if (pearl.x < 24 || pearl.x > FIELD.width - 24) return 'pearl x out of range'
    if (guarded.some((box) => pearlUnsafe(box, depth - 6, depth + 6, pearl.x - PEARL_R - 4, pearl.x + PEARL_R + 4))) return 'pearl overlaps hazard'
  }
  if (maxBlockedWidth(spec) > FAIR_WIDTH) return 'channel saturates'
  if (spec.chapter === CHAPTER_STARTS.length && !spec.combo) return 'finale lacks combo'
  if (spec.chapter < CHAPTER_STARTS.length && spec.combo) return 'combo before finale'
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
    base: base.base + variant * 0.12,
    gapFrom: Math.max(20, base.gapFrom - variant * 0.25),
    gapTo: Math.max(17, base.gapTo - variant * 0.25),
    drift: base.drift > 0 ? Math.min(DRIFT_MAX, base.drift + variant * 0.4) : 0,
  }
}

function assembleLevel(level: number, cfg: ChapterConfig, attempt: number): DiveLevelSpec {
  const chapter = chapterOf(level)
  const random = mulberry32(seedFor(level, 91 + attempt * 3))
  const { hazards, pearls } = buildStream(level, cfg, attempt)
  return {
    level, chapter, variant: level - CHAPTER_STARTS[chapter - 1], ...cfg, modeName: cfg.name,
    zones: buildZones(cfg, random), hazards, pearls,
    hazardCount: hazards.length, pearlCount: pearls.length,
  }
}

// 校验闸门：密度不足等罕见种子换 seed 重生成，上限 REGEN_LIMIT 次。
export function resolveDiveLevel(level: number, cfg: ChapterConfig): { spec: DiveLevelSpec; attempts: number } {
  let attempts = 0
  let spec = assembleLevel(level, cfg, 0)
  while (validateLevel(spec) !== null && attempts < REGEN_LIMIT) {
    attempts += 1
    spec = assembleLevel(level, cfg, attempts)
  }
  return { spec, attempts }
}

const cache = new Map<number, DiveLevelSpec>()

export function getDiveLevel(level: number): DiveLevelSpec {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const { spec } = resolveDiveLevel(safe, configFor(safe, chapterOf(safe)))
  cache.set(safe, spec)
  return spec
}

export function createDiveState(level: number): GameState {
  const spec = getDiveLevel(level)
  const plan: DivePlan = {
    quota: spec.quota, base: spec.base, boost: spec.boost, combo: spec.combo,
    zones: spec.zones, hazards: spec.hazards, pearls: spec.pearls,
  }
  return createGameState(plan)
}
