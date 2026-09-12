import { mulberry32, seedFor } from '../../platform/rng'
import { COLS, DIRS, ROWS, START, createState, type Dir, type GameRule, type GameState, type Point } from './logic'

export const LEVEL_COUNT = 60
export type ChapterMode = 'garden' | 'hedge' | 'rush' | 'portal' | 'gauntlet'
export interface SnakeLevelSpec {
  level: number
  chapter: number
  modeName: ChapterMode
  title: string
  detail: string
  quota: number
  stepMs: number
  minStepMs: number
  accel: number
  wrap: boolean
  fruitLifespan: number
  golden: boolean
  goldenEvery: number
  goldenLifespan: number
  tier: number
  wallCells: number
  walls: Point[]
  seed: number
}

const CHAPTERS = [
  { name: 'garden', title: '初径觅果', detail: '净园无墙,稳步吃满配额' },
  { name: 'hedge', title: '篱阵藏蛇', detail: '种子墙阵盘踞,绕行觅径' },
  { name: 'rush', title: '疾速限时', detail: '越吃越快,果实超时换位' },
  { name: 'portal', title: '穿墙金穗', detail: '边界相通,金穗限时三倍分' },
  { name: 'gauntlet', title: '万径归一', detail: '墙阵限时金果齐至' },
] as const
const QUOTAS = [5, 6, 6, 7, 8]
const LIFESPANS = [0, 0, 30, 26, 22]
const ACCELS = [0, 0, 6, 8, 11]

export function getSnakeLevel(level: number): SnakeLevelSpec {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const chapter = Math.floor((safe - 1) / 12) + 1
  const variant = (safe - 1) % 12
  const copy = CHAPTERS[chapter - 1]
  const quota = QUOTAS[chapter - 1]
  const wallCells = chapter === 1 ? 0 : 7 + chapter * 2 + (variant % 4)
  return {
    level: safe, chapter, modeName: copy.name, title: copy.title, detail: `${copy.detail} · 配额 ${quota} 果`,
    quota, stepMs: Math.round(228 - (safe - 1) * 1.85), minStepMs: 96, accel: ACCELS[chapter - 1],
    wrap: chapter >= 4, fruitLifespan: LIFESPANS[chapter - 1], golden: chapter >= 4, goldenEvery: 3, goldenLifespan: 16,
    tier: 1 + Math.floor((safe - 1) / 15), wallCells, walls: buildWalls(seedFor(safe, 7), wallCells), seed: seedFor(safe, 13),
  }
}

export function buildWalls(seed: number, targetCells: number): Point[] {
  if (targetCells <= 0) return []
  const random = mulberry32(seed)
  const fragments: Point[][] = []
  const cells: Point[] = []
  const rejected = (cell: Point) =>
    cell.x < 1 || cell.y < 1 || cell.x > COLS - 2 || cell.y > ROWS - 2 ||
    Math.abs(cell.x - START.x) + Math.abs(cell.y - START.y) < 5 ||
    (cell.y === START.y && cell.x >= START.x - 2 && cell.x <= START.x + 6) ||
    cells.some((wall) => Math.abs(wall.x - cell.x) <= 1 && Math.abs(wall.y - cell.y) <= 1)
  let guard = 0
  while (cells.length < targetCells && guard < 220) {
    guard += 1
    const horizontal = random() < 0.5
    const length = 2 + Math.floor(random() * 3)
    const x = 1 + Math.floor(random() * (COLS - 1 - length))
    const y = 1 + Math.floor(random() * (ROWS - 1 - length))
    const fragment = Array.from({ length }, (_, index) => ({ x: horizontal ? x + index : x, y: horizontal ? y : y + index }))
    if (fragment.some(rejected)) continue
    fragments.push(fragment)
    cells.push(...fragment)
  }
  while (fragments.length > 0 && !isConnected(cells)) {
    const dropped = fragments.pop() as Point[]
    dropped.forEach((cell) => {
      const index = cells.findIndex((item) => item.x === cell.x && item.y === cell.y)
      if (index >= 0) cells.splice(index, 1)
    })
  }
  return cells
}

export function isConnected(walls: Point[]): boolean {
  const blocked = new Set(walls.map((wall) => `${wall.x}:${wall.y}`))
  const seen = new Set([`${START.x}:${START.y}`])
  const frontier: Point[] = [START]
  while (frontier.length) {
    const cell = frontier.pop() as Point
    ;(Object.keys(DIRS) as Dir[]).forEach((key) => {
      const x = cell.x + DIRS[key].x
      const y = cell.y + DIRS[key].y
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return
      const id = `${x}:${y}`
      if (blocked.has(id) || seen.has(id)) return
      seen.add(id)
      frontier.push({ x, y })
    })
  }
  return seen.size + blocked.size >= COLS * ROWS
}

export function createSnakeState(level: number): GameState {
  const spec = getSnakeLevel(level)
  const rule: GameRule = {
    quota: spec.quota, stepMs: spec.stepMs, minStepMs: spec.minStepMs, accel: spec.accel, wrap: spec.wrap,
    fruitLifespan: spec.fruitLifespan, golden: spec.golden, goldenEvery: spec.goldenEvery,
    goldenLifespan: spec.goldenLifespan, tier: spec.tier,
  }
  return createState(spec.walls, rule, spec.seed)
}
