import { mulberry32, seedFor } from '../../platform/rng'
import { simulateCourse } from './logic'

export const MEADOW_LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45]
export const FIRST_HAZARD_M = 24

export interface MeadowLevel {
  readonly level: number
  readonly chapter: number
  readonly ramp: number
  readonly quota: number
  readonly speed: number
  readonly tallChance: number
  readonly gapChance: number
  readonly clusterChance: number
  readonly birdChance: number
  readonly platformChance: number
  readonly doubleJump: boolean
  readonly coinHazard: number
  readonly groundString: number
  readonly title: string
  readonly detail: string
}

export interface Hazard { readonly kind: 'block' | 'gap' | 'bird', readonly x: number, readonly width: number, readonly height: number, readonly low: number, readonly high: number, readonly speed: number }
export interface Platform { readonly x: number, readonly width: number, readonly top: number }
export interface Coin { readonly x: number, readonly y: number }
export interface Course {
  readonly level: number, readonly chapter: number, readonly quota: number, readonly speed: number, readonly doubleJump: boolean,
  readonly hazards: readonly Hazard[], readonly platforms: readonly Platform[], readonly coins: readonly Coin[],
  readonly title: string, readonly detail: string, readonly seed: number,
}

const CHAPTERS = [
  { title: '草甸热身', detail: '600m 矮障单跳：点按或长按起跳，越过木墩跑向距离配额', quota: 600, speed: 14, tallChance: 0, gapChance: 0, clusterChance: 0, birdChance: 0, platformChance: 0, doubleJump: false, coinHazard: 0.4, groundString: 0.22 },
  { title: '沟壑高低', detail: '800m：高低双障与沟壑登场，长按跳得更高才能越过宽沟', quota: 800, speed: 15.5, tallChance: 0.32, gapChance: 0.2, clusterChance: 0.2, birdChance: 0, platformChance: 0, doubleJump: false, coinHazard: 0.46, groundString: 0.24 },
  { title: '二段跳解锁', detail: '1000m：解锁空中二段跳，悬空平台上还放着额外金币', quota: 1000, speed: 17, tallChance: 0.36, gapChance: 0.22, clusterChance: 0.24, birdChance: 0, platformChance: 0.34, doubleJump: true, coinHazard: 0.5, groundString: 0.26 },
  { title: '疾风鸟来袭', detail: '1200m：疾风鸟迎面俯冲，按下蹲伏让它从头顶掠过', quota: 1200, speed: 18.5, tallChance: 0.38, gapChance: 0.2, clusterChance: 0.24, birdChance: 0.2, platformChance: 0.3, doubleJump: true, coinHazard: 0.52, groundString: 0.28 },
  { title: '旅人终途', detail: '1300m：双障、沟壑、飞鸟与金币串全面合流，冲向草原尽头', quota: 1300, speed: 20, tallChance: 0.4, gapChance: 0.22, clusterChance: 0.28, birdChance: 0.22, platformChance: 0.34, doubleJump: true, coinHazard: 0.62, groundString: 0.42 },
] as const

