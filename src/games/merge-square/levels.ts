import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import type { Grid } from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_SIZE = 12
const GRID_CELLS = 16
const GRID_SIDE = 4
const EDGE_CELLS = [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]

export interface MergeLevel {
  level: number
  chapter: number
  target: number
  budget: number
  fog: boolean
  startValues: number[]
  startTiles: number
  startLocks: number
  startFixed: number
  spawnLocks: number
  spawnLockChance: number
  botPar: number
  title: string
  detail: string
}

interface ChapterPlan {
  target: number
  startValues: number[]
  smalls: number
  startFixed: number
  startLocks: number
  spawnLocks: number
  lockChance: number
  fog: boolean
  factor: number
  slack: number
  slackFloor: number
}

const CHAPTER_PLANS: readonly ChapterPlan[] = [
  { target: 128, startValues: [4], smalls: 3, startFixed: 0, startLocks: 0, spawnLocks: 0, lockChance: 0, fog: false, factor: 1.5, slack: 0.5, slackFloor: 0.1 },
  { target: 256, startValues: [8], smalls: 4, startFixed: 2, startLocks: 0, spawnLocks: 0, lockChance: 0, fog: false, factor: 1.45, slack: 0.42, slackFloor: 0.1 },
  { target: 512, startValues: [64, 32], smalls: 4, startFixed: 0, startLocks: 1, spawnLocks: 1, lockChance: 0.05, fog: false, factor: 1.4, slack: 0.34, slackFloor: 0.1 },
  { target: 1024, startValues: [256], smalls: 5, startFixed: 0, startLocks: 0, spawnLocks: 0, lockChance: 0, fog: true, factor: 1.35, slack: 0.26, slackFloor: 0.1 },
  { target: 2048, startValues: [1024, 512, 256], smalls: 4, startFixed: 0, startLocks: 1, spawnLocks: 0, lockChance: 0, fog: true, factor: 1.3, slack: 0.22, slackFloor: 0.15 },
]

const CHAPTER_COPY: readonly (readonly [string, string])[] = [
  ['方阵启程', '熟悉滑动与合并，预算充裕'],
  ['定调锁阵', '定调块镇守棋盘不可移动，步数吃紧，提前规划合并链'],
  ['锁链封格', '锁块随阵滑动，但永不合并'],
  ['迷雾行军', '下一块不再预览，靠布局取胜'],
  ['终局·锁雾方阵', '锁块与迷雾同时生效，直取目标'],
]

export interface StartOptions {
  startValues: readonly number[]
  startTiles: number
  startLocks: number
  startFixed: number
}

const SNAKE_LINES: Record<number, { horizontal: number[]; vertical: number[] }> = {
  0: { horizontal: [0, 1, 2, 3], vertical: [0, 4, 8, 12] },
  3: { horizontal: [3, 2, 1, 0], vertical: [3, 7, 11, 15] },
  12: { horizontal: [12, 13, 14, 15], vertical: [12, 8, 4, 0] },
  15: { horizontal: [15, 14, 13, 12], vertical: [15, 11, 7, 3] },
}

export function createStartGrid(levelNumber: number, options: StartOptions): Grid {
  const random = mulberry32(seedFor(levelNumber, 11))
  const positions = shuffle(random, Array.from({ length: GRID_CELLS }, (_, index) => index))
  const corners = shuffle(random, [0, 3, 12, 15])
  const horizontal = random() < 0.5
  const line = SNAKE_LINES[corners[0]][horizontal ? 'horizontal' : 'vertical']
  const grid: Grid = Array(GRID_CELLS).fill(null)
  const used = new Set<number>()
  let id = 1
  const seeds = [...options.startValues].sort((a, b) => b - a)
  seeds.forEach((value, index) => {
    const cell = line[index]
    grid[cell] = { value, locked: false, fixed: false, id }
    used.add(cell)
    id += 1
  })
  let fixed = 0
  for (const cell of positions) {
    if (fixed >= options.startFixed) break
    if (used.has(cell)) continue
    grid[cell] = { value: random() < 0.8 ? 2 : 4, locked: false, fixed: true, id }
    used.add(cell)
    fixed += 1
    id += 1
  }
  let locked = 0
  const laneRow = Math.floor(line[0] / GRID_SIDE)
  const laneColumn = line[0] % GRID_SIDE
  const farCells = shuffle(random, EDGE_CELLS.filter((cell) => (horizontal
    ? Math.abs(Math.floor(cell / GRID_SIDE) - laneRow) >= 2
    : Math.abs((cell % GRID_SIDE) - laneColumn) >= 2)))
  for (const cell of farCells) {
    if (locked >= options.startLocks) break
    if (used.has(cell)) continue
    grid[cell] = { value: random() < 0.5 ? 2 : 4, locked: true, fixed: false, id }
    used.add(cell)
    locked += 1
    id += 1
  }
  const smalls = Math.max(0, options.startTiles - options.startValues.length - options.startLocks - options.startFixed)
  let placed = 0
  for (const cell of positions) {
    if (placed >= smalls) break
    if (used.has(cell)) continue
    grid[cell] = { value: random() < 0.8 ? 2 : 4, locked: false, fixed: false, id }
    used.add(cell)
    placed += 1
    id += 1
  }
  return grid
}

