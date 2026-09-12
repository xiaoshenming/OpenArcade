import { mulberry32, seedFor } from '../../platform/rng'
import { FIELD, HOMING_MAX, SPLIT_NEVER, SHIP_RADIUS, SHIP_Y, SPAWN_Y, type CorridorPlan, type MeteorKind, type ShardSpec, type Spawn } from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
export const CHAPTERS = CHAPTER_STARTS.length
export const FAIR_WIDTH = FIELD.width * 0.75
export const HOMING_GAP = 2.2
export const REGEN_LIMIT = 5
const PAD_SECONDS = 0.2
const FINALE_KINDS: readonly MeteorKind[] = ['straight', 'diagonal', 'splitter', 'homing']

const CHAPTER_COPY = [
  ['静廊·直线雨', '陨石直线下落，横移闪避保持存活'],
  ['斜风·偏航雨', '斜向陨石切入走廊，提前预判落点'],
  ['碎裂·分身雨', '巨型陨石会在半空裂成两枚碎片'],
  ['猎手·追踪雨', '猎手陨石缓慢修正航向追踪飞船'],
  ['终局·回廊风暴', '全类型齐发，贴近擦弹可获赏分'],
] as const

const ALLOWED: readonly MeteorKind[][] = [
  ['straight'],
  ['straight', 'diagonal'],
  ['straight', 'diagonal', 'splitter'],
  ['straight', 'diagonal', 'splitter', 'homing'],
  ['straight', 'diagonal', 'splitter', 'homing'],
]

export interface CorridorLevel extends CorridorPlan {
  level: number
  chapter: number
  variant: number
  intervalFrom: number
  intervalTo: number
  speed: number
  drift: number
  turn: number
  diagonalChance: number
  splitterChance: number
  homingChance: number
  spawnCount: number
  title: string
  detail: string
}

interface CorridorConfig {
  duration: number
  speed: number
  intervalFrom: number
  intervalTo: number
  drift: number
  turn: number
  diagonalChance: number
  splitterChance: number
  homingChance: number
}

export interface ResolvedCorridorLevel { spec: CorridorLevel; attempts: number }

export function configFor(chapter: number, variant: number): CorridorConfig {
  const duration = 30 + chapter * 15
  const speed = 112 + chapter * 14 + variant * 1.5
  const intervalFrom = Math.max(0.52, 1.06 - chapter * 0.07 - variant * 0.004)
  return {
    duration,
    speed,
    intervalFrom,
    intervalTo: intervalFrom * 0.72,
    drift: chapter >= 2 ? 30 + variant * 2 : 0,
    turn: chapter >= 4 ? 150 + variant * 9 : 0,
    diagonalChance: chapter >= 2 ? Math.min(0.34, 0.24 + variant * 0.012) : 0,
    splitterChance: chapter >= 3 ? Math.min(0.24, 0.13 + variant * 0.011) : 0,
    homingChance: chapter >= 4 ? Math.min(0.16, 0.09 + variant * 0.008) : 0,
  }
}

function pickKind(random: () => number, cfg: CorridorConfig): MeteorKind {
  const roll = random()
  if (roll < cfg.splitterChance) return 'splitter'
  if (roll < cfg.splitterChance + cfg.homingChance) return 'homing'
  if (roll < cfg.splitterChance + cfg.homingChance + cfg.diagonalChance) return 'diagonal'
  return 'straight'
}

function radiusFor(kind: MeteorKind, random: () => number): number {
  if (kind === 'splitter') return 17 + Math.round(random() * 5)
  if (kind === 'straight') return 10 + Math.round(random() * 7)
  return 9 + Math.round(random() * 4)
}

function buildQueue(level: number, cfg: CorridorConfig, attempt: number): Spawn[] {
  const random = mulberry32(seedFor(level + attempt, 11))
  const queue: Spawn[] = []
  let t = 0.9
  let id = 0
  let lastHoming = -HOMING_GAP
  while (t < cfg.duration - 2.5) {
    id += 1
    const side = random() < 0.5 ? -1 : 1
    const picked = pickKind(random, cfg)
    const kind = picked === 'homing' && t - lastHoming < HOMING_GAP ? 'straight' : picked
    if (kind === 'homing') lastHoming = t
    const x = 26 + random() * (FIELD.width - 52)
    const r = radiusFor(kind, random)
    const speed = Math.round(cfg.speed * (0.88 + random() * 0.26))
    const vx = kind === 'diagonal' ? side * Math.round(cfg.drift + r * 3) : 0
    const splitY = kind === 'splitter' ? Math.round(FIELD.height * (0.3 + random() * 0.24)) : SPLIT_NEVER
    const shardR = Math.max(7, Math.round(r * 0.42))
    const shards: ShardSpec[] = kind === 'splitter'
      ? [0, 1].map((index) => ({
        dx: shardR,
        vx: (index === 0 ? -1 : 1) * Math.round(cfg.drift * 0.8 + 30),
        r: shardR,
        speed: Math.round(speed * (1.14 + index * 0.06)),
      }))
      : []
    queue.push({ id, t: Math.round(t * 1000) / 1000, x: Math.round(x), kind, r, speed, vx, splitY, shards, turn: kind === 'homing' ? cfg.turn : 0 })
    const progress = t / cfg.duration
    t += (cfg.intervalFrom + (cfg.intervalTo - cfg.intervalFrom) * progress) * (0.75 + random() * 0.5)
  }
  return queue
}

