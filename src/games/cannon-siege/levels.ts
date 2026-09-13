import { mulberry32, seedFor } from '../../platform/rng'
import { hasSolution } from './logic'

export const SIEGE_LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45]
export const SEED_SALT = 37
export const BUILD_ROUNDS = 6

export interface SiegeTarget {
  readonly baseX: number
  readonly y: number
  readonly amp: number
  readonly period: number
  readonly phase: number
  readonly helmet: boolean
}

export interface Wall {
  readonly x: number
  readonly width: number
  readonly height: number
}

export interface SiegeSpec {
  readonly level: number
  readonly chapter: number
  readonly ramp: number
  readonly targetCount: number
  readonly windMax: number
  readonly moveChance: number
  readonly wallChance: number
  readonly helmetChance: number
  readonly ammoPad: number
  readonly title: string
  readonly detail: string
}

export interface SiegeCourse {
  readonly level: SiegeSpec
  readonly targets: readonly SiegeTarget[]
  readonly walls: readonly Wall[]
  readonly wind: number
  readonly ammo: number
  readonly seed: number
}

const CHAPTERS = [
  { title: '靶场热身', detail: '3 座静止靶、无风：按住蓄力、松开放炮，抛物线砸中全部目标即破城', targets: 3, windMax: 0, moveChance: 0, wallChance: 0, helmetChance: 0, ammoPad: 3 },
  { title: '微风群靶', detail: '5 座目标加微风侧偏：风力会推歪弹道，瞄准要预留提前量', targets: 5, windMax: 1.6, moveChance: 0, wallChance: 0, helmetChance: 0, ammoPad: 3 },
  { title: '巡逻飞靶', detail: '飞靶左右往返巡逻：盯住节奏，在折返点附近提前量开炮', targets: 5, windMax: 2.4, moveChance: 0.45, wallChance: 0, helmetChance: 0, ammoPad: 2 },
  { title: '高墙吊射', detail: '障碍墙挡住直射线路：收着打平射会被弹开，拉高弧线吊射墙后', targets: 6, windMax: 4, moveChance: 0.2, wallChance: 0.55, helmetChance: 0, ammoPad: 2 },
  { title: '攻城终战', detail: '移动飞靶、障碍墙、强风与带头盔的硬目标全面合流，头盔要两击才碎', targets: 7, windMax: 6, moveChance: 0.6, wallChance: 0.65, helmetChance: 0.35, ammoPad: 2 },
] as const