// 生成期预计算表:离线脚本运行 expectimax bot 逐关验证可达性后写回,
// 字段为 [helperCount, smalls, startLocks, spawnLocks, startFixed, botPar]。
// 渲染路径(getMergeLevel)只读此表,不再同步求解。
const RECORDED: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0, 3, 0, 0, 0, 59], [0, 3, 0, 0, 0, 62], [0, 3, 0, 0, 0, 58], [0, 3, 0, 0, 0, 60], [0, 3, 0, 0, 0, 62], [0, 3, 0, 0, 0, 61],
  [0, 3, 0, 0, 0, 59], [0, 3, 0, 0, 0, 65], [0, 3, 0, 0, 0, 61], [0, 3, 0, 0, 0, 59], [0, 3, 0, 0, 0, 60], [0, 3, 0, 0, 0, 62],
  [0, 4, 0, 0, 1, 119], [0, 4, 0, 0, 1, 124], [0, 4, 0, 0, 1, 119], [0, 4, 0, 0, 1, 123], [0, 4, 0, 0, 1, 124], [0, 4, 0, 0, 1, 124],
  [0, 4, 0, 0, 2, 112], [0, 4, 0, 0, 2, 118], [0, 4, 0, 0, 2, 123], [0, 4, 0, 0, 2, 117], [0, 4, 0, 0, 2, 120], [0, 4, 0, 0, 2, 120],
  [0, 4, 1, 1, 0, 266], [0, 4, 1, 1, 0, 217], [0, 4, 1, 1, 0, 236], [0, 4, 1, 1, 0, 301], [0, 4, 1, 1, 0, 206], [0, 4, 1, 1, 0, 277],
  [0, 4, 1, 1, 0, 229], [0, 4, 1, 1, 0, 208], [0, 4, 2, 1, 0, 202], [0, 4, 1, 1, 0, 254], [0, 4, 1, 1, 0, 228], [0, 3, 2, 1, 0, 288],
  [0, 5, 0, 0, 0, 349], [0, 5, 0, 0, 0, 353], [0, 5, 0, 0, 0, 369], [0, 5, 0, 0, 0, 343], [0, 5, 0, 0, 0, 360], [0, 5, 0, 0, 0, 362],
  [0, 5, 0, 0, 0, 345], [0, 5, 0, 0, 0, 357], [0, 5, 0, 0, 0, 344], [0, 5, 0, 0, 0, 352], [0, 5, 0, 0, 0, 370], [0, 5, 0, 0, 0, 364],
  [0, 4, 1, 0, 0, 194], [0, 4, 1, 0, 0, 237], [0, 4, 1, 0, 0, 119], [0, 4, 1, 0, 0, 131], [0, 4, 1, 0, 0, 195], [0, 4, 1, 0, 0, 152],
  [0, 4, 1, 0, 0, 154], [0, 4, 1, 0, 0, 127], [0, 4, 2, 0, 0, 128], [0, 4, 1, 0, 0, 127], [0, 3, 2, 0, 0, 181], [0, 3, 2, 0, 0, 126],
]

const cache = new Map<number, MergeLevel>()

export function getMergeLevel(level: number): MergeLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level || 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const chapter = Math.floor((safe - 1) / CHAPTER_SIZE) + 1
  const variant = (safe - 1) % CHAPTER_SIZE
  const plan = CHAPTER_PLANS[chapter - 1]
  const [baseTitle, detail] = CHAPTER_COPY[chapter - 1]
  const title = safe === LEVEL_COUNT ? '终局·方阵归一' : baseTitle
  const [helperCount, smalls, startLocks, spawnLocks, startFixed, botPar] = RECORDED[safe - 1]
  const startValues = [...plan.startValues, ...[plan.target / 4, plan.target / 8].slice(0, helperCount)]
  const startTiles = startValues.length + smalls + startLocks + startFixed
  const startSum = startValues.reduce((sum, value) => sum + value, 0)
  const theoryFloor = Math.max(0, Math.ceil(((plan.target - startSum) / 4) * plan.factor))
  const slack = Math.max(plan.slackFloor, plan.slack - variant * 0.015)
  const budget = Math.max(theoryFloor, botPar + Math.ceil(botPar * slack), 40)
  const spec: MergeLevel = {
    level: safe,
    chapter,
    target: plan.target,
    budget,
    fog: plan.fog,
    startValues,
    startTiles,
    startLocks,
    startFixed,
    spawnLocks,
    spawnLockChance: plan.lockChance,
    botPar,
    title,
    detail,
  }
  cache.set(safe, spec)
  return spec
}
