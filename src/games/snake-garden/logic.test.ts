import { describe, expect, it } from 'vitest'
import { COLS, ROWS, START, queueDir, sameCell, step, type GameState } from './logic'
import { LEVEL_COUNT, buildWalls, createSnakeState, getSnakeLevel, isConnected } from './levels'

describe('snake garden levels', () => {
  it('generates sixty deterministic levels with fair fruit and connected walls', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const first = createSnakeState(level)
      const second = createSnakeState(level)
      expect(first).toEqual(second)
      expect(first.snake).toHaveLength(3)
      expect(isConnected(first.walls)).toBe(true)
      expect([...first.snake, ...first.walls].some((cell) => sameCell(cell, first.fruit))).toBe(false)
      expect(getSnakeLevel(level).walls).toEqual(first.walls)
    }
    expect(createSnakeState(1).walls).toHaveLength(0)
    expect(getSnakeLevel(13).walls.length).toBeGreaterThan(0)
    expect(buildWalls(4242, 12)).toEqual(buildWalls(4242, 12))
  })

  it('advances one cell per tick, rejects reversal, and grows on fruit', () => {
    const state = createSnakeState(1)
    const reversed = step(state, 'left')
    expect(reversed.dir).toBe('right')
    expect(reversed.queue).toHaveLength(0)
    expect(reversed.snake[0]).toEqual({ x: START.x + 1, y: START.y })
    const fed: GameState = { ...state, fruit: { x: START.x + 1, y: START.y } }
    const after = step(fed)
    expect(after.events).toContain('eat')
    expect(after.snake).toHaveLength(4)
    expect(after.eaten).toBe(1)
    expect(after.score).toBe(100 * state.rule.tier)
    expect(after.speedMs).toBe(state.speedMs)
    const idle = step(state)
    expect(idle.snake).toHaveLength(3)
    expect(idle.score).toBe(0)
    expect(idle.steps).toBe(state.steps + 1)
  })

  it('completes at quota and fails on walls and self bites', () => {
    let state = createSnakeState(1)
    const quota = state.rule.quota
    for (let index = 0; index < quota; index += 1) {
      state = step({ ...state, fruit: { x: state.snake[0].x + 1, y: state.snake[0].y }, golden: null })
    }
    expect(state.eaten).toBe(quota)
    expect(state.status).toBe('completed')
    const edge = step({
      ...createSnakeState(1),
      snake: [{ x: COLS - 1, y: 6 }, { x: COLS - 2, y: 6 }, { x: COLS - 3, y: 6 }],
      dir: 'right',
      fruit: { x: 0, y: 0 },
      golden: null,
    })
    expect(edge.status).toBe('failed')
    expect(edge.events).toContain('wall')
    const coiled = step(step(step({
      ...createSnakeState(1),
      snake: [{ x: 9, y: 6 }, { x: 8, y: 6 }, { x: 7, y: 6 }, { x: 6, y: 6 }, { x: 5, y: 6 }],
      dir: 'right',
      fruit: { x: 0, y: 0 },
      golden: null,
    }, 'up'), 'left'), 'down')
    expect(coiled.status).toBe('failed')
    expect(coiled.events).toContain('self')
  })

  it('wraps across the border only in wrap chapters', () => {
    expect(getSnakeLevel(37).wrap).toBe(true)
    expect(getSnakeLevel(1).wrap).toBe(false)
    const wrapped = step({
      ...createSnakeState(37),
      snake: [{ x: COLS - 1, y: 6 }, { x: COLS - 2, y: 6 }, { x: COLS - 3, y: 6 }],
      dir: 'right',
      fruit: { x: 0, y: 0 },
      golden: null,
    })
    expect(wrapped.status).toBe('running')
    expect(wrapped.snake[0]).toEqual({ x: 0, y: 6 })
    const vertical = step({
      ...createSnakeState(37),
      snake: [{ x: 8, y: 0 }, { x: 8, y: 1 }, { x: 8, y: 2 }],
      dir: 'up',
      fruit: { x: 0, y: 0 },
      golden: null,
    })
    expect(vertical.snake[0]).toEqual({ x: 8, y: ROWS - 1 })
    const edge = step({
      ...createSnakeState(1),
      snake: [{ x: COLS - 1, y: 6 }, { x: COLS - 2, y: 6 }, { x: COLS - 3, y: 6 }],
      dir: 'right',
      fruit: { x: 0, y: 0 },
      golden: null,
    })
    expect(edge.status).toBe('failed')
  })

  it('tightens pace, quota and hazards across five chapters', () => {
    const specs = [1, 13, 25, 37, 49].map((level) => getSnakeLevel(level))
    expect(specs.map((spec) => spec.quota)).toEqual([5, 6, 6, 7, 8])
    for (let index = 1; index < specs.length; index += 1) {
      expect(specs[index].tier).toBeGreaterThanOrEqual(specs[index - 1].tier)
      expect(specs[index].stepMs).toBeLessThan(specs[index - 1].stepMs)
    }
    expect(getSnakeLevel(60).tier).toBe(4)
    for (let level = 2; level <= LEVEL_COUNT; level += 1) {
      expect(getSnakeLevel(level).stepMs).toBeLessThan(getSnakeLevel(level - 1).stepMs)
    }
    expect(specs[0].walls).toHaveLength(0)
    expect(specs[1].walls.length).toBeGreaterThan(0)
    expect(specs[4].walls.length).toBeGreaterThanOrEqual(specs[1].walls.length)
    expect(specs[2].accel).toBeGreaterThan(0)
    expect(specs[4].accel).toBeGreaterThan(specs[2].accel)
    expect(specs[2].fruitLifespan).toBeGreaterThan(0)
    expect(specs[4].fruitLifespan).toBeLessThan(specs[2].fruitLifespan)
    expect(specs[0].golden).toBe(false)
    expect(specs[3].golden).toBe(true)
    expect(specs[4].wrap).toBe(true)
  })

  it('relocates expired fruit, pays triple for golden, and buffers turns', () => {
    const state = createSnakeState(25)
    expect(state.rule.fruitLifespan).toBeGreaterThan(0)
    const expired = step({ ...state, fruitAge: state.rule.fruitLifespan - 1, fruit: { x: 2, y: 2 } })
    expect(expired.events).toContain('expire')
    expect(expired.fruitAge).toBe(0)
    expect([...expired.snake, ...expired.walls].some((cell) => sameCell(cell, expired.fruit))).toBe(false)
    const paid = step({ ...createSnakeState(37), golden: { x: START.x + 1, y: START.y }, fruit: { x: 0, y: 0 } })
    expect(paid.events).toContain('golden')
    expect(paid.score).toBe(300 * paid.rule.tier)
    expect(paid.snake).toHaveLength(4)
    expect(paid.golden).toBeNull()
    const scheduled = step({ ...createSnakeState(37), fruit: { x: START.x + 1, y: START.y }, eaten: 2, golden: null })
    expect(scheduled.events).toContain('eat')
    expect(scheduled.golden).not.toBeNull()
    const queued = queueDir(queueDir(createSnakeState(1), 'up'), 'left')
    expect(queued.queue).toEqual(['up', 'left'])
    const first = step(queued)
    expect(first.dir).toBe('up')
    const second = step(first)
    expect(second.dir).toBe('left')
    expect(second.snake[0]).toEqual({ x: START.x - 1, y: START.y - 1 })
  })
})
