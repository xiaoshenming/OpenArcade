import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { COLS, DIRS, ROWS, START, cellKey, createState, inBounds, sameCell, type Dir, type GameRule, type GameState, type GuardSeed, type Point } from './logic'

export const LEVEL_COUNT = 60
export type ChapterMode = 'glean' | 'twin' | 'tunnel' | 'bloom' | 'nova'
export interface HarvestLevelSpec {
  level: number
  chapter: number
  modeName: ChapterMode
  title: string
  detail: string
  quota: number
  stepMs: number
  powerSteps: number
  powerBonus: number
  regenEvery: number
  wrap: boolean
  patrolEvery: number
  chaseEvery: number
  walls: Point[]
  pellets: Point[]
  stars: Point[]
  guards: GuardSeed[]
  seed: number
}
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
const CHAPTERS = [
  { name: 'glean', title: '初割·孤哨', detail: '单守卫巡弋，吃满四十粒星屑', quota: 40, guards: 1, patrolEvery: 3, chaseEvery: 2, wrap: false, regenEvery: 0 },
  { name: 'twin', title: '双哨·密屑', detail: '双守卫分巡，配额升至六十', quota: 60, guards: 2, patrolEvery: 3, chaseEvery: 2, wrap: false, regenEvery: 0 },
  { name: 'tunnel', title: '隧道·三方', detail: '左右边界相通，三方围猎围堵', quota: 60, guards: 3, patrolEvery: 2, chaseEvery: 2, wrap: true, regenEvery: 0 },
  { name: 'bloom', title: '再生·四伏', detail: '星屑缓慢再生，四哨环伺封锁', quota: 60, guards: 4, patrolEvery: 2, chaseEvery: 2, wrap: true, regenEvery: 26 },
  { name: 'nova', title: '终章·星暴', detail: '全机制叠加，反杀守卫护星延长 3 秒', quota: 80, guards: 4, patrolEvery: 2, chaseEvery: 1, wrap: true, regenEvery: 22 },
] as const
const DIR_KEYS = Object.keys(DIRS) as Dir[]

// 自动驾驶可达性重平衡：bot 逐关验证（见 autopilot.test.ts）后对不可达关卡微调，
// 只降配额或放缓守卫节奏，不改变章节机制。
const REBALANCE: Record<number, { quota?: number; patrolEvery?: number; chaseEvery?: number }> = {}

function chapterOf(level: number): number {
  let chapter = 1
  for (let index = 0; index < CHAPTER_STARTS.length; index += 1) if (level >= CHAPTER_STARTS[index]) chapter = index + 1
  return chapter
}

export function isConnected(walls: Point[]): boolean {
  const blocked = new Set(walls.map(cellKey))
  const seen = new Set([cellKey(START)])
  const frontier: Point[] = [START]
  while (frontier.length) {
    const cell = frontier.pop() as Point
    for (const key of DIR_KEYS) {
      const next = { x: cell.x + DIRS[key].x, y: cell.y + DIRS[key].y }
      if (!inBounds(next) || blocked.has(cellKey(next)) || seen.has(cellKey(next))) continue
      seen.add(cellKey(next))
      frontier.push(next)
    }
  }
  return seen.size + blocked.size >= COLS * ROWS
}

export function buildWalls(seed: number, target: number): Point[] {
  if (target <= 0) return []
  const random = mulberry32(seed)
  const fragments: Point[][] = []
  const cells: Point[] = []
  const rejected = (cell: Point) =>
    cell.x < 1 || cell.x > COLS - 2 || Math.abs(cell.x - START.x) + Math.abs(cell.y - START.y) < 3 ||
    cells.some((wall) => Math.abs(wall.x - cell.x) <= 1 && Math.abs(wall.y - cell.y) <= 1)
  let guard = 0
  while (cells.length < target && guard < 240) {
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
      const index = cells.findIndex((item) => sameCell(item, cell))
      if (index >= 0) cells.splice(index, 1)
    })
  }
  return cells
}

export function buildField(walls: Point[], home: Point): number[] {
  const blocked = new Set(walls.map(cellKey))
  const field = new Array(COLS * ROWS).fill(-1) as number[]
  const frontier: Point[] = [{ ...home }]
  field[home.y * COLS + home.x] = 0
  while (frontier.length) {
    const cell = frontier.shift() as Point
    const base = field[cell.y * COLS + cell.x]
    for (const key of DIR_KEYS) {
      const next = { x: cell.x + DIRS[key].x, y: cell.y + DIRS[key].y }
      if (!inBounds(next) || blocked.has(cellKey(next)) || field[next.y * COLS + next.x] >= 0) continue
      field[next.y * COLS + next.x] = base + 1
      frontier.push(next)
    }
  }
  return field
}

function makeSeed(route: Point[], walls: Point[]): GuardSeed {
  const afar = (cell: Point) => Math.abs(cell.x - START.x) + Math.abs(cell.y - START.y)
  const homeIndex = afar(route[0]) >= afar(route[route.length - 1]) ? 0 : route.length - 1
  return { route, homeIndex, field: buildField(walls, route[homeIndex]) }
}

function scanRoute(blocked: Set<string>, used: Set<string>): Point[] | null {
  for (let length = 6; length >= 3; length -= 1) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x + length <= COLS; x += 1) {
        const route = Array.from({ length }, (_, index) => ({ x: x + index, y }))
        if (route.every((cell) => !blocked.has(cellKey(cell)) && !used.has(cellKey(cell)))) return route
      }
    }
    for (let x = 0; x < COLS; x += 1) {
      for (let y = 0; y + length <= ROWS; y += 1) {
        const route = Array.from({ length }, (_, index) => ({ x, y: y + index }))
        if (route.every((cell) => !blocked.has(cellKey(cell)) && !used.has(cellKey(cell)))) return route
      }
    }
  }
  return null
}

