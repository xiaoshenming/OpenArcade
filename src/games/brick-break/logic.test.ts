import { describe, expect, it, vi } from 'vitest'
import {
  BALL_RADIUS,
  FIELD,
  MAX_DEFLECT,
  PADDLE_TOP,
  SCORE_PER_BRICK,
  WIDE_BONUS,
  clearBonus,
  createGameState,
  launch,
  paddleSpan,
  step,
  withPaddle,
  type GameState,
} from './logic'
import { CHAPTER_STARTS, LEVEL_COUNT, getBreakLevel, validateLevel, type BreakLevel } from './levels'

const plan = (level: number) => getBreakLevel(level)
const freeBall = (state: GameState, x: number, y: number, vx: number, vy: number): GameState => ({
  ...state,
  serveTimer: 0,
  balls: [{ x, y, vx, vy, r: BALL_RADIUS, held: false }],
})

describe('brick-break levels', () => {
  it('builds sixty deterministic, valid and varied brick layouts', () => {
    const signatures = new Set<string>()
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = plan(level)
      expect(JSON.stringify(spec)).toBe(JSON.stringify(plan(level)))
      expect(validateLevel(spec)).toBeNull()
      expect(spec.breakable).toBeGreaterThanOrEqual(12)
      expect(spec.rows).toBeLessThanOrEqual(8)
      signatures.add(`${spec.rows}:${spec.pattern}:${spec.bricks.map((cell) => cell.kind).join('')}`)
    }
    expect(signatures.size).toBeGreaterThanOrEqual(24)
  })

  it('regenerates byte-identical layouts in a fresh module registry', async () => {
    vi.resetModules()
    const { getBreakLevel: freshLevel } = await import('./levels')
    for (const level of [1, 7, 13, 25, 38, 47, 60]) {
      expect(JSON.stringify(freshLevel(level))).toBe(JSON.stringify(getBreakLevel(level)))
    }
  })

  it('introduces one mechanic per chapter and stacks all of them in the finale', () => {
    expect(plan(1)).toMatchObject({ chapter: 1, hardCount: 0, metals: 0 })
    expect(plan(1).dropChance).toBe(0)
    expect(plan(1).driftRows).toEqual([])
    expect(plan(13).hardCount).toBeGreaterThan(0)
    expect(plan(23).dropChance).toBeGreaterThan(0)
    expect(plan(34).driftRows.length).toBeGreaterThan(0)
    for (const level of [1, 12, 20, 33, 44]) expect(plan(level).metals).toBe(0)
    for (let chapter = 1; chapter <= CHAPTER_STARTS.length; chapter += 1) {
      expect(plan(CHAPTER_STARTS[chapter - 1]).chapter).toBe(chapter)
    }
    const finale = plan(60)
    expect(finale.hardCount).toBeGreaterThan(0)
    expect(finale.metals).toBeGreaterThan(0)
    expect(finale.dropChance).toBeGreaterThan(0)
    expect(finale.driftRows.length).toBeGreaterThan(0)
    expect(finale.title).toContain('终局')
  })

  it('tightens the difficulty curve across chapters', () => {
    expect(plan(60).ballSpeed).toBeGreaterThan(plan(45).ballSpeed)
    expect(plan(45).ballSpeed).toBeGreaterThan(plan(1).ballSpeed)
    expect(plan(1).rows).toBe(3)
    expect(plan(11).rows).toBe(5)
    const average = (chapter: number, read: (spec: BreakLevel) => number) => {
      const start = CHAPTER_STARTS[chapter - 1]
      const size = (chapter < CHAPTER_STARTS.length ? CHAPTER_STARTS[chapter] : LEVEL_COUNT + 1) - start
      let total = 0
      for (let variant = 0; variant < size; variant += 1) total += read(plan(start + variant))
      return total / size
    }
    expect(average(5, (spec) => spec.par / spec.breakable)).toBeLessThan(average(1, (spec) => spec.par / spec.breakable))
    expect(average(5, (spec) => spec.hardCount / spec.breakable)).toBeGreaterThan(average(2, (spec) => spec.hardCount / spec.breakable))
    expect(average(4, (spec) => spec.driftAmplitude)).toBeGreaterThan(0)
  })
})

