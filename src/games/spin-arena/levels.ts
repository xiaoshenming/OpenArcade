import { mulberry32, seedFor } from '../../platform/rng'
import { ARENA_RADIUS, createFighter, ENEMY_M, ENEMY_R, ENEMY_SPIN, PLAYER_M, PLAYER_R, SPIN_MAX, type ArenaState, type Dot, type Fighter } from './logic'

export const SPIN_LEVEL_COUNT = 60
export const ROUND_SECONDS = 45
export const SPAWN_RADIUS = 62
export const DOT_BAND_INNER = 18
export const DOT_BAND_OUTER = 85
export const DOT_GAP = 13

export interface SpinLevelSpec {
  level: number
  chapter: number
  modeName: string
  title: string
  detail: string
  enemies: number
  dots: number
  enemySpeed: number
  smart: boolean
  shrink: boolean
  duration: number
  baseRadius: number
  enemySpawns: { x: number; y: number }[]
  dotSpawns: Dot[]
  seed: number
}

const CHAPTERS = [
  { name: 'warm', title: '独角对阵', detail: '45 秒单敌相扑,能量点充裕,撞它出环', enemies: 1, dots: 14, enemySpeed: 26, smart: false, shrink: false },
  { name: 'twins', title: '双陀夹击', detail: '双敌夹击且能量点减半,维持转速是关键', enemies: 2, dots: 10, enemySpeed: 27, smart: false, shrink: false },
  { name: 'triple', title: '三面环伺', detail: '三敌环伺并集体加速,借力打力逐个击破', enemies: 3, dots: 9, enemySpeed: 30, smart: false, shrink: false },
  { name: 'shrink', title: '缩圈绝地', detail: '竞技场每 15 秒半径缩 10%,边缘即是深渊', enemies: 3, dots: 8, enemySpeed: 31, smart: false, shrink: true },
  { name: 'hunt', title: '猎手终局', detail: '三敌主动追击,缩圈加稀疏能量,终局合流', enemies: 3, dots: 6, enemySpeed: 33, smart: true, shrink: true },
] as const

export function chapterOf(level: number): number {
  const safe = Math.min(SPIN_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

function draftDots(count: number, random: () => number, occupied: { x: number; y: number; gap: number }[]): Dot[] {
  const dots: Dot[] = []
  const blocked: { x: number; y: number; gap: number }[] = [...occupied]
  let guard = 0
  while (dots.length < count && guard < count * 60 + 120) {
    guard += 1
    const angle = random() * Math.PI * 2
    const band = DOT_BAND_INNER + Math.sqrt(random()) * (DOT_BAND_OUTER - DOT_BAND_INNER)
    const x = Math.cos(angle) * band
    const y = Math.sin(angle) * band
    const clear = blocked.every((item) => Math.hypot(item.x - x, item.y - y) >= item.gap - 1e-6)
    if (!clear) continue
    dots.push({ x, y, taken: false })
    blocked.push({ x, y, gap: DOT_GAP })
  }
  return dots
}

export function getSpinLevel(level: number): SpinLevelSpec {
  const safe = Math.min(SPIN_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const variant = (safe - 1) % 11
  const enemySpeed = spec.enemySpeed + (variant % 4) * 0.4
  const random = mulberry32(seedFor(safe, 17))
  const base = random() * Math.PI * 2
  const enemySpawns = Array.from({ length: spec.enemies }, (_, index) => {
    const angle = base + (index * Math.PI * 2) / spec.enemies
    return { x: Math.cos(angle) * SPAWN_RADIUS, y: Math.sin(angle) * SPAWN_RADIUS }
  })
  const occupied = [...enemySpawns.map((spawn) => ({ ...spawn, gap: 16 })), { x: 0, y: 0, gap: 20 }]
  const dotSpawns = draftDots(spec.dots, random, occupied)
  return {
    level: safe, chapter, modeName: spec.name, title: spec.title, detail: spec.detail,
    enemies: spec.enemies, dots: spec.dots, enemySpeed, smart: spec.smart, shrink: spec.shrink,
    duration: ROUND_SECONDS, baseRadius: ARENA_RADIUS, enemySpawns, dotSpawns, seed: seedFor(safe, 29),
  }
}

export function createSpinArenaState(level: number): ArenaState {
  const spec = getSpinLevel(level)
  const player: Fighter = createFighter(0, 0, PLAYER_R, PLAYER_M, SPIN_MAX)
  const enemies = spec.enemySpawns.map((spawn) => createFighter(spawn.x, spawn.y, ENEMY_R, ENEMY_M, ENEMY_SPIN))
  const dots = spec.dotSpawns.map((dot) => ({ ...dot }))
  return {
    time: 0, baseRadius: spec.baseRadius, radius: spec.baseRadius, duration: spec.duration,
    enemySpeed: spec.enemySpeed, smart: spec.smart, shrink: spec.shrink,
    player, enemies, dots, energy: 0, knockouts: 0, score: 0, status: 'running', events: [],
  }
}
