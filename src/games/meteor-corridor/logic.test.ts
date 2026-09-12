import { describe, expect, it, vi } from 'vitest'
import {
  FIELD, GRAZE_GAP, HOMING_MAX, INVULN_SECONDS, SCORE_CAP, SHIP_MIN, SHIP_RADIUS, SHIP_SPEED, SHIP_Y, SPLIT_NEVER,
  applyInput, createGameState, step, withShip, type GameState, type Meteor, type Spawn,
} from './logic'
import {
  CHAPTER_STARTS, FAIR_WIDTH, LEVEL_COUNT, REGEN_LIMIT, chapterOf, configFor, getCorridorLevel, maxBlockedWidth,
  resolveCorridorLevel, validateLevel, type CorridorLevel,
} from './levels'

const plan = (level: number) => getCorridorLevel(level)
const frozen = (graze = false): GameState => createGameState({ duration: 30, graze, queue: [] })
const meteorAt = (id: number, meteor: Partial<Meteor>): Meteor => ({
  id, x: 240, y: SHIP_Y - 200, kind: 'straight', r: 12, vx: 0, vy: 0, splitY: SPLIT_NEVER, shards: [], turn: 0, grazed: false, ...meteor,
})
const withMeteor = (state: GameState, meteor: Partial<Meteor>): GameState => ({ ...state, meteors: [meteorAt(1, meteor)] })
const heavySpawn = (id: number, t: number): Spawn => ({ id, t, x: 240, kind: 'straight', r: 10, speed: 2000, vx: 0, splitY: SPLIT_NEVER, shards: [], turn: 0 })