interface SweepEvent { t: number; width: number; open: boolean }

function blockedWidth(x: number, r: number): number {
  const half = r + SHIP_RADIUS + 5
  return Math.max(0, Math.min(FIELD.width, x + half) - Math.max(0, x - half))
}

function pushBlock(events: SweepEvent[], x: number, r: number, speed: number, arrive: number) {
  const width = blockedWidth(x, r)
  if (width <= 0) return
  const half = (r + SHIP_RADIUS) / speed + PAD_SECONDS
  events.push({ t: arrive - half, width, open: true }, { t: arrive + half, width, open: false })
}

export function maxBlockedWidth(spec: CorridorLevel): number {
  const events: SweepEvent[] = []
  const fall = SHIP_Y - SPAWN_Y
  for (const spawn of spec.queue) {
    if (spawn.kind === 'splitter') {
      const tSplit = spawn.t + (spawn.splitY - SPAWN_Y) / spawn.speed
      spawn.shards.forEach((shard, index) => {
        const after = (SHIP_Y - spawn.splitY) / shard.speed
        const x = spawn.x + (index === 0 ? -shard.dx : shard.dx) + shard.vx * after
        pushBlock(events, x, shard.r, shard.speed, tSplit + after)
      })
      continue
    }
    const travel = fall / spawn.speed
    // Homing meteors chase the ship, so predict their occupancy with an amplified
    // drift toward mid-field capped at HOMING_MAX instead of their initial vx.
    const chase = spawn.kind === 'homing'
      ? Math.max(-HOMING_MAX, Math.min(HOMING_MAX, (FIELD.width / 2 - spawn.x) / travel))
      : spawn.vx
    pushBlock(events, spawn.x + chase * travel, spawn.r, spawn.speed, spawn.t + travel)
  }
  events.sort((a, b) => a.t - b.t || (a.open ? -1 : 1))
  let open = 0
  let peak = 0
  for (const event of events) {
    open = event.open ? open + event.width : open - event.width
    peak = Math.max(peak, open)
  }
  return peak
}

export function validateLevel(spec: CorridorLevel): string | null {
  let last = -1
  let lastHoming = -HOMING_GAP
  for (const spawn of spec.queue) {
    if (spawn.t <= last) return 'spawn times not increasing'
    if (spawn.t < 0.5 || spawn.t > spec.duration - 2) return 'spawn outside playable window'
    if (spawn.x < 16 || spawn.x > FIELD.width - 16) return 'spawn x out of bounds'
    if (spawn.r < 8 || spawn.r > 24) return 'radius out of bounds'
    if (!ALLOWED[spec.chapter - 1].includes(spawn.kind)) return `kind ${spawn.kind} not allowed in chapter ${spec.chapter}`
    if (spawn.kind === 'splitter' && (spawn.shards.length !== 2 || spawn.shards.some((shard) => shard.r >= spawn.r || shard.speed <= spawn.speed))) return 'splitter malformed'
    if (spawn.kind === 'homing') {
      if (spawn.t - lastHoming < HOMING_GAP) return 'homing too dense'
      lastHoming = spawn.t
    }
    last = spawn.t
  }
  if (spec.queue.length < 8) return 'too few meteors'
  if (spec.chapter === CHAPTERS && FINALE_KINDS.some((kind) => !spec.queue.some((spawn) => spawn.kind === kind))) return 'finale missing a meteor kind'
  if (maxBlockedWidth(spec) > FAIR_WIDTH) return 'corridor saturates'
  return null
}

function assembleCorridorLevel(level: number, cfg: CorridorConfig, attempt: number): CorridorLevel {
  const chapter = chapterOf(level)
  const variant = level - CHAPTER_STARTS[chapter - 1]
  const queue = buildQueue(level, cfg, attempt)
  return {
    level, chapter, variant, ...cfg, graze: chapter === CHAPTERS, queue, spawnCount: queue.length,
    title: level === LEVEL_COUNT ? '终局·回廊风暴' : CHAPTER_COPY[chapter - 1][0], detail: CHAPTER_COPY[chapter - 1][1],
  }
}

// Validation gates generation: a seed whose stream fails the fairness/structure checks
// is regenerated with seed+1, bounded by REGEN_LIMIT attempts before giving up.
export function resolveCorridorLevel(level: number, cfg: CorridorConfig): ResolvedCorridorLevel {
  let attempts = 0
  let spec = assembleCorridorLevel(level, cfg, 0)
  while (validateLevel(spec) !== null && attempts < REGEN_LIMIT) {
    attempts += 1
    spec = assembleCorridorLevel(level, cfg, attempts)
  }
  return { spec, attempts }
}

const cache = new Map<number, CorridorLevel>()

export function chapterOf(level: number): number {
  let chapter = 1
  CHAPTER_STARTS.forEach((start, index) => { if (level >= start) chapter = index + 1 })
  return chapter
}

export function getCorridorLevel(level: number): CorridorLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const chapter = chapterOf(safe)
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  const { spec } = resolveCorridorLevel(safe, configFor(chapter, variant))
  cache.set(safe, spec)
  return spec
}
