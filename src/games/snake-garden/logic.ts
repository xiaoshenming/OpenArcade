export const COLS = 17
export const ROWS = 13
export const SCORE_CAP = 10000
export const START: Point = { x: 8, y: 6 }
export type Dir = 'up' | 'down' | 'left' | 'right'
export type StepEvent = 'move' | 'eat' | 'golden' | 'expire' | 'golden-gone' | 'wall' | 'self'
export type SnakeStatus = 'running' | 'completed' | 'failed'
export interface Point { x: number; y: number }
export interface GameRule {
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
}
export interface GameState {
  snake: Point[]
  dir: Dir
  queue: Dir[]
  walls: Point[]
  fruit: Point
  fruitAge: number
  golden: Point | null
  goldenAge: number
  rng: number
  eaten: number
  score: number
  speedMs: number
  steps: number
  status: SnakeStatus
  rule: GameRule
  events: StepEvent[]
}
export const DIRS: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
export const sameCell = (a: Point, b: Point) => a.x === b.x && a.y === b.y
export const isOpposite = (a: Dir, b: Dir) => DIRS[a].x + DIRS[b].x === 0 && DIRS[a].y + DIRS[b].y === 0

export function nextRandom(seed: number): [number, number] {
  const state = (seed + 0x6d2b79f5) >>> 0
  let value = state
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return [((value ^ (value >>> 14)) >>> 0) / 4294967296, state]
}

export function pickFree(seed: number, blocked: Point[]): { cell: Point; rng: number } {
  let rng = seed
  const taken = (cell: Point) => blocked.some((item) => sameCell(item, cell))
  for (let attempt = 0; attempt < 96; attempt += 1) {
    const first = nextRandom(rng)
    const second = nextRandom(first[1])
    rng = second[1]
    const cell = { x: Math.floor(first[0] * COLS), y: Math.floor(second[0] * ROWS) }
    if (!taken(cell)) return { cell, rng }
  }
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = { x, y }
      if (!taken(cell)) return { cell, rng }
    }
  }
  return { cell: { x: 0, y: 0 }, rng }
}

export function createState(walls: Point[], rule: GameRule, seed: number): GameState {
  const snake = [START, { x: START.x - 1, y: START.y }, { x: START.x - 2, y: START.y }]
  const spawn = pickFree(seed, [...snake, ...walls])
  return {
    snake, dir: 'right', queue: [], walls, fruit: spawn.cell, fruitAge: 0, golden: null, goldenAge: 0,
    rng: spawn.rng, eaten: 0, score: 0, speedMs: rule.stepMs, steps: 0, status: 'running', rule, events: [],
  }
}

export function queueDir(state: GameState, dir: Dir): GameState {
  if (state.status !== 'running') return state
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir
  if (dir === last || isOpposite(dir, last)) return state
  return { ...state, queue: [...state.queue, dir].slice(-2) }
}

export function step(state: GameState, dir?: Dir): GameState {
  return advance(dir ? queueDir(state, dir) : state)
}

function advance(state: GameState): GameState {
  if (state.status !== 'running') return state
  const queue = [...state.queue]
  const dir = queue.length ? (queue.shift() as Dir) : state.dir
  const delta = DIRS[dir]
  const head = state.snake[0]
  const x = state.rule.wrap ? (head.x + delta.x + COLS) % COLS : head.x + delta.x
  const y = state.rule.wrap ? (head.y + delta.y + ROWS) % ROWS : head.y + delta.y
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS || state.walls.some((wall) => wall.x === x && wall.y === y)) {
    return { ...state, dir, status: 'failed', events: ['wall'] }
  }
  const eats = sameCell({ x, y }, state.fruit)
  const claims = state.golden !== null && sameCell({ x, y }, state.golden)
  const body = eats || claims ? state.snake : state.snake.slice(0, -1)
  if (body.some((cell) => cell.x === x && cell.y === y)) return { ...state, dir, status: 'failed', events: ['self'] }
  const snake = eats || claims ? [{ x, y }, ...state.snake] : [{ x, y }, ...state.snake.slice(0, -1)]
  let rng = state.rng
  let score = state.score
  let eaten = state.eaten
  let fruit = state.fruit
  let fruitAge = state.fruitAge
  let golden = state.golden
  let goldenAge = state.goldenAge
  let speedMs = state.speedMs
  let status: SnakeStatus = state.status
  const events: StepEvent[] = ['move']
  if (eats) {
    eaten += 1
    score = Math.min(SCORE_CAP, score + 100 * state.rule.tier)
    speedMs = Math.max(state.rule.minStepMs, speedMs - state.rule.accel)
    events.push('eat')
    const occupied = [...snake, ...state.walls]
    const spawn = pickFree(rng, golden ? [...occupied, golden] : occupied)
    fruit = spawn.cell
    rng = spawn.rng
    fruitAge = 0
    if (state.rule.golden && !golden && eaten % state.rule.goldenEvery === 0) {
      const bonus = pickFree(rng, [...occupied, fruit])
      golden = bonus.cell
      goldenAge = 0
      rng = bonus.rng
    }
    if (eaten >= state.rule.quota) status = 'completed'
  } else {
    fruitAge += 1
    if (state.rule.fruitLifespan > 0 && fruitAge >= state.rule.fruitLifespan) {
      const spawn = pickFree(rng, [...snake, ...state.walls, ...(golden ? [golden] : [])])
      fruit = spawn.cell
      rng = spawn.rng
      fruitAge = 0
      events.push('expire')
    }
  }
  if (claims) {
    score = Math.min(SCORE_CAP, score + 300 * state.rule.tier)
    golden = null
    events.push('golden')
  } else if (golden) {
    goldenAge += 1
    if (goldenAge >= state.rule.goldenLifespan) {
      golden = null
      events.push('golden-gone')
    }
  }
  return {
    ...state, snake, dir, queue, fruit, fruitAge, golden, goldenAge, rng, eaten, score,
    speedMs, steps: state.steps + 1, status, events,
  }
}
