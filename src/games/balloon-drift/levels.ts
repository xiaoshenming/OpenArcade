import { mulberry32, seedFor } from '../../platform/rng'
import { BALLOON_RADIUS, CHAIN_GAP, COLORS, FIELD, SPIKE_RADIUS, type BalloonColor, type BalloonPlan, type Spawn } from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
export const CHAPTERS = CHAPTER_STARTS.length

const CHAPTER_COPY = [
  ['初浮·纯红气流', '红气球从底部升起，点破配额数量即过关'],
  ['辨色·目标出击', '只扎当前目标色，扎错颜色扣 50 分'],
  ['荆棘·黑刺同升', '黑刺球混入气流，误触直接扣 1 命'],
  ['侧风·串球齐飞', '气球随风正弦漂移，一串三只一次全破 +200'],
  ['终局·浮踪风暴', '全规则叠加并加速，三条命内完成配额'],
] as const

const COLOR_COPY: Record<BalloonColor, string> = { red: '红', gold: '金', teal: '青', violet: '紫' }

interface BalloonConfig {
  duration: number
  quota: number
  intervalFrom: number
  intervalTo: number
  speedFrom: number
  speedTo: number
  windAmp: number
  windFreq: number
  spikeChance: number
  chainChance: number
  targetShare: number
  target: BalloonColor
  lives: number
}

export interface BalloonLevel extends BalloonPlan {
  level: number
  chapter: number
  variant: number
  intervalFrom: number
  intervalTo: number
  speedFrom: number
  speedTo: number
  spikeChance: number
  chainChance: number
  targetShare: number
  title: string
  detail: string
}