describe('meteor corridor levels', () => {
  it('builds sixty deterministic, fair and valid meteor streams', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = plan(level)
      expect(JSON.stringify(spec)).toBe(JSON.stringify(plan(level)))
      expect(validateLevel(spec)).toBeNull()
      expect(maxBlockedWidth(spec)).toBeLessThanOrEqual(FAIR_WIDTH)
      expect(spec.spawnCount).toBeGreaterThanOrEqual(spec.duration * 0.45)
      expect(new Set(spec.queue.map((spawn) => spawn.id)).size).toBe(spec.spawnCount)
    }
  })

  it('regenerates byte-identical streams in a fresh module registry', async () => {
    vi.resetModules()
    const { getCorridorLevel: freshLevel } = await import('./levels')
    for (const level of [1, 17, 33, 49, 60]) {
      expect(JSON.stringify(freshLevel(level))).toBe(JSON.stringify(plan(level)))
      const fresh = freshLevel(level).queue.map((spawn) => `${spawn.t}:${spawn.x}:${spawn.kind}`)
      expect(fresh).toEqual(plan(level).queue.map((spawn) => `${spawn.t}:${spawn.x}:${spawn.kind}`))
    }
  })

  it('introduces one mechanic per chapter and stacks everything in the finale', () => {
    const kindsOf = (level: number) => new Set(plan(level).queue.map((spawn) => spawn.kind))
    expect(kindsOf(1)).toEqual(new Set(['straight']))
    expect(kindsOf(12)).toEqual(new Set(['straight', 'diagonal']))
    expect(kindsOf(23)).toContain('splitter')
    expect(kindsOf(34)).toContain('homing')
    expect(kindsOf(45)).toEqual(new Set(['straight', 'diagonal', 'splitter', 'homing']))
    for (let level = 1; level <= 44; level += 1) expect(plan(level).graze).toBe(false)
    expect(plan(45).graze).toBe(true)
    for (let chapter = 1; chapter <= CHAPTER_STARTS.length; chapter += 1) {
      expect(plan(CHAPTER_STARTS[chapter - 1]).chapter).toBe(chapter)
    }
    expect(plan(LEVEL_COUNT).title).toContain('终局')
  })

  it('tightens difficulty across and inside chapters', () => {
    const durations = CHAPTER_STARTS.map((start) => plan(start).duration)
    expect(durations).toEqual([45, 60, 75, 90, 105])
    const average = (chapter: number, read: (spec: ReturnType<typeof plan>) => number) => {
      const start = CHAPTER_STARTS[chapter - 1]
      const size = (chapter < CHAPTER_STARTS.length ? CHAPTER_STARTS[chapter] : LEVEL_COUNT + 1) - start
      let total = 0
      for (let variant = 0; variant < size; variant += 1) total += read(plan(start + variant))
      return total / size
    }
    const meanInterval = (spec: ReturnType<typeof plan>) => (spec.duration - 3.4) / Math.max(1, spec.spawnCount - 1)
    expect(average(5, meanInterval)).toBeLessThan(average(1, meanInterval))
    expect(average(5, (spec) => spec.speed)).toBeGreaterThan(average(1, (spec) => spec.speed))
    expect(average(4, (spec) => spec.turn)).toBeGreaterThan(0)
    for (const level of [3, 27, 52]) {
      const spec = plan(level)
      expect(spec.intervalTo).toBeLessThan(spec.intervalFrom)
      expect(plan(level + 6).speed).toBeGreaterThan(spec.speed)
    }
  })

  it('clamps level lookups to the playable range', () => {
    expect(plan(0).level).toBe(1)
    expect(plan(999).level).toBe(LEVEL_COUNT)
    expect(plan(Number.NaN).level).toBe(1)
    expect(plan(12.9).level).toBe(12)
  })

  it('predicts homing occupancy with an amplified chase toward mid-field', () => {
    // A fast hunter hugging the left wall: straight-line math keeps its blocked
    // span clamped at the edge, while the capped chase carries it toward mid-field
    // where the same radius blocks far more of the corridor.
    const spawn = (kind: 'straight' | 'homing'): CorridorLevel => ({
      ...plan(34),
      queue: [{ id: 1, t: 0.9, x: 16, kind, r: 24, speed: 400, vx: 0, splitY: SPLIT_NEVER, shards: [], turn: 999 }],
    })
    expect(maxBlockedWidth(spawn('homing'))).toBeGreaterThan(maxBlockedWidth(spawn('straight')))
  })

  it('regenerates rejected seeds and caps the retry budget', () => {
    const borderline: Parameters<typeof resolveCorridorLevel>[1] = {
      duration: 45, speed: 95, intervalFrom: 0.3, intervalTo: 0.22, drift: 45, turn: 210,
      diagonalChance: 0.3, splitterChance: 0.2, homingChance: 0.22,
    }
    const retry = resolveCorridorLevel(57, borderline)
    expect(retry.attempts).toBeGreaterThanOrEqual(1)
    expect(retry.attempts).toBeLessThanOrEqual(REGEN_LIMIT)
    expect(validateLevel(retry.spec)).toBeNull()
    const hopeless: Parameters<typeof resolveCorridorLevel>[1] = {
      duration: 45, speed: 90, intervalFrom: 0.3, intervalTo: 0.2, drift: 40, turn: 200,
      diagonalChance: 0.3, splitterChance: 0.2, homingChance: 0.2,
    }
    const capped = resolveCorridorLevel(59, hopeless)
    expect(capped.attempts).toBe(REGEN_LIMIT)
    for (const level of [1, 30, 60]) {
      const chapter = chapterOf(level)
      const cfg = configFor(chapter, level - CHAPTER_STARTS[chapter - 1])
      expect(getCorridorLevel(level)).toMatchObject(resolveCorridorLevel(level, cfg).spec)
    }
  })

  it('rejects finale streams that dropped one of the four meteor kinds', () => {
    const finale = plan(45)
    const drained = finale.queue.filter((spawn) => spawn.kind !== 'homing')
    expect(validateLevel({ ...finale, queue: drained, spawnCount: drained.length })).toBe('finale missing a meteor kind')
    expect(validateLevel(finale)).toBeNull()
  })
})

