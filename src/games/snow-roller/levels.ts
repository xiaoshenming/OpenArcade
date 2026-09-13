import { mulberry32, seedFor } from '../../platform/rng'
import { ROCK_CRUSH_MARGIN, simulateCourse, SNOWMAN_CRUSH, type RunReport } from './logic'

export const SNOW_LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45]
export const FIRST_OBSTACLE_M = 24
export const SNOWMAN_HALF = 1.5

export interface Obstacle { readonly kind: 'rock' | 'snowman', readonly z: number, readonly x: number, readonly half: number, readonly crushAt: number }
export interface Ramp { readonly z: number, readonly x: number, readonly half: number }
export interface Flake { readonly z: number, readonly x: number, readonly high: boolean }
export interface Course {
  readonly level: number, readonly chapter: number, readonly quota: number, readonly baseSpeed: number, readonly accel: number,
  readonly ice: boolean, readonly blizzard: number, readonly targetRadius: number,
  readonly obstacles: readonly Obstacle[], readonly ramps: readonly Ramp[], readonly flakes: readonly Flake[],
  readonly title: string, readonly detail: string, readonly seed: number,
}

export interface LevelSpec {
  readonly level: number, readonly chapter: number, readonly ramp: number, readonly quota: number, readonly baseSpeed: number,
  readonly accel: number, readonly ice: boolean, readonly blizzard: number, readonly targetRadius: number,
  readonly rampChance: number, readonly bigChance: number, readonly snowmanChance: number,
  readonly spacingMul: number, readonly flakeBias: number, readonly title: string, readonly detail: string,
}

const CHAPTERS = [
  { title: '缓坡初滚', detail: '500m 稀疏碎石坡：吃雪花养大雪球，碾碎碎石或左右绕开，抵达山脚或滚到目标半径', quota: 500, baseSpeed: 12.5, accel: 0.42, ice: false, blizzard: 0, rampChance: 0, bigChance: 0, snowmanChance: 0, spacingMul: 2.05, flakeBias: 0.62, targetRadius: 1.32 },
  { title: '跳台腾越', detail: '700m 雪坡架起跳台：压过跳台腾空，飞跃大石，空中接住雪花串顺势长大', quota: 700, baseSpeed: 13.5, accel: 0.5, ice: false, blizzard: 0, rampChance: 0.3, bigChance: 0.24, snowmanChance: 0, spacingMul: 1.6, flakeBias: 0.56, targetRadius: 1.5 },
  { title: '冰面滑行', detail: '900m 冰面登场：转向出现打滑惯性，提前预判路线，用跳台与提前变向躲开大石', quota: 900, baseSpeed: 14.5, accel: 0.55, ice: true, blizzard: 0, rampChance: 0.3, bigChance: 0.28, snowmanChance: 0, spacingMul: 1.42, flakeBias: 0.54, targetRadius: 1.68 },
  { title: '风雪视界', detail: '1100m 暴风雪压境：可视范围骤减，凭预判滚过风雪，雪球够大照样碾石开路', quota: 1100, baseSpeed: 15.5, accel: 0.6, ice: true, blizzard: 20, rampChance: 0.28, bigChance: 0.3, snowmanChance: 0, spacingMul: 1.3, flakeBias: 0.52, targetRadius: 1.86 },
  { title: '雪人王终途', detail: '1300m 全机制合流：跳台、冰面、风雪与巨型雪人王把守山道，半径达标即可碾穿雪人', quota: 1300, baseSpeed: 16.5, accel: 0.66, ice: true, blizzard: 17, rampChance: 0.34, bigChance: 0.32, snowmanChance: 0.24, spacingMul: 0.98, flakeBias: 0.5, targetRadius: 2.04 },
] as const

