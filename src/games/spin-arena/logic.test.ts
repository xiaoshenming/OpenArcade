import { describe, expect, it } from 'vitest'
import { arenaRadiusAt, arenaScore, createFighter, DOT_SPIN, KNOCK_GAIN, KNOCK_RATE, resolveCollision, SPIN_DECAY, SPIN_MAX, stepArena, type ArenaInput, type ArenaState, type Dot, type Fighter } from './logic'
import { chapterOf, createSpinArenaState, getSpinLevel, ROUND_SECONDS, SPIN_LEVEL_COUNT } from './levels'

const IDLE: ArenaInput = { ax: 0, ay: 0 }
const ZERO = { x: 0, y: 0, vx: 0, vy: 0 }
const makeFighter = (over: Partial<Fighter>): Fighter => ({ ...ZERO, r: 8.5, m: 1, spin: 60, alive: true, ...over })
const run = (state: ArenaState, input: ArenaInput, seconds: number): ArenaState => {
  let current = state
  for (let index = 0; index < Math.round(seconds * 60); index += 1) current = stepArena(current, input, 1 / 60)
  return current
}
const drill = (level: number): ArenaState => {
  let current = createSpinArenaState(level)
  for (let frame = 0; frame < 240; frame += 1) current = stepArena(current, { ax: 0.6, ay: -0.8 }, 1 / 60)
  return current
}
const botInput = (state: ArenaState): ArenaInput => {
  const head = state.player
  let ax = -head.x / 40
  let ay = -head.y / 40
  let best = Infinity
  let target: Dot | null = null
  for (const dot of state.dots) {
    if (dot.taken) continue
    const gap = Math.hypot(dot.x - head.x, dot.y - head.y)
    if (gap < best) {
      best = gap
      target = dot
    }
  }
  if (target) {
    ax += (target.x - head.x) / Math.max(1, best)
    ay += (target.y - head.y) / Math.max(1, best)
  }
  for (const foe of state.enemies) {
    if (!foe.alive) continue
    const dx = head.x - foe.x
    const dy = head.y - foe.y
    const gap = Math.hypot(dx, dy) || 1
    if (gap < 40) {
      ax += (dx / gap) * (40 - gap) * 0.25
      ay += (dy / gap) * (40 - gap) * 0.25
    }
  }
  const len = Math.hypot(ax, ay) || 1
  return { ax: ax / len, ay: ay / len }
}
const survive = (level: number): ArenaState => {
  let current = createSpinArenaState(level)
  for (let frame = 0; frame < 60 * (ROUND_SECONDS + 2) && current.status === 'running'; frame += 1) {
    current = stepArena(current, botInput(current), 1 / 60)
  }
  return current
}

