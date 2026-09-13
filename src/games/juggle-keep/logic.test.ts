import { describe, expect, it, vi } from 'vitest'
import {
  BALL_RADIUS,
  FIELD,
  GOLD_FACTOR,
  GOLD_QUOTA,
  GOLD_RADIUS,
  MAX_DEFLECT,
  PADDLE_BASE,
  PADDLE_TOP,
  RESET_SPREAD,
  RESET_VY,
  RESET_Y,
  RESPAWN_DELAY,
  SCORE_PER_BOUNCE,
  ZONE_FACTOR,
  createGameState,
  step,
  withPaddle,
  type Ball,
  type GameState,
} from './logic'
import { CHAPTER_STARTS, LEVEL_COUNT, getJuggleLevel, validateJuggle } from './levels'

const mk = (over: Partial<Ball>): Ball => ({ id: 1, kind: 'normal', x: 240, y: 300, vx: 0, vy: 0, r: BALL_RADIUS, speed: 400, ...over })
const freeBall = (state: GameState, ball: Ball): GameState => ({ ...state, balls: [ball] })

describe('juggle keep levels', () => {
  it('builds sixty deterministic validated plans across five chapters', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = getJuggleLevel(level)
      expect(getJuggleLevel(level)).toBe(spec)
      expect(validateJuggle(spec)).toBeNull()
      const first = createGameState(spec, level)
      const second = createGameState(spec, level)
      expect(first).toEqual(second)
      expect(first.balls).toHaveLength(spec.startBalls)
      expect(first.balls.every((ball) => ball.x > 0 && ball.x < FIELD.width && ball.y === 70)).toBe(true)
      expect(first.balls.filter((ball) => ball.kind === 'normal').length).toBe(Math.min(spec.startBalls, spec.maxBalls))
    }
    expect(getJuggleLevel(1)).toMatchObject({ chapter: 1, goldCount: 0, zoneCount: 0 })
    expect(getJuggleLevel(23)).toMatchObject({ startBalls: 1, capacity: 3 })
    expect(getJuggleLevel(34)).toMatchObject({ capacity: 3, goldCount: 1 })
    expect(getJuggleLevel(45).zones.length).toBeGreaterThan(0)
  })

  it('regenerates byte-identical plans in a fresh module registry', async () => {
    const marks = [1, 30, 60]
    const snapshot = marks.map((level) => [
      JSON.stringify(getJuggleLevel(level)),
      JSON.stringify(createGameState(getJuggleLevel(level), level)),
    ])
    vi.resetModules()
    const { getJuggleLevel: freshLevel } = await import('./levels')
    const { createGameState: freshState } = await import('./logic')
    marks.forEach((level, index) => {
      expect(JSON.stringify(freshLevel(level))).toBe(snapshot[index][0])
      expect(JSON.stringify(freshState(freshLevel(level), level))).toBe(snapshot[index][1])
    })
  })

  it('keeps one mechanic per chapter and stacks all of them in the finale', () => {
    const marks = CHAPTER_STARTS.map((start) => getJuggleLevel(start))
    expect(marks.map((spec) => spec.quota)).toEqual([30, 40, 34, 36, 40])
    expect(marks.map((spec) => spec.capacity)).toEqual([1, 2, 3, 3, 3])
    expect(marks.map((spec) => spec.goldCount)).toEqual([0, 0, 0, 1, 1])
    expect(marks.map((spec) => spec.startBalls)).toEqual([1, 2, 1, 1, 2])
    for (let level = 2; level <= LEVEL_COUNT; level += 1) {
      expect(getJuggleLevel(level).ballSpeed).toBeGreaterThan(getJuggleLevel(level - 1).ballSpeed)
      expect(getJuggleLevel(level).gravity).toBeGreaterThan(getJuggleLevel(level - 1).gravity)
    }
    expect(marks[2].joinAfter).toBeGreaterThan(marks[3].joinAfter)
    expect(marks[3].joinAfter).toBeGreaterThan(marks[4].joinAfter)
    for (let level = 24; level <= 33; level += 1) {
      expect(getJuggleLevel(level).joinAfter).toBeLessThan(getJuggleLevel(level - 1).joinAfter)
    }
    expect(getJuggleLevel(45).zones).toHaveLength(1)
    expect(getJuggleLevel(53).zones).toHaveLength(2)
    expect(getJuggleLevel(44).zones).toHaveLength(0)
  })
})