describe('brick-break physics', () => {
  const angleOf = (ball: { vx: number; vy: number }) => Math.atan2(ball.vx, -ball.vy)

  it('steers the reflection angle off the paddle without losing speed', () => {
    const edge = step(freeBall(createGameState(plan(1)), FIELD.width / 2 + 42, PADDLE_TOP - BALL_RADIUS - 2, 0, 300), 1 / 60)
    expect(edge.balls[0].vy).toBeLessThan(0)
    expect(angleOf(edge.balls[0])).toBeCloseTo(MAX_DEFLECT, 5)
    expect(Math.hypot(edge.balls[0].vx, edge.balls[0].vy)).toBeCloseTo(300, 5)
    const center = step(freeBall(createGameState(plan(1)), FIELD.width / 2, PADDLE_TOP - BALL_RADIUS - 2, 0, 300), 1 / 60)
    expect(angleOf(center.balls[0])).toBeCloseTo(0, 5)
    expect(Math.abs(center.balls[0].vx)).toBeCloseTo(0, 5)
  })

  it('resolves a max-frame fast ball against bricks instead of tunneling through', () => {
    const next = step(freeBall(createGameState(plan(1)), 217, 40, 0, 3600), 0.05)
    const destroyed = next.bricks.filter((brick) => brick.hp <= 0).length
    expect(destroyed).toBeGreaterThanOrEqual(1)
    expect(next.balls).toHaveLength(1)
    expect(next.balls[0].vy).toBeLessThan(0)
    expect(next.score).toBeGreaterThanOrEqual(SCORE_PER_BRICK)
  })

  it('scores bricks with an escalating combo per life', () => {
    const first = step(freeBall(createGameState(plan(1)), 171, 126, 0, -260), 0.1)
    expect(first.combo).toBe(1)
    expect(first.score).toBe(SCORE_PER_BRICK)
    expect(first.events).toContain('brick')
    expect(first.balls[0].vy).toBeGreaterThan(0)
    const second = step(freeBall({ ...first, combo: 3, score: 0 }, 217, 126, 0, -260), 0.1)
    expect(second.combo).toBe(4)
    expect(second.score).toBe(SCORE_PER_BRICK * 4)
  })

  it('grants paddle width, slow motion and multiball from caught drops', () => {
    const base = createGameState(plan(23))
    const widened = step({ ...base, drops: [{ id: 1, x: base.paddle.x, y: PADDLE_TOP - 6, kind: 'wide' }] }, 0.02)
    expect(paddleSpan(widened)).toBe(base.paddle.width + WIDE_BONUS)
    expect(widened.effects.wide).toBeGreaterThan(0)
    const falling = freeBall(base, FIELD.width / 2, 300, 0, 200)
    const normal = step(falling, 0.05)
    const slowed = step({ ...falling, effects: { wide: 0, slow: 5 } }, 0.05)
    expect(slowed.balls[0].y).toBeLessThan(normal.balls[0].y)
    expect(slowed.balls[0].y).toBeCloseTo(306.5, 5)
    const source = freeBall(base, FIELD.width / 2, 300, 60, 200)
    const multiplied = step({ ...source, drops: [{ id: 7, x: source.paddle.x, y: PADDLE_TOP - 6, kind: 'multi' }] }, 0.02)
    expect(multiplied.balls).toHaveLength(3)
    expect(multiplied.drops).toHaveLength(0)
  })

  it('drops power-ups deterministically from the seeded stream', () => {
    const run = () => {
      let state = launch(createGameState(plan(30)), 0.35)
      for (let index = 0; index < 90; index += 1) state = step(state, 1 / 60)
      return state
    }
    const first = run()
    const second = run()
    expect(first.rngState).toBe(second.rngState)
    expect(first.drops).toEqual(second.drops)
    expect(first.score).toBe(second.score)
    expect(first.status).toBe(second.status)
    expect(first.bricks.map((brick) => brick.hp)).toEqual(second.bricks.map((brick) => brick.hp))
  })
})

describe('brick-break boundaries', () => {
  it('clamps paddle input, rejects invalid frames and freezes terminal states', () => {
    const state = createGameState(plan(1))
    const half = state.paddle.width / 2
    expect(withPaddle(state, -40).paddle.x).toBe(half)
    expect(withPaddle(state, FIELD.width + 40).paddle.x).toBe(FIELD.width - half)
    expect(withPaddle(state, Number.NaN).paddle.x).toBe(FIELD.width / 2)
    expect(step(state, Number.NaN)).toBe(state)
    expect(step(state, -1)).toBe(state)
    expect(step(state, 0)).toBe(state)
    expect(step(state, 9)).toEqual(step(state, 0.05))
    const over: GameState = { ...state, status: 'over' }
    expect(step(over, 0.016)).toBe(over)
    expect(launch(over)).toBe(over)
  })

  it('bounces off side walls and costs a life when the last ball falls', () => {
    const state = createGameState(plan(1))
    const walled = step(freeBall(state, 3, 300, -300, 0), 0.016)
    expect(walled.balls[0].vx).toBeGreaterThan(0)
    expect(walled.balls[0].x).toBeGreaterThanOrEqual(BALL_RADIUS)
    const doomed = step(freeBall(state, 240, 630, 0, 300), 0.05)
    expect(doomed.lives).toBe(2)
    expect(doomed.combo).toBe(0)
    expect(doomed.events).toContain('life')
    expect(doomed.balls).toHaveLength(1)
    expect(doomed.balls[0].held).toBe(true)
    expect(clearBonus(60, 30)).toBe(380)
    expect(clearBonus(60, 90)).toBe(200)
  })
})
