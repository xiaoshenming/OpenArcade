import { mulberry32, seedFor } from '../../platform/rng'
import { PADDLE_TOP, type LevelPlan, type Zone } from './logic'

export const LEVEL_COUNT = 60
export type ChapterMode = 'solo' | 'pair' | 'relay' | 'gilt' | 'storm'
export interface JuggleLevel extends LevelPlan {
  level: number
  chapter: number
  variant: number
  modeName: ChapterMode
  title: string
  detail: string
  capacity: number
  zoneCount: number
}
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
const CHAPTERS = [
  { name: 'solo', title: '初托·单球', detail: '单球起落，攒满三十次弹跳', quota: 30, maxBalls: 1, goldCount: 0, startBalls: 1, join: 0, speed: 360, zoneBase: 0 },
  { name: 'pair', title: '双球·轮跳', detail: '双球轮替弹跳，每次轮换有加成', quota: 40, maxBalls: 2, goldCount: 0, startBalls: 2, join: 0, speed: 382, zoneBase: 0 },
  { name: 'relay', title: '接力·三球', detail: '新球按间隔入场，三球连续弹跳', quota: 34, maxBalls: 3, goldCount: 0, startBalls: 1, join: 5, speed: 404, zoneBase: 0 },
  { name: 'gilt', title: '金球·疾坠', detail: '金球小而快，一跳抵五跳配额', quota: 36, maxBalls: 2, goldCount: 1, startBalls: 1, join: 3.6, speed: 426, zoneBase: 0 },
  { name: 'storm', title: '终章·重力带', detail: '三球加金球，重力带登场', quota: 40, maxBalls: 2, goldCount: 1, startBalls: 2, join: 3.4, speed: 448, zoneBase: 1 },
] as const

function chapterOf(level: number): number {
  let chapter = 1
  for (let index = 0; index < CHAPTER_STARTS.length; index += 1) if (level >= CHAPTER_STARTS[index]) chapter = index + 1
  return chapter
}

function joinAfterFor(chapter: number, variant: number): number {
  if (chapter < 3) return 0
  const base = CHAPTERS[chapter - 1].join - variant * 0.05
  return Math.max(2.8, Math.round(base * 100) / 100)
}

// 自动驾驶逐关验证（见 autopilot.test.ts）后的重平衡表：仅放缓个别关卡的接力节奏。
const JOIN_AFTER_OVERRIDE: Record<number, number> = { 37: 4.2, 49: 7, 57: 4.2, 58: 4.6, 60: 3.8 }
const QUOTA_OVERRIDE: Record<number, number> = { 49: 26 }
const ZONE_OVERRIDE: Record<number, Zone[]> = { 49: [{ y: 100, height: 60 }] }

export function buildZones(seed: number, count: number): Zone[] {
  if (count <= 0) return []
  const random = mulberry32(seed)
  const zones: Zone[] = []
  let guard = 0
  while (zones.length < count && guard < 60) {
    guard += 1
    const height = 60 + Math.round(random() * 40)
    const y = 110 + Math.round(random() * Math.max(1, 320 - height))
    if (zones.every((zone) => y + height + 30 < zone.y || zone.y + zone.height + 30 < y)) zones.push({ y, height })
  }
  return zones
}

export function validateJuggle(spec: JuggleLevel): string | null {
  if (spec.quota < 25 || spec.quota > 60) return 'quota out of range'
  if (spec.startBalls > spec.capacity) return 'start exceeds capacity'
  if (spec.chapter >= 4 ? spec.goldCount < 1 : spec.goldCount !== 0) return 'gold chapter mismatch'
  if (spec.chapter >= 3 ? spec.joinAfter <= 0 : spec.joinAfter !== 0) return 'join interval mismatch'
  if (spec.chapter >= 5) {
    if (spec.zones.length === 0) return 'finale needs a gravity zone'
    for (const zone of spec.zones) {
      if (zone.y < 80 || zone.y + zone.height > PADDLE_TOP - 60) return 'zone outside the sky'
    }
    for (let a = 0; a < spec.zones.length; a += 1) {
      for (let b = a + 1; b < spec.zones.length; b += 1) {
        const first = spec.zones[a]
        const second = spec.zones[b]
        if (!(first.y + first.height + 30 < second.y || second.y + second.height + 30 < first.y)) return 'zones overlap'
      }
    }
  } else if (spec.zones.length !== 0) return 'zones appear too early'
  return null
}

const cache = new Map<number, JuggleLevel>()

export function getJuggleLevel(level: number): JuggleLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const chapter = chapterOf(safe)
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  const copy = CHAPTERS[chapter - 1]
  const zoneCount = copy.zoneBase + (chapter === 5 && variant >= 8 ? 1 : 0)
  const spec: JuggleLevel = {
    level: safe, chapter, variant, modeName: copy.name, title: copy.title, detail: copy.detail,
    quota: QUOTA_OVERRIDE[safe] ?? copy.quota, maxBalls: copy.maxBalls, goldCount: copy.goldCount, startBalls: copy.startBalls,
    ballSpeed: copy.speed + variant * 2, gravity: 600 + safe,
    joinAfter: JOIN_AFTER_OVERRIDE[safe] ?? joinAfterFor(chapter, variant),
    zones: ZONE_OVERRIDE[safe] ?? buildZones(seedFor(safe, 17), zoneCount), capacity: copy.maxBalls + copy.goldCount, zoneCount,
  }
  cache.set(safe, spec)
  return spec
}