describe('spin arena physics', () => {
  it('conserves momentum and energy in elastic clashes and pushes the weaker rotor further', () => {
    const a = makeFighter({ x: 0, y: 0, vx: 40, vy: 6, r: 9, m: 1.2, spin: 100 })
    const b = makeFighter({ x: 15, y: 1, vx: -10, vy: -2, spin: 60 })
    const momentum = a.vx * a.m + b.vx * b.m
    const energy = 0.5 * (a.m * (a.vx ** 2 + a.vy ** 2) + b.m * (b.vx ** 2 + b.vy ** 2))
    const hit = resolveCollision(a, b, 0)
    expect(hit.clash).toBe(true)
    expect(a.vx * a.m + b.vx * b.m).toBeCloseTo(momentum, 6)
    expect(0.5 * (a.m * (a.vx ** 2 + a.vy ** 2) + b.m * (b.vx ** 2 + b.vy ** 2))).toBeCloseTo(energy, 4)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(a.r + b.r - 1e-6)
    const plainA = makeFighter({ x: 0, y: 0, vx: 40, r: 9, m: 1.2, spin: 100 })
    const plainB = makeFighter({ x: 15, y: 0, spin: 60 })
    const plain = resolveCollision(plainA, plainB, 0)
    const bonusA = makeFighter({ x: 0, y: 0, vx: 40, r: 9, m: 1.2, spin: 100 })
    const bonusB = makeFighter({ x: 15, y: 0, spin: 60 })
    const bonusValue = 30 * KNOCK_GAIN * KNOCK_RATE * (1 / 60)
    const bonus = resolveCollision(bonusA, bonusB, bonusValue)
    expect(plain.clash).toBe(true)
    expect(bonus.bonusApplied).toBe(true)
    expect(bonusA.vx).toBeCloseTo(plainA.vx, 6)
    expect(bonusB.vx).toBeCloseTo(plainB.vx + bonusValue, 6)
    expect(bonusB.vx).toBeGreaterThan(plainB.vx)
  })

  it('decays spin, refuels from energy dots and fails at zero', () => {
    const solo: ArenaState = {
      ...createSpinArenaState(3),
      player: makeFighter({ x: 0, y: 0, r: 9, m: 1.2, spin: 100 }),
      enemies: [makeFighter({ x: 0, y: -70, spin: 60 })],
    }
    const idle = run(solo, IDLE, 1)
    expect(idle.status).toBe('running')
    expect(idle.energy).toBe(0)
    expect(idle.player.spin).toBeCloseTo(SPIN_MAX - SPIN_DECAY, 3)
    const state = createSpinArenaState(1)
    const dot = state.dots[0]
    expect(dot).toBeTruthy()
    const fed: ArenaState = { ...state, player: { ...state.player, x: (dot as { x: number }).x + 4, y: (dot as { y: number }).y } }
    const collected = stepArena(fed, IDLE)
    expect(collected.events).toContain('collect')
    expect(collected.energy).toBe(1)
    expect(collected.score).toBe(30)
    expect(collected.player.spin).toBeCloseTo(Math.min(SPIN_MAX, fed.player.spin + DOT_SPIN) - SPIN_DECAY / 60, 5)
    const stalled = run({ ...createSpinArenaState(1), player: makeFighter({ x: 0, y: 0, r: 9, m: 1.2, spin: 0.5 }) }, IDLE, 1)
    expect(stalled.status).toBe('failed')
    expect(stalled.events).toContain('lose')
    expect(stalled.player.spin).toBe(0)
  })

  it('lets spin decay reach zero before the buzzer yet keeps a refuel bot alive to it', () => {
    expect(SPIN_DECAY * ROUND_SECONDS).toBeGreaterThan(SPIN_MAX)
    const idle = run({ ...createSpinArenaState(1), enemySpeed: 0 }, IDLE, ROUND_SECONDS)
    expect(idle.status).toBe('failed')
    expect(idle.events).toContain('lose')
    expect(idle.player.spin).toBe(0)
    expect(idle.time, 'idle decay must strike before the buzzer').toBeLessThan(ROUND_SECONDS)
    for (let level = 1; level <= 22; level += 1) {
      const bot = survive(level)
      expect(bot.status, `level ${level}`).toBe('completed')
      expect(bot.time, `level ${level} survives to the buzzer`).toBeGreaterThanOrEqual(ROUND_SECONDS - 1e-6)
      expect(bot.player.spin, `level ${level}`).toBeGreaterThan(0)
      expect(bot.energy, `level ${level}`).toBeGreaterThan(0)
      expect(bot.enemies.some((enemy) => enemy.alive), `level ${level}`).toBe(true)
    }
  })

  it('steers enemies toward the player and makes smart chapters lead the target', () => {
    const dumb: ArenaState = { ...createSpinArenaState(30), smart: false, player: makeFighter({ x: 0, y: 0, r: 9, m: 1.2, spin: 100, vx: 120 }) }
    const smart: ArenaState = { ...dumb, smart: true }
    const dumbStep = stepArena({ ...dumb, enemies: [makeFighter({ x: 70, y: 0, spin: 60 })].concat(dumb.enemies.slice(1)) }, IDLE)
    const smartStep = stepArena({ ...smart, enemies: [makeFighter({ x: 70, y: 0, spin: 60 })].concat(smart.enemies.slice(1)) }, IDLE)
    expect(dumbStep.enemies[0].vx).toBeLessThan(0)
    expect(smartStep.enemies[0].vx).toBeGreaterThan(dumbStep.enemies[0].vx)
    const chase = run({ ...createSpinArenaState(50), enemies: [makeFighter({ x: 0, y: -70, spin: 60 })] }, IDLE, 2)
    expect(Math.abs(chase.enemies[0].y)).toBeLessThan(70)
  })

  it('shrinks the ring only in late chapters and ousts bodies beyond it', () => {
    expect(arenaRadiusAt(100, false, 16)).toBe(100)
    expect(arenaRadiusAt(100, true, 14.9)).toBeCloseTo(100, 6)
    expect(arenaRadiusAt(100, true, 15.1)).toBeCloseTo(90, 6)
    expect(arenaRadiusAt(100, true, 31)).toBeCloseTo(81, 6)
    const drift = { ...createSpinArenaState(40), player: makeFighter({ x: 0, y: 20, r: 9, m: 1.2, spin: 100 }), enemies: [makeFighter({ x: 0, y: -70, spin: 60 })] }
    const before = stepArena({ ...drift, time: 14.99 }, IDLE)
    expect(before.radius).toBe(100)
    const after = stepArena(before, IDLE)
    expect(after.shrink).toBe(true)
    expect(after.radius).toBeCloseTo(90, 6)
    const calm = run(createSpinArenaState(5), IDLE, 16)
    expect(calm.radius).toBe(100)
    const ousted = run({ ...createSpinArenaState(1), enemies: [makeFighter({ x: 95, y: 0, vx: 130, spin: 60 })] }, IDLE, 1.5)
    expect(ousted.enemies[0].alive).toBe(false)
    expect(ousted.knockouts).toBe(1)
    expect(ousted.score).toBeGreaterThanOrEqual(400)
    expect(ousted.events).toContain('knockout')
  })

  it('completes on time or clean sweep and fails when the player leaves the ring', () => {
    const sweep = run({ ...createSpinArenaState(1), enemies: [makeFighter({ x: 99, y: 0, vx: 200, spin: 60 })] }, IDLE, 2)
    expect(sweep.status).toBe('completed')
    expect(sweep.events).toContain('win')
    const buzzer = stepArena({ ...createSpinArenaState(2), time: 44.99 }, IDLE)
    expect(buzzer.status).toBe('completed')
    const pushedOut = run({ ...createSpinArenaState(1), player: makeFighter({ x: 96, y: 0, r: 9, m: 1.2, spin: 100, vx: 160 }) }, IDLE, 2)
    expect(pushedOut.status).toBe('failed')
    expect(pushedOut.events).toContain('lose')
    const frozen = stepArena(buzzer, { ax: 1, ay: 1 })
    expect(frozen).toBe(buzzer)
  })

  it('generates sixty deterministic levels with a tightening difficulty curve', () => {
    for (let level = 1; level <= SPIN_LEVEL_COUNT; level += 1) {
      expect(createSpinArenaState(level)).toEqual(createSpinArenaState(level))
      const spec = getSpinLevel(level)
      expect(spec.dotSpawns).toHaveLength(spec.dots)
      expect(spec.enemySpawns).toHaveLength(spec.enemies)
      for (const dot of spec.dotSpawns) {
        expect(Math.hypot(dot.x, dot.y)).toBeGreaterThanOrEqual(18)
        expect(Math.hypot(dot.x, dot.y)).toBeLessThanOrEqual(85)
      }
      for (const spawn of spec.enemySpawns) expect(Math.hypot(spawn.x, spawn.y)).toBeCloseTo(62, 6)
      expect(drill(level)).toEqual(drill(level))
    }
    const specs = [1, 12, 23, 34, 45].map((level) => getSpinLevel(level))
    expect(specs.map((spec) => spec.enemies)).toEqual([1, 2, 3, 3, 3])
    expect(specs.map((spec) => spec.dots)).toEqual([14, 10, 9, 8, 6])
    expect(specs.map((spec) => spec.shrink)).toEqual([false, false, false, true, true])
    expect(specs.map((spec) => spec.smart)).toEqual([false, false, false, false, true])
    expect(specs.map((spec) => spec.duration)).toEqual([45, 45, 45, 45, 45])
    for (let index = 1; index < specs.length; index += 1) {
      expect(specs[index].enemySpeed).toBeGreaterThan(specs[index - 1].enemySpeed)
      expect(specs[index].dots).toBeLessThanOrEqual(specs[index - 1].dots)
      expect(specs[index].enemies).toBeGreaterThanOrEqual(specs[index - 1].enemies)
    }
    expect(chapterOf(0)).toBe(1)
    expect(chapterOf(999)).toBe(5)
    expect(getSpinLevel(0).level).toBe(1)
    expect(getSpinLevel(Number.NaN).level).toBe(1)
    expect(arenaScore(45, 3, 10)).toBe(45 * 20 + 3 * 400 + 10 * 30)
    expect(arenaScore(9999, 99, 999)).toBe(10000)
  })

  it('keeps huge or empty inputs stable and the sim finite', () => {
    const state = createSpinArenaState(7)
    const wild = run(state, { ax: 42, ay: -37 }, 2)
    expect(Number.isFinite(wild.player.x)).toBe(true)
    expect(Number.isFinite(wild.player.y)).toBe(true)
    expect(Math.hypot(wild.player.vx, wild.player.vy)).toBeLessThan(400)
    expect(wild.player.spin).toBeLessThanOrEqual(SPIN_MAX)
    expect(['running', 'completed', 'failed']).toContain(wild.status)
    expect(stepArena(state, IDLE).time).toBeCloseTo(1 / 60, 6)
    expect(createFighter(1, 2, 9, 1.2, 100)).toEqual({ x: 1, y: 2, vx: 0, vy: 0, r: 9, m: 1.2, spin: 100, alive: true })
    const done: ArenaState = { ...state, status: 'completed' }
    expect(stepArena(done, { ax: 1, ay: 1 })).toBe(done)
  })
})
