import { describe, expect, it } from 'vitest'
import { COLS, DIRS, ROWS, START_LIVES, cellKey, facingOf, sameCell, step, type Dir, type GameState, type GuardState, type Point } from './logic'
import { LEVEL_COUNT, createHarvestState, getHarvestLevel } from './levels'

const DIR_KEYS = Object.keys(DIRS) as Dir[]
const SIGHT_RANGE = 7
const STEP_BUDGET = 4000
const HORIZON = 40
const RISK_NEAR = 520
const RISK_SIGHT_BASE = 40
const RISK_SIGHT_STEP = 60
const idxOf = (cell: Point) => cell.y * COLS + cell.x
const cellOf = (idx: number): Point => ({ x: idx % COLS, y: Math.floor(idx / COLS) })

const neighborOf = (state: GameState, cell: Point, dir: Dir): Point | null => {
  let x = cell.x + DIRS[dir].x
  const y = cell.y + DIRS[dir].y
  if (state.rule.wrap) x = (x + COLS) % COLS
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null
  const point = { x, y }
  return state.walls.some((wall) => sameCell(wall, point)) ? null : point
}

const dirFromTo = (from: Point, to: Point): Dir => {
  const dx = to.x - from.x
  if (to.y === from.y - 1) return 'up'
  if (to.y === from.y + 1) return 'down'
  if (dx === 1 || dx === -(COLS - 1)) return 'right'
  return 'left'
}

// 逐 tick 投影守卫：巡弋守卫按节奏精确外推（朝向与游戏 facingOf 一致，含端点回弹前的
// 「僵直朝向」）；追击/回巢/冰冻守卫按原地保守处理。
function projectTicks(state: GameState): { blocked: Set<number>; risk: Map<number, number> }[] {
  const tracks = state.guards.map((guard) => {
    if (guard.frozen > 0 || guard.mode !== 'patrol') {
      return Array.from({ length: HORIZON + 1 }, () => ({ pos: guard.pos, facing: facingOf(guard) }))
    }
    let index = guard.index
    let fwd = guard.fwd
    let phase = guard.phase
    return Array.from({ length: HORIZON + 1 }, () => {
      const frame = { pos: guard.route[index], facing: facingOf({ route: guard.route, index, fwd } as GuardState) }
      phase += 1
      if (phase >= state.rule.patrolEvery) {
        phase = 0
        let next = index + (fwd ? 1 : -1)
        if (next < 0 || next >= guard.route.length) {
          fwd = !fwd
          next = index + (fwd ? 1 : -1)
        }
        index = next
      }
      return frame
    })
  })
  return Array.from({ length: HORIZON + 1 }, (_, tick) => {
    const blocked = new Set<number>()
    const risk = new Map<number, number>()
    const weigh = (cell: Point | null, penalty: number) => {
      if (!cell) return
      const idx = idxOf(cell)
      risk.set(idx, Math.max(risk.get(idx) ?? 0, penalty))
    }
    for (const frames of tracks) {
      const { pos, facing } = frames[tick]
      blocked.add(idxOf(pos))
      for (const dir of DIR_KEYS) weigh(neighborOf(state, pos, dir), RISK_NEAR)
      let cursor: Point | null = pos
      for (let reach = 1; reach <= SIGHT_RANGE && cursor; reach += 1) {
        cursor = neighborOf(state, cursor, facing)
        weigh(cursor, RISK_SIGHT_BASE + (SIGHT_RANGE - reach) * RISK_SIGHT_STEP)
      }
    }
    return { blocked, risk }
  })
}