function buildRoutes(seed: number, walls: Point[], count: number): GuardSeed[] {
  const random = mulberry32(seed)
  const blocked = new Set([...walls, START].map(cellKey))
  const used = new Set<string>()
  const routes: GuardSeed[] = []
  let attempts = 0
  while (routes.length < count && attempts < 320) {
    attempts += 1
    const horizontal = random() < 0.55
    const length = horizontal ? 4 + Math.floor(random() * 4) : 3 + Math.floor(random() * 3)
    const route: Point[] = []
    if (horizontal) {
      const y = 1 + Math.floor(random() * (ROWS - 2))
      const x = 1 + Math.floor(random() * (COLS - 1 - length))
      for (let index = 0; index < length; index += 1) route.push({ x: x + index, y })
    } else {
      const x = 1 + Math.floor(random() * (COLS - 2))
      const y = 1 + Math.floor(random() * (ROWS - 1 - length))
      for (let index = 0; index < length; index += 1) route.push({ x, y: y + index })
    }
    if (route.some((cell) => blocked.has(cellKey(cell)) || used.has(cellKey(cell)))) continue
    route.forEach((cell) => used.add(cellKey(cell)))
    routes.push(makeSeed(route, walls))
  }
  while (routes.length < count) {
    const found = scanRoute(blocked, used)
    if (!found) break
    found.forEach((cell) => used.add(cellKey(cell)))
    routes.push(makeSeed(found, walls))
  }
  return routes
}

function placePickups(seed: number, walls: Point[], quota: number): { pellets: Point[]; stars: Point[] } {
  const blocked = new Set([...walls, START].map(cellKey))
  const open: Point[] = []
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (!blocked.has(cellKey({ x, y }))) open.push({ x, y })
  const shuffled = shuffle(mulberry32(seed), open)
  const pellets = shuffled.slice(0, quota)
  const rest = shuffled.slice(quota)
  const stars: Point[] = []
  for (const cell of rest) {
    if (stars.every((star) => Math.abs(star.x - cell.x) + Math.abs(star.y - cell.y) >= 6)) stars.push(cell)
    if (stars.length === 2) break
  }
  while (stars.length < 2 && rest.length > stars.length) stars.push(rest[stars.length])
  return { pellets, stars }
}

export function validateSpec(spec: HarvestLevelSpec): string | null {
  if (spec.pellets.length !== spec.quota) return 'pellet quota mismatch'
  if (spec.stars.length !== 2) return 'star count mismatch'
  if (!isConnected(spec.walls)) return 'walls block the maze'
  const taken = new Set([...spec.walls, START].map(cellKey))
  for (const cell of [...spec.pellets, ...spec.stars]) {
    if (taken.has(cellKey(cell))) return 'pickup overlaps wall or start'
    taken.add(cellKey(cell))
  }
  const routeCells = new Set<string>()
  for (const seed of spec.guards) {
    if (seed.route.length < 3) return 'route too short'
    const home = seed.route[seed.homeIndex]
    if (seed.field[home.y * COLS + home.x] !== 0) return 'field home mismatch'
    for (const cell of seed.route) {
      if (spec.walls.some((wall) => sameCell(wall, cell))) return 'route crosses a wall'
      if (routeCells.has(cellKey(cell))) return 'routes overlap'
      routeCells.add(cellKey(cell))
    }
  }
  return null
}

const cache = new Map<number, HarvestLevelSpec>()

export function getHarvestLevel(level: number): HarvestLevelSpec {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const cached = cache.get(safe)
  if (cached) return cached
  const chapter = chapterOf(safe)
  const variant = safe - CHAPTER_STARTS[chapter - 1]
  const copy = CHAPTERS[chapter - 1]
  const tune = REBALANCE[safe] ?? {}
  const stepMs = 152 - (safe - 1)
  const quota = tune.quota ?? copy.quota
  const walls = buildWalls(seedFor(safe, 7), 12 + chapter * 3 + (variant % 3))
  const guards = buildRoutes(seedFor(safe, 11), walls, copy.guards)
  const { pellets, stars } = placePickups(seedFor(safe, 13), walls, quota)
  const spec: HarvestLevelSpec = {
    level: safe, chapter, modeName: copy.name, title: copy.title, detail: `${copy.detail} · 配额 ${quota}`,
    quota, stepMs, powerSteps: Math.round(10000 / stepMs),
    powerBonus: chapter === CHAPTER_STARTS.length ? Math.round(3000 / stepMs) : 0,
    regenEvery: copy.regenEvery,
    wrap: copy.wrap, patrolEvery: tune.patrolEvery ?? copy.patrolEvery, chaseEvery: tune.chaseEvery ?? copy.chaseEvery,
    walls, pellets, stars, guards, seed: seedFor(safe, 13),
  }
  cache.set(safe, spec)
  return spec
}

export function createHarvestState(level: number): GameState {
  const spec = getHarvestLevel(level)
  const rule: GameRule = {
    quota: spec.quota, stepMs: spec.stepMs, powerSteps: spec.powerSteps, powerBonus: spec.powerBonus,
    regenEvery: spec.regenEvery,
    wrap: spec.wrap, patrolEvery: spec.patrolEvery, chaseEvery: spec.chaseEvery,
  }
  return createState(spec.walls, spec.pellets, spec.stars, spec.guards, rule)
}
