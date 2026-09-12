import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { solveWithBot, type Grid } from './logic'

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
  startLocks: number
  spawnLocks: number
  lockChance: number
  fog: boolean
  factor: number
  slack: number
}

const CHAPTER_PLANS: readonly ChapterPlan[] = [
  { target: 128, startValues: [4], smalls: 3, startLocks: 0, spawnLocks: 0, lockChance: 0, fog: false, factor: 1.5, slack: 0.5 },
  { target: 256, startValues: [8], smalls: 4, startLocks: 0, spawnLocks: 0, lockChance: 0, fog: false, factor: 1.45, slack: 0.42 },
  { target: 512, startValues: [64, 32], smalls: 4, startLocks: 1, spawnLocks: 1, lockChance: 0.05, fog: false, factor: 1.4, slack: 0.34 },
  { target: 1024, startValues: [256], smalls: 5, startLocks: 0, spawnLocks: 0, lockChance: 0, fog: true, factor: 1.35, slack: 0.26 },
  { target: 2048, startValues: [1024, 512, 256], smalls: 4, startLocks: 1, spawnLocks: 0, lockChance: 0, fog: true, factor: 1.3, slack: 0.18 },
]

const CHAPTER_COPY: readonly (readonly [string, string])[] = [
  ['方阵启程', '熟悉滑动与合并，预算充裕'],
  ['预算收紧', '步数吃紧，提前规划合并链'],
  ['锁链封格', '锁块随阵滑动，但永不合并'],
  ['迷雾行军', '下一块不再预览，靠布局取胜'],
  ['终局·锁雾方阵', '锁块与迷雾同时生效，直取目标'],
]

const BOT_MOVE_CAP = 2600

export interface StartOptions {
  startValues: readonly number[]
  startTiles: number
  startLocks: number
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
    grid[cell] = { value, locked: false, id }
    used.add(cell)
    id += 1
  })
  let locked = 0
  const laneRow = Math.floor(line[0] / GRID_SIDE)
  const laneColumn = line[0] % GRID_SIDE
  const farCells = shuffle(random, EDGE_CELLS.filter((cell) => (horizontal
    ? Math.abs(Math.floor(cell / GRID_SIDE) - laneRow) >= 2
    : Math.abs((cell % GRID_SIDE) - laneColumn) >= 2)))
  for (const cell of farCells) {
    if (locked >= options.startLocks) break
    if (used.has(cell)) continue
    grid[cell] = { value: random() < 0.5 ? 2 : 4, locked: true, id }
    used.add(cell)
    locked += 1
    id += 1
  }
  const smalls = Math.max(0, options.startTiles - options.startValues.length - options.startLocks)
  let placed = 0
  for (const cell of positions) {
    if (placed >= smalls) break
    if (used.has(cell)) continue
    grid[cell] = { value: random() < 0.8 ? 2 : 4, locked: false, id }
    used.add(cell)
    placed += 1
    id += 1
  }
  return grid
}

const cache = new Map<number, MergeLevel>()

interface Attempt {
  spawnLocks: number
  startLocks: number
  smallsDelta: number
  helperCount: number
}

export function getMergeLevel(level: number): MergeLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level || 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const chapter = Math.floor((safe - 1) / CHAPTER_SIZE) + 1
  const variant = (safe - 1) % CHAPTER_SIZE
  const plan = CHAPTER_PLANS[chapter - 1]
  const [baseTitle, detail] = CHAPTER_COPY[chapter - 1]
  const title = safe === LEVEL_COUNT ? '终局·方阵归一' : baseTitle
  const lockPlan = plan.startLocks > 0 ? Math.min(2, plan.startLocks + (variant >= 8 ? 1 : 0)) : 0
  const slack = Math.max(0.1, plan.slack - variant * 0.015)
  const helpers = [plan.target / 4, plan.target / 8]
  const attempts: Attempt[] = []
  for (let spawnLocks = plan.spawnLocks; spawnLocks >= 0; spawnLocks -= 1) {
    for (let startLocks = lockPlan; startLocks >= 0; startLocks -= 1) {
      for (const smallsDelta of [0, -1]) {
        attempts.push({ spawnLocks, startLocks, smallsDelta, helperCount: 0 })
      }
    }
  }
  for (let startLocks = lockPlan; startLocks >= 0; startLocks -= 1) {
    for (const helperCount of [1, 2]) {
      attempts.push({ spawnLocks: 0, startLocks, smallsDelta: 0, helperCount })
    }
  }
  let botPar = -1
  let chosen = attempts[attempts.length - 1]
  for (const candidate of attempts) {
    const values = [...plan.startValues, ...helpers.slice(0, candidate.helperCount)]
    const smalls = Math.max(1, plan.smalls + candidate.smallsDelta)
    const startGrid = createStartGrid(safe, { startValues: values, startTiles: values.length + smalls + candidate.startLocks, startLocks: candidate.startLocks })
    botPar = solveWithBot({ levelNumber: safe, target: plan.target, startGrid, lockQuota: candidate.spawnLocks, lockChance: plan.lockChance, moveCap: BOT_MOVE_CAP })
    if (botPar > 0) {
      chosen = candidate
      break
    }
  }
  const startValues = [...plan.startValues, ...helpers.slice(0, chosen.helperCount)]
  const smalls = Math.max(1, plan.smalls + chosen.smallsDelta)
  const startTiles = startValues.length + smalls + chosen.startLocks
  const startSum = startValues.reduce((sum, value) => sum + value, 0)
  const theoryFloor = Math.max(0, Math.ceil(((plan.target - startSum) / 4) * plan.factor))
  const budget = botPar > 0 ? Math.max(theoryFloor, botPar + Math.ceil(botPar * slack), 40) : theoryFloor * 2
  const spec: MergeLevel = {
    level: safe,
    chapter,
    target: plan.target,
    budget,
    fog: plan.fog,
    startValues,
    startTiles,
    startLocks: chosen.startLocks,
    spawnLocks: chosen.spawnLocks,
    spawnLockChance: plan.lockChance,
    botPar,
    title,
    detail,
  }
  cache.set(safe, spec)
  return spec
}