function configFor(chapter: number, variant: number, level: number): BalloonConfig {
  const interval = Math.max(0.5, 1.15 - chapter * 0.12 - variant * 0.004)
  const speed = 74 + chapter * 12 + variant * 1.2
  return {
    duration: 56 - chapter * 2,
    quota: chapter === 1 ? 12 : 12 + chapter * 2 + Math.floor(variant / 2),
    intervalFrom: interval,
    intervalTo: interval * 0.72,
    speedFrom: Math.round(speed),
    speedTo: Math.round(speed * 1.24),
    windAmp: chapter >= 4 ? Math.min(64, 36 + variant * 2) : chapter >= 3 ? Math.min(26, 12 + variant * 2) : 0,
    windFreq: chapter >= 4 ? 0.8 + variant * 0.03 : chapter >= 3 ? 0.55 : 0,
    spikeChance: chapter >= 3 ? Math.min(0.16, 0.08 + variant * 0.005) : 0,
    chainChance: chapter >= 4 ? Math.min(0.2, 0.1 + variant * 0.005) : 0,
    targetShare: chapter === 1 ? 1 : Math.min(0.55, 0.42 + variant * 0.005),
    target: chapter === 1 ? 'red' : COLORS[level % COLORS.length],
    lives: chapter <= 2 ? 4 : chapter <= 4 ? 3 : 2,
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function buildQueue(level: number, cfg: BalloonConfig): Spawn[] {
  const random = mulberry32(seedFor(level, 23))
  const queue: Spawn[] = []
  const pad = BALLOON_RADIUS + cfg.windAmp + 12
  const minX = pad + 8
  const maxX = FIELD.width - pad - 8
  const span = Math.max(1, maxX - minX)
  let t = 0.6
  let id = 0
  let chainId = 0
  while (t < cfg.duration - 2.2) {
    const speed = Math.round(cfg.speedFrom * (0.92 + random() * 0.24))
    if (random() < cfg.chainChance) {
      chainId += 1
      const center = minX + CHAIN_GAP + random() * Math.max(1, span - CHAIN_GAP * 2)
      for (const offset of [-1, 0, 1]) {
        id += 1
        queue.push({ id, t: round2(t), x: Math.round(center + offset * CHAIN_GAP), speed, kind: 'balloon', color: cfg.target, chain: chainId })
      }
    } else {
      const spike = random() < cfg.spikeChance
      const color = !spike && random() >= cfg.targetShare
        ? COLORS.filter((item) => item !== cfg.target)[Math.floor(random() * (COLORS.length - 1)) % (COLORS.length - 1)]
        : cfg.target
      id += 1
      queue.push({ id, t: round2(t), x: Math.round(minX + random() * span), speed, kind: spike ? 'spike' : 'balloon', color, chain: -1 })
    }
    const progress = t / cfg.duration
    t += (cfg.intervalFrom + (cfg.intervalTo - cfg.intervalFrom) * progress) * (0.72 + random() * 0.56)
  }
  let targets = queue.filter((item) => item.kind === 'balloon' && item.color === cfg.target).length
  for (const item of queue) {
    if (targets >= cfg.quota + 6) break
    if (item.kind === 'balloon' && item.color !== cfg.target) {
      item.color = cfg.target
      targets += 1
    }
  }
  return queue
}

export function validateLevel(spec: BalloonLevel): string | null {
  let last = -1
  for (const spawn of spec.queue) {
    if (spawn.t < 0.4 || spawn.t > spec.duration - 1.2) return 'launch outside window'
    if (spawn.t < last) return 'launch times not increasing'
    last = spawn.t
    if (spawn.speed < 40 || spawn.speed > 240) return 'speed out of bounds'
    const pad = (spawn.kind === 'spike' ? SPIKE_RADIUS : BALLOON_RADIUS) + spec.windAmp + 8
    if (spawn.x < pad || spawn.x > FIELD.width - pad) return 'launch x out of bounds'
    if (spawn.kind === 'spike' && spec.chapter < 3) return 'spike before chapter 3'
    if (spawn.chain >= 0 && spec.chapter < 4) return 'chain before chapter 4'
  }
  const groups = new Map<number, Spawn[]>()
  for (const spawn of spec.queue) {
    if (spawn.chain < 0) continue
    const group = groups.get(spawn.chain) ?? []
    group.push(spawn)
    groups.set(spawn.chain, group)
  }
  for (const [, group] of groups) {
    if (group.length !== 3) return 'chain must have three balloons'
    if (new Set(group.map((spawn) => spawn.t)).size !== 1) return 'chain launches must align'
    if (group.some((spawn) => spawn.color !== spec.target)) return 'chain must be target color'
    const xs = group.map((spawn) => spawn.x).sort((a, b) => a - b)
    if (xs[1] - xs[0] !== CHAIN_GAP || xs[2] - xs[1] !== CHAIN_GAP) return 'chain spacing malformed'
  }
  const targets = spec.queue.filter((spawn) => spawn.kind === 'balloon' && spawn.color === spec.target)
  if (targets.length < spec.quota + 3) return 'quota not safely reachable'
  if (spec.chapter === 1 && spec.queue.some((spawn) => spawn.kind === 'balloon' && spawn.color !== 'red')) return 'chapter 1 must be pure red'
  if (spec.queue.length < spec.duration * 0.5) return 'schedule too sparse'
  return null
}

const cache = new Map<number, BalloonLevel>()

function chapterOf(level: number): number {
  let chapter = 1
  CHAPTER_STARTS.forEach((start, index) => { if (level >= start) chapter = index + 1 })
  return chapter
}

export function getBalloonLevel(level: number): BalloonLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const chapter = chapterOf(safe)
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  const cfg = configFor(chapter, variant, safe)
  const spec: BalloonLevel = {
    level: safe, chapter, variant, ...cfg, queue: buildQueue(safe, cfg),
    title: safe === LEVEL_COUNT ? '终局·浮踪风暴' : CHAPTER_COPY[chapter - 1][0],
    detail: chapter === 1 ? CHAPTER_COPY[chapter - 1][1] : `目标${COLOR_COPY[cfg.target]}色 · ${CHAPTER_COPY[chapter - 1][1]}`,
  }
  cache.set(safe, spec)
  return spec
}