export function chapterOf(level: number) {
  const safe = Math.min(SIEGE_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getSiegeSpec(level: number): SiegeSpec {
  const safe = Math.min(SIEGE_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const start = CHAPTER_STARTS[chapter - 1]
  const span = (CHAPTER_STARTS[chapter] ?? SIEGE_LEVEL_COUNT + 1) - start
  const ramp = span > 1 ? (safe - start) / (span - 1) : 0
  return {
    level: safe, chapter, ramp,
    targetCount: spec.targets + Math.floor(ramp * 1.99),
    windMax: spec.windMax, moveChance: spec.moveChance, wallChance: spec.wallChance,
    helmetChance: spec.helmetChance, ammoPad: spec.ammoPad,
    title: safe === SIEGE_LEVEL_COUNT ? '终局·城破之时' : spec.title, detail: spec.detail,
  }
}

function ensureMechanics(spec: SiegeSpec, course: SiegeCourse): SiegeCourse {
  const targets = [...course.targets]
  let walls = [...course.walls]
  if (spec.moveChance > 0 && targets.every((target) => target.amp <= 0)) {
    const at = Math.min(1, targets.length - 1)
    targets[at] = { ...targets[at], amp: 4.2, period: 4.4, baseX: Math.min(96, Math.max(40, targets[at].baseX)) }
  }
  if (spec.helmetChance > 0 && targets.every((target) => !target.helmet)) {
    const at = targets.length - 1
    targets[at] = { ...targets[at], helmet: true }
  }
  if (spec.wallChance > 0 && walls.length === 0) {
    const minTargetX = Math.min(...targets.map((target) => target.baseX - target.amp))
    if (minTargetX > 31) walls = [{ x: Math.max(16, Math.min(24, minTargetX - 16)), width: 3, height: 9.5 }]
  }
  const helmets = targets.filter((target) => target.helmet).length
  return { ...course, targets, walls, ammo: targets.length + helmets + spec.ammoPad }
}

function draftCourse(spec: SiegeSpec, random: () => number): SiegeCourse {
  const targets: SiegeTarget[] = []
  const walls: Wall[] = []
  for (let index = 0; index < spec.targetCount; index += 1) {
    let baseX = 0
    const floor = spec.wallChance > 0 ? 40 : 34
    for (let tries = 0; tries < 60; tries += 1) {
      baseX = floor + random() * 66
      if (targets.every((target) => Math.abs(target.baseX - baseX) >= 6.5)) break
    }
    const helmet = random() < spec.helmetChance
    const y = helmet ? 7 + random() * 12 : 7 + random() * 23
    const moving = random() < spec.moveChance
    const amp = moving ? 3.5 + random() * 4.5 : 0
    const period = moving ? 5.8 - spec.ramp * 0.8 - random() * 2.2 : 0
    targets.push({
      baseX, y, amp,
      period: Math.max(2.6, period),
      phase: random() * Math.PI * 2,
      helmet,
    })
  }
  targets.sort((a, b) => a.baseX - b.baseX)
  if (spec.wallChance > 0) {
    const sweepLeft = Math.min(...targets.map((target) => target.baseX - target.amp))
    const rightBound = Math.min(28, sweepLeft - 8)
    if (random() < spec.wallChance && rightBound >= 20.5) {
      const width = 2.5 + random() * 2
      walls.push({ x: 16 + random() * (rightBound - 20.5), width, height: 8 + random() * 7 })
      if (spec.chapter >= 5 && random() < 0.35) {
        const first = walls[0]
        const anchor = first.x + first.width + 9
        const width2 = 2.5 + random() * 2
        const span2 = sweepLeft - 6 - width2 - anchor
        if (span2 > 0) walls.push({ x: anchor + random() * span2, width: width2, height: 8 + random() * 7 })
      }
    }
  }
  const helmets = targets.filter((target) => target.helmet).length
  const cap = Math.round(spec.windMax * (0.55 + 0.45 * spec.ramp) * 10) / 10
  const wind = Math.round((random() * 2 - 1) * cap * 10) / 10 || 0
  return {
    level: spec, targets, walls, wind,
    ammo: targets.length + helmets + spec.ammoPad,
    seed: seedFor(spec.level, SEED_SALT),
  }
}

function relaxCourse(course: SiegeCourse, failing: number): SiegeCourse {
  if (failing < 0) return course
  const targets = course.targets.map((target, index) => (index === failing
    ? { ...target, baseX: Math.max(40, target.baseX - 6), y: Math.max(7, target.y - 4), amp: target.amp * 0.5 }
    : target))
  return { ...course, targets }
}

export function generateSiegeLevel(level: number): SiegeCourse {
  const spec = getSiegeSpec(level)
  let course = ensureMechanics(spec, draftCourse(spec, mulberry32(seedFor(spec.level, SEED_SALT))))
  for (let round = 0; round < BUILD_ROUNDS; round += 1) {
    const failing = firstUnsolvable(course)
    if (failing === -1 && course.ammo >= hpDemand(course)) return course
    course = ensureMechanics(spec, relaxCourse(course, failing))
  }
  return course
}

export function hpDemand(course: SiegeCourse) {
  return course.targets.reduce((total, target) => total + (target.helmet ? 2 : 1), 0)
}

function firstUnsolvable(course: SiegeCourse) {
  for (let index = 0; index < course.targets.length; index += 1) {
    if (!hasSolution(course, index)) return index
  }
  return -1
}