// 时空 Dijkstra：等待以「来回振荡」表达（游戏内无原地停步），风险按 tick 投影计价。
function timedPlan(state: GameState, targets: Set<string>, ticks: ReturnType<typeof projectTicks>): Point[] | null {
  const cells = COLS * ROWS
  const cost = new Float64Array((HORIZON + 1) * cells).fill(Infinity)
  const prev = new Int32Array((HORIZON + 1) * cells).fill(-1)
  const heap: [number, number][] = []
  const push = (key: number, value: number) => {
    heap.push([value, key])
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent][0] <= heap[i][0]) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }
  const pop = (): [number, number] | undefined => {
    if (!heap.length) return undefined
    const top = heap[0]
    const last = heap.pop() as [number, number]
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = left + 1
        let small = i
        if (left < heap.length && heap[left][0] < heap[small][0]) small = left
        if (right < heap.length && heap[right][0] < heap[small][0]) small = right
        if (small === i) break
        ;[heap[small], heap[i]] = [heap[i], heap[small]]
        i = small
      }
    }
    return top
  }
  const start = idxOf(state.player)
  cost[start] = 0
  push(start, 0)
  while (heap.length) {
    const [base, key] = pop() as [number, number]
    if (base > cost[key]) continue
    const idx = key % cells
    if (key !== start && targets.has(cellKey(cellOf(idx)))) {
      const path: Point[] = []
      let walk = key
      while (walk !== start) {
        path.unshift(cellOf(walk % cells))
        walk = prev[walk]
      }
      return path
    }
    const tick = Math.min(Math.floor(key / cells) + 1, HORIZON)
    const field = ticks[tick]
    for (const dir of DIR_KEYS) {
      const next = neighborOf(state, cellOf(idx), dir)
      if (!next || field.blocked.has(idxOf(next))) continue
      const nKey = tick * cells + idxOf(next)
      const candidate = base + 1 + (field.risk.get(idxOf(next)) ?? 0)
      if (candidate < cost[nKey]) {
        cost[nKey] = candidate
        prev[nKey] = key
        push(nKey, candidate)
      }
    }
  }
  return null
}

const isNeighborOf = (state: GameState, cell: Point) => DIR_KEYS.some((dir) => {
  const next = neighborOf(state, state.player, dir)
  return next ? sameCell(next, cell) : false
})

// 贪心自动驾驶：时空规划（振荡等待、按 tick 风险择时穿越），逐步校验计划头相邻且
// 非守卫本体，被抓/计划失效即重规划。护星期无敌时视为零风险直取星屑。
export function autopilot(level: number): GameState {
  let state = createHarvestState(level)
  let plan: Point[] = []
  for (let index = 0; index < STEP_BUDGET && state.status === 'running'; index += 1) {
    if (state.events.includes('caught')) plan = []
    const ticks = projectTicks(state)
    const field = ticks[0]
    const head = plan[0]
    if (head && isNeighborOf(state, head) && !field.blocked.has(idxOf(head))) {
      plan = plan.slice(1)
      state = step(state, dirFromTo(state.player, head))
      continue
    }
    plan = []
    const targets = new Set(state.pellets.map(cellKey))
    const moves = timedPlan(state, targets, ticks)
    if (moves && moves.length) {
      plan = moves.slice(1)
      state = step(state, dirFromTo(state.player, moves[0]))
    } else state = step(state, state.dir)
  }
  return state
}

describe('star harvest autopilot reachability', () => {
  it('greedy bot clears all sixty levels meeting quota with at most two lives lost', () => {
    const fragile: string[] = []
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const end = autopilot(level)
      const lost = START_LIVES - end.lives
      if (end.status !== 'completed' || lost > 2) fragile.push(`L${level}:${end.status}:-${lost}:${end.eaten}`)
      expect(end.status, `level ${level} ended as ${end.status}`).toBe('completed')
      expect(end.eaten, `level ${level} only ate ${end.eaten}`).toBeGreaterThanOrEqual(getHarvestLevel(level).quota)
      expect(lost, `level ${level} lost ${lost} lives`).toBeLessThanOrEqual(2)
    }
    expect(fragile, `unreachable levels: ${fragile.join(', ')}`).toEqual([])
  }, 60000)

  it('plays a level deterministically from a fixed seed', () => {
    expect(JSON.stringify(autopilot(32))).toBe(JSON.stringify(autopilot(32)))
    expect(autopilot(32).status).toBe('completed')
  }, 30000)
})
