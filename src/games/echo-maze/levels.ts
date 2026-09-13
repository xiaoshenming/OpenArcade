import { mulberry32, seedFor } from '../../platform/rng'
import { bfsDistances, carvePerfectMaze, createEchoState, farthestCell, openLoops, toPoint, type EchoRule, type EchoState, type Point } from './logic'

export const ECHO_LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45]

export interface EchoLevelSpec {
  level: number
  chapter: number
  modeName: string
  title: string
  detail: string
  cols: number
  rows: number
  pulses: number
  radius: number
  litMs: number
  loops: number
  movingExit: boolean
  hintMs: number
  par: number
  walls: number[]
  start: Point
  exit: Point
  seed: number
}

const CHAPTERS = [
  { name: 'awaken', title: '初闻回声', detail: '小径迷宫脉冲充裕,借回声记路寻出口', cols: 11, rows: 9, pulses: 6, radius: 2.4, litMs: 3600, loops: 4, movingExit: false, hintMs: 0 },
  { name: 'deep', title: '深巷低语', detail: '巷道更深脉冲收紧,开环更多更易迷途', cols: 13, rows: 11, pulses: 5, radius: 2.3, litMs: 3300, loops: 6, movingExit: false, hintMs: 0 },
  { name: 'beacon', title: '出口微光', detail: '开局 2 秒出口方向提示,脉冲仅剩四次', cols: 15, rows: 13, pulses: 4, radius: 2.2, litMs: 3000, loops: 8, movingExit: false, hintMs: 2000 },
  { name: 'drift', title: '游移之门', detail: '出口每 30 步迁移并短暂显形,盯紧回声', cols: 15, rows: 13, pulses: 4, radius: 2.2, litMs: 3000, loops: 9, movingExit: true, hintMs: 0 },
  { name: 'void', title: '万籁归寂', detail: '大图少脉冲出口游移,仅开局一瞥方向', cols: 17, rows: 13, pulses: 3, radius: 2.1, litMs: 2800, loops: 11, movingExit: true, hintMs: 1800 },
] as const

export function chapterOf(level: number): number {
  const safe = Math.min(ECHO_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  return CHAPTER_STARTS.filter((start) => safe >= start).length
}

export function getEchoLevel(level: number): EchoLevelSpec {
  const safe = Math.min(ECHO_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const variant = (safe - 1) % 11
  const loops = spec.loops + (variant % 3)
  const random = mulberry32(seedFor(safe, 11))
  const walls = carvePerfectMaze(spec.cols, spec.rows, random)
  openLoops(walls, spec.cols, spec.rows, loops, random)
  const start: Point = { x: 0, y: 0 }
  const dist = bfsDistances(spec.cols, spec.rows, walls, start)
  const exitIndex = farthestCell(dist)
  const exit = toPoint(exitIndex, spec.cols)
  const par = dist[exitIndex] as number
  return {
    level: safe, chapter, modeName: spec.name, title: spec.title,
    detail: `${spec.detail} · 最短路 ${par} 步`,
    cols: spec.cols, rows: spec.rows, pulses: spec.pulses, radius: spec.radius, litMs: spec.litMs,
    loops, movingExit: spec.movingExit, hintMs: spec.hintMs, par, walls, start, exit, seed: seedFor(safe, 23),
  }
}

export function createEchoLevelState(level: number): EchoState {
  const spec = getEchoLevel(level)
  const rule: EchoRule = {
    cols: spec.cols, rows: spec.rows, radius: spec.radius, litMs: spec.litMs,
    pulses: spec.pulses, movingExit: spec.movingExit, hintMs: spec.hintMs,
  }
  return createEchoState(rule, spec.walls, spec.seed)
}