describe('juggle physics', () => {
  it('accelerates balls with gravity and boosts it inside gravity zones', () => {
    const plain = step(freeBall(createGameState(getJuggleLevel(1), 1), mk({ y: 200 })), 1 / 60)
    expect(plain.balls[0].vy).toBeCloseTo(601 / 60, 4)
    expect(plain.balls[0].y).toBeGreaterThan(200)
    const zoned = { ...freeBall(createGameState(getJuggleLevel(60), 60), mk({ y: 200 })), zones: [{ y: 180, height: 100 }] }
    const inside = step(zoned, 1 / 60)
    expect(inside.balls[0].vy).toBeCloseTo((660 * ZONE_FACTOR) / 60, 4)
    expect(inside.balls[0].vy).toBeGreaterThan(plain.balls[0].vy)
    const outside = step({ ...zoned, zones: [{ y: 400, height: 50 }] }, 1 / 60)
    expect(outside.balls[0].vy).toBeCloseTo(660 / 60, 4)
  })

  it('reflects balls off walls and the ceiling without losing them', () => {
    const base = createGameState(getJuggleLevel(1), 1)
    const left = step(freeBall(base, mk({ x: 3, y: 300, vx: -300 })), 1 / 60)
    expect(left.balls[0].vx).toBeGreaterThan(0)
    expect(left.balls[0].x).toBeGreaterThanOrEqual(BALL_RADIUS)
    const right = step(freeBall(base, mk({ x: FIELD.width - 3, y: 300, vx: 300 })), 1 / 60)
    expect(right.balls[0].vx).toBeLessThan(0)
    const ceiling = step(freeBall(base, mk({ y: 5, vy: -300 })), 1 / 60)
    expect(ceiling.balls[0].vy).toBeGreaterThan(0)
    expect(ceiling.balls[0].y).toBeGreaterThanOrEqual(BALL_RADIUS)
  })

  it('steers the bounce angle by contact offset while preserving speed', () => {
    const at = (offset: number) => step(
      freeBall(createGameState(getJuggleLevel(1), 1), mk({ x: FIELD.width / 2 + offset, y: PADDLE_TOP - BALL_RADIUS + 1, vy: 300, speed: 360 })),
      1 / 240,
    )
    const center = at(0)
    expect(center.balls[0].vy).toBeLessThan(0)
    expect(Math.abs(center.balls[0].vx)).toBeCloseTo(0, 5)
    expect(center.bounces).toBe(1)
    expect(center.score).toBe(SCORE_PER_BOUNCE)
    expect(center.events).toContain('bounce')
    const edge = at(PADDLE_BASE / 2)
    expect(Math.atan2(edge.balls[0].vx, -edge.balls[0].vy)).toBeCloseTo(MAX_DEFLECT, 5)
    expect(Math.hypot(edge.balls[0].vx, edge.balls[0].vy)).toBeCloseTo(360, 4)
    expect(edge.balls[0].y).toBe(PADDLE_TOP - BALL_RADIUS)
    const missed = step(freeBall(createGameState(getJuggleLevel(1), 1), mk({ x: 30, y: PADDLE_TOP - BALL_RADIUS - 2, vy: 300 })), 1 / 60)
    expect(missed.bounces).toBe(0)
  })

  it('pays 50 per bounce with a 30 bonus for rotating balls, gold counts five', () => {
    const plan = getJuggleLevel(1)
    const parked = (id: number, x: number): Ball => ({ id, kind: 'normal', x, y: PADDLE_TOP - BALL_RADIUS - 2, vx: 0, vy: 300, r: BALL_RADIUS, speed: 400 })
    let state = step(freeBall(createGameState(plan, 1), parked(1, 200)), 1 / 60)
    expect(state.score).toBe(SCORE_PER_BOUNCE)
    state = step(freeBall(state, parked(2, 200)), 1 / 60)
    expect(state.score).toBe(SCORE_PER_BOUNCE + 80)
    state = step(freeBall(state, parked(1, 200)), 1 / 60)
    expect(state.score).toBe(SCORE_PER_BOUNCE + 160)
    state = step(freeBall(state, parked(1, 200)), 1 / 60)
    expect(state.score).toBe(SCORE_PER_BOUNCE * 2 + 160)
    const gold = step(freeBall(createGameState(plan, 1), { id: 9, kind: 'gold', x: 240, y: PADDLE_TOP - GOLD_RADIUS - 2, vx: 0, vy: 300, r: GOLD_RADIUS, speed: 500 }), 1 / 60)
    expect(gold.events).toContain('gold')
    expect(gold.bounces).toBe(GOLD_QUOTA)
    expect(gold.score).toBe(SCORE_PER_BOUNCE)
    const cleared = step({ ...freeBall(createGameState(plan, 1), { id: 9, kind: 'gold', x: 240, y: PADDLE_TOP - GOLD_RADIUS - 2, vx: 0, vy: 300, r: GOLD_RADIUS, speed: 500 }), quota: 5 }, 1 / 60)
    expect(cleared.status).toBe('cleared')
    expect(cleared.events).toContain('clear')
  })
})