describe('meteor corridor physics', () => {
  it('separates exact contact, near miss and graze rings precisely', () => {
    const contact = step(withMeteor(frozen(), { y: SHIP_Y - (SHIP_RADIUS + 12) }), 0.016)
    expect(contact.events).toContain('hit')
    expect(contact.shield).toBe(2)
    expect(contact.hits).toBe(1)
    expect(contact.invuln).toBeGreaterThan(0)
    expect(contact.meteors).toHaveLength(0)
    const outside = step(withMeteor(frozen(), { y: SHIP_Y - (SHIP_RADIUS + 12) - 0.5 }), 0.016)
    expect(outside.events).not.toContain('hit')
    expect(outside.shield).toBe(3)
    expect(outside.meteors).toHaveLength(1)
    const grazeDistance = SHIP_RADIUS + 12 + GRAZE_GAP - 2
    let grazed = step(withMeteor(frozen(true), { y: SHIP_Y - grazeDistance }), 0.016)
    expect(grazed.events).toContain('graze')
    expect(grazed.grazes).toBe(1)
    expect(grazed.score).toBeGreaterThan(24)
    grazed = step({ ...grazed, events: [] }, 0.016)
    expect(grazed.events).not.toContain('graze')
    expect(grazed.grazes).toBe(1)
  })

  it('shields the ship from repeat hits during the invulnerability window', () => {
    const state: GameState = { ...frozen(), meteors: [meteorAt(1, { y: SHIP_Y - (SHIP_RADIUS + 12) }), meteorAt(2, { x: 240 + SHIP_RADIUS + 12, y: SHIP_Y })] }
    const first = step(state, 0.016)
    expect(first.shield).toBe(2)
    expect(first.meteors).toHaveLength(1)
    let current = first
    for (let index = 0; index < 200; index += 1) current = step(current, 0.016)
    expect(current.shield).toBe(1)
    expect(current.hits).toBe(2)
    expect(current.invuln).toBeGreaterThanOrEqual(0)
  })

  it('splits splitters into two smaller faster shards', () => {
    const shards = [0, 1].map((index) => ({ dx: 8, vx: (index === 0 ? -1 : 1) * 60, r: 8, speed: 220 + index * 20 }))
    let state = withMeteor(frozen(), { kind: 'splitter', x: 240, y: 100, r: 20, vy: 200, splitY: 300, shards })
    const events: GameState['events'] = []
    for (let index = 0; index < 40; index += 1) {
      state = step(state, 0.05)
      events.push(...state.events)
    }
    expect(events).toContain('split')
    expect(state.meteors).toHaveLength(2)
    expect(state.meteors.every((meteor) => meteor.kind === 'shard')).toBe(true)
    expect(state.meteors.every((meteor) => meteor.r < 20 && meteor.vy > 200)).toBe(true)
    expect(state.meteors[0].vx).toBeLessThan(0)
    expect(state.meteors[1].vx).toBeGreaterThan(0)
    expect(state.meteors[0].x).toBeLessThan(state.meteors[1].x)
  })

  it('steers homing meteors toward the ship with a capped drift', () => {
    let homing = withShip(withMeteor(frozen(), { kind: 'homing', x: 100, y: SHIP_Y - 300, vy: 60, turn: 400 }), 400)
    homing = step(homing, 0.25)
    expect(homing.meteors[0].vx).toBeGreaterThan(0)
    expect(homing.meteors[0].x).toBeGreaterThan(100)
    const capped = step(withMeteor(withShip(frozen(), 400), { kind: 'homing', x: 100, y: SHIP_Y - 300, vy: 60, turn: 1e9 }), 0.25)
    expect(Math.abs(capped.meteors[0].vx)).toBeLessThanOrEqual(HOMING_MAX)
    const straight = step(withMeteor(frozen(), { vx: 0 }), 0.5)
    expect(straight.meteors[0].vx).toBe(0)
    const diagonal = step(withMeteor(frozen(), { kind: 'diagonal', vx: -70 }), 0.5)
    expect(diagonal.meteors[0].vx).toBe(-70)
  })

  it('frees the keyboard from a stale touch point once the pointer is released', () => {
    const base = frozen()
    const touched = applyInput(base, { left: false, right: false, pointerX: 420 }, 0.016)
    expect(touched.ship).toBe(420)
    const released = applyInput(touched, { left: true, right: false, pointerX: null }, 0.1)
    expect(released.ship).toBeCloseTo(420 - SHIP_SPEED * 0.1)
    const keyboardOnly = applyInput(base, { left: false, right: true, pointerX: null }, 0.1)
    expect(keyboardOnly.ship).toBeCloseTo(base.ship + SHIP_SPEED * 0.1)
    expect(applyInput(base, { left: true, right: true, pointerX: null }, 0.1)).toBe(base)
    expect(applyInput(base, { left: false, right: false, pointerX: null }, 0.1)).toBe(base)
    const offField = applyInput(base, { left: false, right: false, pointerX: Number.NaN }, 0.1)
    expect(offField.ship).toBe(FIELD.width / 2)
  })

  it('completes survivors at the target time and pays ten points per second', () => {
    let state = createGameState({ duration: 2, graze: false, queue: [] })
    for (let index = 0; index < 130; index += 1) state = step(state, 1 / 60)
    expect(state.status).toBe('cleared')
    expect(state.events).toContain('clear')
    expect(Math.floor(state.score)).toBe(20)
    expect(state.shield).toBe(3)
  })

  it('fails the run when the third hit drains the shield', () => {
    const queue = [1, 2, 3].map((index) => heavySpawn(index, 0.1 + (index - 1) * 1.9))
    let state = createGameState({ duration: 30, graze: false, queue })
    for (let index = 0; index < 300; index += 1) state = step(state, 1 / 60)
    expect(state.status).toBe('over')
    expect(state.events).toContain('over')
    expect(state.shield).toBe(0)
    expect(state.hits).toBe(3)
    expect(state.score).toBeGreaterThan(40)
  })

  it('clamps ship input, rejects invalid frames and freezes terminal states', () => {
    const state = frozen()
    expect(withShip(state, -40).ship).toBe(SHIP_MIN)
    expect(withShip(state, FIELD.width + 40).ship).toBe(FIELD.width - SHIP_MIN)
    expect(withShip(state, Number.NaN).ship).toBe(FIELD.width / 2)
    expect(step(state, Number.NaN)).toBe(state)
    expect(step(state, -1)).toBe(state)
    expect(step(state, 0)).toBe(state)
    expect(step(state, 9)).toEqual(step(state, 0.05))
    const over = { ...state, status: 'over' as const }
    expect(step(over, 0.016)).toBe(over)
    const cleared = { ...state, status: 'cleared' as const }
    expect(step(cleared, 0.016)).toBe(cleared)
  })

  it('caps the score at the policy maximum', () => {
    const state = { ...frozen(true), score: SCORE_CAP - 3, meteors: [meteorAt(1, { y: SHIP_Y - (SHIP_RADIUS + 12 + GRAZE_GAP - 2) })] }
    const next = step(state, 0.016)
    expect(next.events).toContain('graze')
    expect(next.score).toBe(SCORE_CAP)
  })

  it('replays a fixed input sequence frame-by-frame identically across all sixty levels', () => {
    // 全程确定性回放:同一固定输入序列跑两遍,每帧投影(标量状态+每颗陨石)逐帧比对,
    // 把确定性从「种子级」提升到「回放级」。
    const replay = (level: number) => {
      const spec = plan(level)
      let state = createGameState(spec)
      const trace: string[] = []
      for (let frame = 0; frame <= spec.duration * 60 && state.status === 'playing'; frame += 1) {
        const left = frame % 97 < 24
        const right = !left && frame % 89 < 31
        const pointerX = frame % 173 < 40 ? (frame * 37) % FIELD.width : null
        state = applyInput(state, { left, right, pointerX }, 1 / 60)
        state = step(state, 1 / 60)
        trace.push(JSON.stringify([
          state.time, state.ship, state.score, state.shield, state.invuln, state.grazes, state.hits, state.status,
          state.meteors.map((meteor) => [meteor.id, meteor.x, meteor.y, meteor.vx, meteor.vy, meteor.grazed]),
        ]))
      }
      return { status: state.status, shield: state.shield, trace }
    }
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const first = replay(level)
      const second = replay(level)
      expect(second).toEqual(first)
      expect(first.trace.length).toBeGreaterThan(0)
      expect(['cleared', 'over']).toContain(first.status)
    }
  })

  it('keeps invulnerability window below the spawn cadence it protects', () => {
    expect(INVULN_SECONDS).toBeLessThan(2)
    expect(GRAZE_GAP).toBeGreaterThan(0)
    expect(SHIP_Y).toBeLessThan(FIELD.height)
  })
})