export function chapterOf(level: number) {
  const safe = Math.min(MEADOW_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getMeadowLevel(level: number): MeadowLevel {
  const safe = Math.min(MEADOW_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const start = CHAPTER_STARTS[chapter - 1]
  const span = (CHAPTER_STARTS[chapter] ?? MEADOW_LEVEL_COUNT + 1) - start
  const ramp = span > 1 ? (safe - start) / (span - 1) : 0
  return {
    level: safe, chapter, ramp, ...spec, speed: spec.speed + ramp * 0.9,
    title: safe === MEADOW_LEVEL_COUNT ? '终局·草原尽头' : spec.title, detail: spec.detail,
  }
}

function addArcCoins(coins: Coin[], random: () => number, centerX: number, apex: number) {
  for (const dx of [-2.6, -1.3, 0, 1.3, 2.6]) coins.push({ x: centerX + dx + (random() - 0.5) * 0.3, y: apex - (0.16 * dx * dx) / 1.69 })
}

function addGroundString(coins: Coin[], random: () => number, from: number, to: number) {
  const count = 4 + Math.floor(random() * 3)
  for (let index = 0; index < count; index += 1) {
    const x = from + index * 1.2
    if (x > to) break
    coins.push({ x, y: 0.8 })
  }
}

function draftCourse(spec: MeadowLevel, random: () => number): Course {
  const hazards: Hazard[] = []
  const platforms: Platform[] = []
  const coins: Coin[] = []
  const speed = spec.speed
  const tail = spec.quota - 12
  let x = FIRST_HAZARD_M
  let lastEnd = 0
  while (x < tail) {
    const space = Math.max(speed * 1.02, speed * (1.55 - (spec.chapter - 1) * 0.1) * (0.85 + random() * 0.45) * (1 - spec.ramp * 0.1))
    x = Math.max(x, lastEnd + space)
    if (x >= tail) break
    const clearFrom = lastEnd + 2.5
    if (x - clearFrom > speed * 1.8 && random() < spec.groundString) addGroundString(coins, random, clearFrom + 1, x - 2.5)
    const zoneWide = x - clearFrom > speed * 1.4
    if (zoneWide && spec.platformChance > 0 && (platforms.length === 0 || random() < spec.platformChance)) {
      const width = 2.6 + random() * 1.2
      const top = 1.75 + random() * 0.3
      const px = clearFrom + (x - clearFrom) * 0.25
      if (px + width + speed * 0.5 < x - 1.5) {
        platforms.push({ x: px, width, top })
        for (let index = 0; index < 3; index += 1) coins.push({ x: px + width / 2 + (index - 1) * 1.1, y: top + 0.55 })
      }
    }
    const roll = random()
    if (roll < spec.birdChance) {
      const birdSpeed = speed * (0.42 + random() * 0.16)
      hazards.push({ kind: 'bird', x: (x * (speed + birdSpeed)) / speed, width: 1.6, height: 0, low: 1.05 + random() * 0.1, high: 1.75 + random() * 0.1, speed: birdSpeed })
      lastEnd = x + 3
    } else if (roll < spec.birdChance + spec.gapChance) {
      const width = Math.min(1.8 + random() * 2.4, speed * 0.4)
      hazards.push({ kind: 'gap', x, width, height: 0, low: 0, high: 0, speed: 0 })
      lastEnd = x + width
      if (random() < spec.coinHazard) addArcCoins(coins, random, x + width / 2, 2.3 + random() * 0.2)
    } else {
      const width = 1.2 + random() * 0.8
      const clustered = random() < spec.clusterChance && x + width + 5.4 < tail
      const height = clustered || random() >= spec.tallChance ? 0.85 + random() * 0.25 : 1.4 + random() * 0.18
      hazards.push({ kind: 'block', x, width, height, low: 0, high: 0, speed: 0 })
      lastEnd = x + width
      let tallest = height
      if (clustered) {
        const inner = 2.2 + random() * 1.2
        const width2 = 1.1 + random() * 0.65
        const height2 = random() < spec.tallChance ? 1.4 + random() * 0.18 : 0.85 + random() * 0.25
        hazards.push({ kind: 'block', x: x + width + inner, width: width2, height: height2, low: 0, high: 0, speed: 0 })
        lastEnd = x + width + inner + width2
        tallest = Math.max(tallest, height2)
      }
      if (random() < spec.coinHazard) addArcCoins(coins, random, x + (lastEnd - x) / 2, Math.max(2.35 + random() * 0.15, tallest + 1.15))
    }
  }
  return {
    level: spec.level, chapter: spec.chapter, quota: spec.quota, speed, doubleJump: spec.doubleJump,
    hazards, platforms, coins: coins.filter((coin) => coin.x > 2 && coin.x < spec.quota - 1),
    title: spec.title, detail: spec.detail, seed: seedFor(spec.level, 13),
  }
}

function repairCourse(course: Course, fatal: readonly number[]): Course {
  const hazards = course.hazards.map((hazard, index) => {
    const next = { ...hazard }
    if (fatal.includes(index)) {
      if (next.kind === 'block') next.height = Math.max(0.75, next.height * 0.85)
      else if (next.kind === 'gap') next.width = Math.max(1.2, next.width * 0.75)
      else { next.speed *= 0.85; next.low = Math.min(1.3, next.low + 0.06); next.high = Math.min(1.95, next.high + 0.06) }
    }
    return next
  })
  return { ...course, hazards }
}

function stripFatal(course: Course, fatal: readonly number[]): Course {
  return { ...course, hazards: course.hazards.filter((_, index) => !fatal.includes(index)) }
}

const solved = (report: { survived: boolean, deaths: number }) => report.survived && report.deaths === 0

export function generateCourse(level: number): Course {
  const safe = Math.min(MEADOW_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const random = mulberry32(seedFor(safe, 13))
  let course = draftCourse(getMeadowLevel(safe), random)
  for (let round = 0; round < 6; round += 1) {
    const report = simulateCourse(course)
    if (solved(report)) return course
    course = repairCourse(course, report.fatal)
  }
  for (let round = 0; round < 4; round += 1) {
    const report = simulateCourse(course)
    if (solved(report)) break
    course = stripFatal(course, report.fatal)
  }
  return course
}