describe('ball lifecycle', () => {
  it('joins queued balls on the interval and saves gold for last', () => {
    let state = { ...createGameState(getJuggleLevel(34), 34), joinTimer: 0.0001 }
    state = step(state, 1 / 60)
    expect(state.balls).toHaveLength(2)
    expect(state.events).toContain('join')
    expect(state.joinTimer).toBeLessThanOrEqual(getJuggleLevel(34).joinAfter)
    expect(state.joinTimer).toBeGreaterThan(getJuggleLevel(34).joinAfter - 0.05)
    state = { ...state, joinTimer: 0.0001 }
    state = step(state, 1 / 60)
    expect(state.balls).toHaveLength(3)
    expect(state.balls[2].kind).toBe('gold')
    expect(state.balls[2].r).toBe(GOLD_RADIUS)
    expect(state.balls[2].speed).toBeCloseTo(426 * GOLD_FACTOR, 4)
    const relay = createGameState(getJuggleLevel(23), 23)
    expect(relay.balls).toHaveLength(1)
    expect(relay.joinAfter).toBeGreaterThan(0)
  })

  it('costs one life per drop event, serves a fresh one and ends at zero lives', () => {
    const falling = mk({ y: FIELD.height + 40, vy: 300 })
    const dropped = step(freeBall(createGameState(getJuggleLevel(1), 1), falling), 1 / 60)
    expect(dropped.lives).toBe(2)
    expect(dropped.balls).toHaveLength(0)
    expect(dropped.events).toContain('drop')
    expect(dropped.spawnTimer).toBeLessThanOrEqual(RESPAWN_DELAY)
    expect(dropped.spawnTimer).toBeGreaterThan(RESPAWN_DELAY - 1 / 60)
    let served = dropped
    for (let index = 0; index < 80 && served.balls.length === 0; index += 1) served = step(served, 1 / 60)
    expect(served.balls).toHaveLength(1)
    expect(served.events).toContain('serve')
    let doomed = { ...freeBall(createGameState(getJuggleLevel(1), 1), falling), lives: 1 }
    doomed = step(doomed, 1 / 60)
    expect(doomed.status).toBe('over')
    expect(doomed.events).toContain('over')
    expect(doomed.lives).toBe(0)
    expect(step(doomed, 1 / 60)).toBe(doomed)
  })

  it('charges a single life when several balls drop and resets the rest above the paddle', () => {
    const falling = (id: number, x: number): Ball => mk({ id, x, y: FIELD.height + 30, vy: 200 })
    const pair = step({ ...createGameState(getJuggleLevel(1), 1), balls: [falling(1, 60), falling(2, 400)] }, 1 / 60)
    expect(pair.lives).toBe(2)
    expect(pair.events.filter((event) => event === 'drop')).toHaveLength(2)
    expect(pair.balls).toHaveLength(1)
    expect(pair.balls[0].id).toBe(2)
    expect(pair.balls[0].vx).toBe(0)
    expect(pair.balls[0].x).toBeCloseTo(FIELD.width / 2 - RESET_SPREAD, 6)
    expect(pair.balls[0].vy).toBeGreaterThan(RESET_VY)
    expect(pair.balls[0].vy).toBeLessThan(RESET_VY + 20)
    expect(pair.balls[0].y).toBeGreaterThan(RESET_Y - 1)
    expect(pair.balls[0].y).toBeLessThan(RESET_Y + 4)
    const trio = step({ ...createGameState(getJuggleLevel(1), 1), balls: [falling(1, 60), falling(2, 200), falling(3, 420)] }, 1 / 60)
    expect(trio.lives).toBe(2)
    expect(trio.events.filter((event) => event === 'drop')).toHaveLength(3)
    expect(trio.balls.map((ball) => ball.x).sort((a, b) => a - b))
      .toEqual([FIELD.width / 2 - RESET_SPREAD, FIELD.width / 2 + RESET_SPREAD])
    const resumed = step(trio, 1 / 60)
    expect(resumed.balls.every((ball) => ball.y > RESET_Y && ball.vy < 300)).toBe(true)
    let doomed = { ...createGameState(getJuggleLevel(1), 1), balls: [falling(1, 60), falling(2, 400)], lives: 1 }
    doomed = step(doomed, 1 / 60)
    expect(doomed.status).toBe('over')
    expect(doomed.lives).toBe(0)
  })
})

describe('boundaries and determinism', () => {
  it('clamps paddle input and rejects invalid frames', () => {
    const state = createGameState(getJuggleLevel(1), 1)
    const half = PADDLE_BASE / 2
    expect(withPaddle(state, -40).paddle.x).toBe(half)
    expect(withPaddle(state, FIELD.width + 40).paddle.x).toBe(FIELD.width - half)
    expect(withPaddle(state, Number.NaN).paddle.x).toBe(FIELD.width / 2)
    expect(withPaddle(state, state.paddle.x)).toBe(state)
    expect(step(state, Number.NaN)).toBe(state)
    expect(step(state, -1)).toBe(state)
    expect(step(state, 0)).toBe(state)
    expect(step(state, 9).time).toBeCloseTo(state.time + 0.05, 6)
  })

  it('replays an input script with identical results', () => {
    const script = () => {
      let state = createGameState(getJuggleLevel(30), 30)
      for (let frame = 0; frame < 600; frame += 1) {
        if (state.status !== 'playing') break
        state = step(withPaddle(state, 90 + (frame % 300)), 1 / 60)
      }
      return JSON.stringify(state)
    }
    expect(script()).toBe(script())
    expect(createGameState(getJuggleLevel(30), 30)).toEqual(createGameState(getJuggleLevel(30), 30))
  })
})
