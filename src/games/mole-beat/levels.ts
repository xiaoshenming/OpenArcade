import { mulberry32, seedFor } from '../../platform/rng'
import { HOLES, MIN_STAY, type MoleKind, type MolePlan, type MoleSpawn } from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
export const CHAPTERS = CHAPTER_STARTS.length

const CHAPTER_COPY = [
  ['初醒·慢拍草皮', '地鼠按固定节拍升洞，敲满配额即过关'],
  ['双洞·同现节拍', '同一时刻两洞并起，分配好你的点击'],
  ['雷管·炸弹鼠', '混入炸弹鼠，误击扣 100 分并眩晕半秒'],
  ['鎏金·极速金鼠', '金鼠分值三倍，但只停留一瞬'],
  ['终局·节拍风暴', '高速调度叠加全部规则，连击倍率封顶两倍'],
] as const

interface MoleConfig {
  duration: number
  quota: number
  intervalFrom: number
  intervalTo: number
  stay: number
  goldStay: number
  doubleChance: number
  bombChance: number
  goldChance: number
  duoMix: number
  combo: boolean
  comboWindow: number
}

export interface MoleLevel extends MolePlan {
  level: number
  chapter: number
  variant: number
  intervalFrom: number
  intervalTo: number
  stay: number
  doubleChance: number
  bombChance: number
  goldChance: number
  duoMix: number
  comboWindow: number
  title: string
  detail: string
}

function configFor(chapter: number, variant: number): MoleConfig {
  const interval = Math.max(0.46, 1.02 - chapter * 0.1 - variant * 0.004)
  return {
    duration: 62 - chapter * 2,
    quota: chapter === 1 ? 15 : 15 + chapter * 2 + Math.floor(variant / 3),
    intervalFrom: interval,
    intervalTo: interval * 0.7,
    stay: Math.max(0.56, 1.18 - chapter * 0.095 - variant * 0.004),
    goldStay: Math.max(0.4, 0.62 - chapter * 0.028),
    doubleChance: chapter >= 2 ? Math.min(0.52, 0.26 + variant * 0.014 + chapter * 0.015) : 0,
    bombChance: chapter >= 3 ? Math.min(0.22, 0.1 + variant * 0.006) : 0,
    goldChance: chapter >= 4 ? Math.min(0.18, 0.09 + variant * 0.005) : 0,
    duoMix: chapter >= 5 ? 0.5 : 0,
    combo: chapter >= 5,
    comboWindow: chapter >= 5 ? Math.max(1.6, 2.6 - variant * 0.08) : 0,
  }
}

function pickHole(random: () => number, queue: readonly MoleSpawn[], t: number, stay: number): number {
  const busy = new Set(queue.filter((spawn) => t < spawn.t + spawn.stay && t + stay > spawn.t).map((spawn) => spawn.hole))
  const free: number[] = []
  for (let hole = 0; hole < HOLES; hole += 1) if (!busy.has(hole)) free.push(hole)
  if (!free.length) return -1
  return free[Math.floor(random() * free.length) % free.length]
}

function buildQueue(level: number, cfg: MoleConfig): MoleSpawn[] {
  const random = mulberry32(seedFor(level, 17))
  const queue: MoleSpawn[] = []
  let t = 0.7
  let id = 0
  while (t < cfg.duration - 0.55) {
    const stay = Math.max(MIN_STAY, Math.round(cfg.stay * (0.85 + random() * 0.3)))
    const progress = t / cfg.duration
    const crowd = random() < cfg.doubleChance ? 2 : 1
    for (let index = 0; index < crowd; index += 1) {
      const roll = random()
      let kind: MoleKind = roll < cfg.bombChance ? 'bomb' : roll < cfg.bombChance + cfg.goldChance ? 'gold' : 'normal'
      if (crowd === 2 && cfg.duoMix > 0 && random() < cfg.duoMix) kind = index === 0 ? 'gold' : 'bomb'
      const hole = pickHole(random, queue, t, kind === 'gold' ? cfg.goldStay : stay)
      if (hole < 0) continue
      id += 1
      queue.push({ id, t: Math.round(t * 100) / 100, hole, stay: kind === 'gold' ? cfg.goldStay : stay, kind })
    }
    t += (cfg.intervalFrom + (cfg.intervalTo - cfg.intervalFrom) * progress) * (0.72 + random() * 0.56)
  }
  return queue
}

export function validateLevel(spec: MoleLevel): string | null {
  let last = -1
  for (const spawn of spec.queue) {
    if (spawn.hole < 0 || spawn.hole >= HOLES) return 'hole out of range'
    if (spawn.t < 0.4 || spawn.t > spec.duration - 0.3) return 'rise time outside window'
    if (spawn.stay < MIN_STAY) return 'stay too short'
    if (spawn.t < last) return 'rise times not increasing'
    last = spawn.t
  }
  for (let a = 0; a < spec.queue.length; a += 1) {
    for (let b = a + 1; b < spec.queue.length; b += 1) {
      const first = spec.queue[a]
      const second = spec.queue[b]
      if (first.hole === second.hole && first.t < second.t + second.stay && second.t < first.t + first.stay) return 'same-hole overlap'
    }
  }
  const kinds = new Set(spec.queue.map((spawn) => spawn.kind))
  if (spec.chapter < 3 && kinds.has('bomb')) return 'bomb before chapter 3'
  if (spec.chapter < 4 && kinds.has('gold')) return 'gold before chapter 4'
  const whackable = spec.queue.filter((spawn) => spawn.kind !== 'bomb').length
  if (whackable < spec.quota + 4) return 'quota not safely reachable'
  if (spec.queue.length < spec.duration * 0.35) return 'schedule too sparse'
  return null
}

const cache = new Map<number, MoleLevel>()

function chapterOf(level: number): number {
  let chapter = 1
  CHAPTER_STARTS.forEach((start, index) => { if (level >= start) chapter = index + 1 })
  return chapter
}

export function getMoleLevel(level: number): MoleLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const chapter = chapterOf(safe)
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  const cfg = configFor(chapter, variant)
  const spec: MoleLevel = {
    level: safe, chapter, variant, ...cfg, queue: buildQueue(safe, cfg),
    title: safe === LEVEL_COUNT ? '终局·节拍风暴' : CHAPTER_COPY[chapter - 1][0],
    detail: CHAPTER_COPY[chapter - 1][1],
  }
  cache.set(safe, spec)
  return spec
}