export function chapterOf(level: number): number {
  const safe = Math.min(SNOW_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getSnowLevel(level: number): LevelSpec {
  const safe = Math.min(SNOW_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const start = CHAPTER_STARTS[chapter - 1]
  const span = (CHAPTER_STARTS[chapter] ?? SNOW_LEVEL_COUNT + 1) - start
  const ramp = span > 1 ? (safe - start) / (span - 1) : 0
  return {
    level: safe, chapter, ramp, quota: spec.quota,
    baseSpeed: spec.baseSpeed + ramp * 1.1, accel: spec.accel + ramp * 0.08,
    ice: spec.ice, blizzard: spec.blizzard > 0 ? spec.blizzard - ramp * 4 : 0,
    targetRadius: spec.targetRadius + ramp * 0.11,
    rampChance: spec.rampChance, bigChance: spec.bigChance, snowmanChance: spec.snowmanChance,
    spacingMul: spec.spacingMul, flakeBias: spec.flakeBias,
    title: safe === SNOW_LEVEL_COUNT ? '终局·山脚雪人王' : spec.title, detail: spec.detail,
  }
}

function addGroundString(flakes: Flake[], random: () => number, from: number, to: number) {
  const lane = (random() * 2 - 1) * 3
  const count = 4 + Math.floor(random() * 3)
  for (let index = 0; index < count; index += 1) {
    const z = from + index * 1.7
    if (z > to) break
    flakes.push({ z, x: lane + (random() - 0.5) * 0.5, high: false })
  }
}

function addFlankTrail(flakes: Flake[], random: () => number, from: number, lane: number) {
  for (let index = 0; index < 3; index += 1) {
    flakes.push({ z: from + index * 1.7, x: Math.max(-3.5, Math.min(3.5, lane)) + (random() - 0.5) * 0.5, high: false })
  }
}

function draftCourse(spec: LevelSpec, random: () => number): Course {
  const obstacles: Obstacle[] = []
  const ramps: Ramp[] = []
  const flakes: Flake[] = []
  const tail = spec.quota - 10
  let z = FIRST_OBSTACLE_M
  let lastEnd = 0
  let spaceShrink = 1
  while (z < tail) {
    const space = Math.max(spec.baseSpeed * 1.05, spec.baseSpeed * spec.spacingMul * spaceShrink * (0.85 + random() * 0.45) * (1 - spec.ramp * 0.14))
    z = Math.max(z, lastEnd + space)
    if (z >= tail) break
    spaceShrink = 1
    const clearFrom = lastEnd + 2.5
    if (z - clearFrom > spec.baseSpeed * 1.7 && random() < spec.flakeBias) addGroundString(flakes, random, clearFrom + 1, z - 3)
    const lane = (random() * 2 - 1) * 3.1
    const roll = random()
    if (roll < spec.rampChance) {
      ramps.push({ z, x: lane, half: 1.15 })
      for (let index = 0; index < 4; index += 1) flakes.push({ z: z + 2 + (index * spec.baseSpeed) / 4.2, x: lane + (random() - 0.5) * 0.5, high: true })
      lastEnd = z + spec.baseSpeed * 1.2 + 1
      spaceShrink = 0.62
      continue
    }
    if (roll < spec.rampChance + spec.snowmanChance) {
      const side = random() < 0.5 ? -1 : 1
      const x = side * (1.7 + random() * 0.9)
      obstacles.push({ kind: 'snowman', z, x, half: SNOWMAN_HALF, crushAt: SNOWMAN_CRUSH })
      lastEnd = z + SNOWMAN_HALF * 2 + 1
      if (random() < spec.flakeBias + 0.2) addFlankTrail(flakes, random, lastEnd + 1.5, x - side * (SNOWMAN_HALF + 1.4))
      continue
    }
    if (roll < spec.rampChance + spec.snowmanChance + spec.bigChance) {
      const half = 1 + random() * 0.35
      const side = random() < 0.5 ? -1 : 1
      const x = side * Math.min(4.4 - half, 1.5 + random() * 1.8)
      obstacles.push({ kind: 'rock', z, x, half, crushAt: Number.POSITIVE_INFINITY })
      lastEnd = z + half * 2
      if (random() < spec.flakeBias + 0.2) addFlankTrail(flakes, random, lastEnd + 1.5, x - side * (half + 1.4))
      continue
    }
    const half = 0.45 + random() * 0.35
    obstacles.push({ kind: 'rock', z, x: lane, half, crushAt: half + ROCK_CRUSH_MARGIN })
    lastEnd = z + half * 2
    if (random() < spec.flakeBias + 0.2) addFlankTrail(flakes, random, lastEnd + 1.5, lane)
  }
  return {
    level: spec.level, chapter: spec.chapter, quota: spec.quota, baseSpeed: spec.baseSpeed, accel: spec.accel,
    ice: spec.ice, blizzard: spec.blizzard, targetRadius: spec.targetRadius,
    obstacles, ramps,
    flakes: flakes.filter((flake) => flake.z > 4 && flake.z < spec.quota - 2).sort((a, b) => a.z - b.z),
    title: spec.title, detail: spec.detail, seed: seedFor(spec.level, 61),
  }
}

function repairCourse(course: Course, fatal: readonly number[]): Course {
  const obstacles = course.obstacles.map((obstacle, index) => {
    if (!fatal.includes(index)) return obstacle
    if (obstacle.kind === 'snowman') {
      const side = obstacle.x < 0 ? -1 : 1
      return { ...obstacle, x: side * Math.min(2.9, Math.abs(obstacle.x) + 0.5) }
    }
    if (!Number.isFinite(obstacle.crushAt)) {
      const side = obstacle.x < 0 ? -1 : 1
      const half = Math.max(0.85, obstacle.half * 0.88)
      return { ...obstacle, half, x: side * Math.min(4.4 - half, Math.abs(obstacle.x) + 0.4) }
    }
    const half = Math.max(0.32, obstacle.half * 0.8)
    return { ...obstacle, half, crushAt: half + ROCK_CRUSH_MARGIN }
  })
  return { ...course, obstacles }
}

function stripFatal(course: Course, fatal: readonly number[]): Course {
  return { ...course, obstacles: course.obstacles.filter((_, index) => !fatal.includes(index)) }
}

const solved = (report: RunReport) => report.won && report.deaths === 0

export function generateCourse(level: number): Course {
  const safe = Math.min(SNOW_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const random = mulberry32(seedFor(safe, 61))
  let course = draftCourse(getSnowLevel(safe), random)
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
