import { describe, expect, it } from 'vitest'
import { bfsDistances, canMove, DIRS, exitVisible, GLIMMER_MS, litWallSegments, moveEcho, pulseEcho, RELOCATE_EVERY, scoreFor, SCORE_BASE, SCORE_CAP, SCORE_FLOOR, tickEcho, WALL_BIT, type Dir, type EchoState } from './logic'
import { chapterOf, createEchoLevelState, ECHO_LEVEL_COUNT, getEchoLevel } from './levels'

const DIR_LIST = Object.keys(DIRS) as Dir[]
const radiusCells = (cols: number, rows: number, center: { x: number; y: number }, radius: number) => {
  const cells: string[] = []
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if ((x - center.x) ** 2 + (y - center.y) ** 2 <= radius * radius + 1e-9) cells.push(`${x}:${y}`)
    }
  }
  return cells.sort()
}

function walkToExit(level: number): EchoState {
  let state = createEchoLevelState(level)
  let guard = 0
  while (state.status === 'running' && guard < 4000) {
    guard += 1
    const here = bfsDistances(state.cols, state.rows, state.walls, state.exit)[state.player.y * state.cols + state.player.x] as number
    const dir = DIR_LIST.find((candidate) =>
      canMove(state.cols, state.rows, state.walls, state.player, candidate) &&
      bfsDistances(state.cols, state.rows, state.walls, state.exit)[(state.player.y + DIRS[candidate].y) * state.cols + state.player.x + DIRS[candidate].x] === here - 1)
    if (!dir) throw new Error('no downhill step toward exit')
    state = moveEcho(state, dir)
  }
  return state
}

describe('echo maze levels', () => {
  it('generates sixty connected deterministic mazes with a reachable far exit', () => {
    for (let level = 1; level <= ECHO_LEVEL_COUNT; level += 1) {
      const first = getEchoLevel(level)
      const second = getEchoLevel(level)
      expect(second.walls).toEqual(first.walls)
      expect(second.par).toBe(first.par)
      expect(second.seed).toBe(first.seed)
      expect(first.walls).toHaveLength(first.cols * first.rows)
      expect(first.par).toBeGreaterThanOrEqual(Math.abs(first.exit.x - first.start.x) + Math.abs(first.exit.y - first.start.y))
      expect(first.exit.x === 0 && first.exit.y === 0).toBe(false)
      const dist = bfsDistances(first.cols, first.rows, first.walls, first.start)
      expect(dist.every((value) => value >= 0)).toBe(true)
      expect(dist[first.exit.y * first.cols + first.exit.x]).toBe(first.par)
      expect(createEchoLevelState(level)).toEqual(createEchoLevelState(level))
    }
    expect(getEchoLevel(0).level).toBe(1)
    expect(getEchoLevel(999).level).toBe(ECHO_LEVEL_COUNT)
    expect(getEchoLevel(Number.NaN).level).toBe(1)
    expect(chapterOf(1)).toBe(1)
    expect(chapterOf(60)).toBe(5)
  })

  it('reveals exactly the radius neighbourhood, then lets echoes fade', () => {
    let state = createEchoLevelState(1)
    expect(state.lit).toEqual({})
    state = tickEcho(state, 100)
    state = pulseEcho(state)
    expect(state.pulsesLeft).toBe(state.pulsesMax - 1)
    expect(state.pulsesUsed).toBe(1)
    expect(state.events).toEqual(['pulse'])
    const revealed = Object.keys(state.lit).sort()
    expect(revealed).toEqual(radiusCells(state.cols, state.rows, state.player, state.radius))
    expect(revealed).toContain('0:0')
    const far = radiusCells(state.cols, state.rows, state.player, state.radius + 1).filter((key) => !revealed.includes(key))
    expect(far.length).toBeGreaterThan(0)
    const segments = litWallSegments(state)
    expect(segments.length).toBeGreaterThan(0)
    for (const seg of segments) {
      const touches = seg.dir === 'up'
        ? revealed.includes(`${seg.x}:${seg.y}`) || revealed.includes(`${seg.x}:${seg.y - 1}`)
        : revealed.includes(`${seg.x}:${seg.y}`) || revealed.includes(`${seg.x - 1}:${seg.y}`)
      expect(touches).toBe(true)
    }
    state = tickEcho(state, state.litMs - 120)
    expect(Object.keys(state.lit).sort()).toEqual(revealed)
    state = tickEcho(state, 200)
    expect(state.lit).toEqual({})
    expect(litWallSegments(state)).toEqual([])
    for (let spent = state.pulsesUsed; spent < state.pulsesMax; spent += 1) state = pulseEcho(state)
    expect(state.pulsesLeft).toBe(0)
    const exhausted = pulseEcho(state)
    expect(exhausted).toBe(state)
    expect(exhausted.pulsesUsed).toBe(state.pulsesMax)
  })

  it('scores by pulses and extra steps over the BFS par, completing at the exit', () => {
    const spec = getEchoLevel(5)
    expect(spec.par).toBeGreaterThan(0)
    expect(scoreFor(0, spec.par, spec.par)).toBe(SCORE_BASE)
    expect(scoreFor(3, spec.par + 12, spec.par)).toBe(SCORE_BASE - 3 * 80 - 12 * 5)
    expect(scoreFor(99, 9999, spec.par)).toBe(SCORE_FLOOR)
    expect(scoreFor(0, 0, -40)).toBe(SCORE_BASE - 200)
    const walked = walkToExit(5)
    expect(walked.status).toBe('completed')
    expect(walked.steps).toBe(spec.par)
    expect(walked.score).toBe(SCORE_BASE)
    expect(walked.events).toContain('win')
    const gated = moveEcho(walked, 'up')
    expect(gated).toBe(walked)
    expect(tickEcho(walked, 5000)).toBe(walked)
    expect(walked.score).toBeLessThanOrEqual(SCORE_CAP)
  })

  it('bumps on walls without charging steps and freezes completed runs', () => {
    let state = createEchoLevelState(3)
    const origin = { ...state.player }
    const wallsAt = state.walls[origin.y * state.cols + origin.x]
    const blocked = (DIR_LIST.find((dir) => wallsAt & WALL_BIT[dir]) ?? 'up') as Dir
    const bumped = moveEcho(state, blocked)
    expect(bumped.player).toEqual(origin)
    expect(bumped.steps).toBe(state.steps)
    expect(bumped.events).toEqual(['bump'])
    expect(bumped.score).toBe(state.score)
    const open = DIR_LIST.filter((dir) => canMove(state.cols, state.rows, state.walls, state.player, dir))
    expect(open.length).toBeGreaterThan(0)
    state = moveEcho(state, open[0] as Dir)
    expect(state.steps).toBe(1)
    expect(state.events).toEqual(['move'])
    expect(tickEcho(state, -40).clock).toBe(state.clock)
  })

  it('relocates a drifting exit every thirty steps, deterministically and fairly', () => {
    expect(getEchoLevel(40).movingExit).toBe(true)
    expect(getEchoLevel(5).movingExit).toBe(false)
    const base = createEchoLevelState(40)
    const seeded: EchoState = { ...base, player: { x: 1, y: 1 }, clock: 400, steps: RELOCATE_EVERY - 1 }
    const open = DIR_LIST.find((dir) => canMove(seeded.cols, seeded.rows, seeded.walls, seeded.player, dir)) as Dir
    const moved = moveEcho(seeded, open)
    expect(moved.steps).toBe(RELOCATE_EVERY)
    expect(moved.events).toContain('relocate')
    expect(moved.exitLitUntil).toBe(400 + GLIMMER_MS)
    expect(exitVisible(moved)).toBe(true)
    expect(moved.exit.x === moved.player.x && moved.exit.y === moved.player.y).toBe(false)
    const dist = bfsDistances(moved.cols, moved.rows, moved.walls, moved.player)
    expect(dist[moved.exit.y * moved.cols + moved.exit.x]).toBeGreaterThanOrEqual(6)
    const again = moveEcho({ ...seeded }, open)
    expect(again.exit).toEqual(moved.exit)
    const before = moveEcho({ ...base, player: { x: 1, y: 1 }, steps: RELOCATE_EVERY - 2 }, open)
    expect(before.events).not.toContain('relocate')
    expect(before.exit).toEqual(base.exit)
    const glimmerGone = tickEcho(moved, GLIMMER_MS + 10)
    expect(exitVisible(glimmerGone)).toBe(false)
  })

  it('tightens size, pulses and echo budget across the five chapters', () => {
    const specs = [1, 12, 23, 34, 45].map((level) => getEchoLevel(level))
    expect(specs.map((spec) => spec.pulses)).toEqual([6, 5, 4, 4, 3])
    expect(specs.map((spec) => spec.movingExit)).toEqual([false, false, false, true, true])
    expect(specs.map((spec) => spec.hintMs > 0)).toEqual([false, false, true, false, true])
    for (let index = 1; index < specs.length; index += 1) {
      expect(specs[index].cols * specs[index].rows).toBeGreaterThanOrEqual(specs[index - 1].cols * specs[index - 1].rows)
      expect(specs[index].pulses).toBeLessThanOrEqual(specs[index - 1].pulses)
      expect(specs[index].litMs).toBeLessThanOrEqual(specs[index - 1].litMs)
      expect(specs[index].loops).toBeGreaterThanOrEqual(specs[index - 1].loops)
      expect(specs[index].radius).toBeLessThanOrEqual(specs[index - 1].radius)
    }
    const averagePar = (chapter: number) => {
      let total = 0
      let count = 0
      for (let level = 1; level <= ECHO_LEVEL_COUNT; level += 1) {
        if (chapterOf(level) !== chapter) continue
        total += getEchoLevel(level).par
        count += 1
      }
      return total / count
    }
    expect(averagePar(5)).toBeGreaterThan(averagePar(1))
    expect(averagePar(3)).toBeGreaterThan(averagePar(2))
    for (let level = 2; level <= ECHO_LEVEL_COUNT; level += 1) {
      expect(chapterOf(level) - chapterOf(level - 1)).toBeLessThanOrEqual(1)
    }
  })

  it('keeps pulses from revealing the exit forever and keeps tick monotone', () => {
    const state = createEchoLevelState(50)
    expect(state.movingExit).toBe(true)
    expect(state.hintUntil).toBeGreaterThan(0)
    const lit = pulseEcho(tickEcho(state, 10))
    expect(exitVisible(lit)).toBe(false)
    const advanced = tickEcho(lit, 400)
    expect(advanced.clock).toBe(lit.clock + 400)
    expect(advanced.pulsesLeft).toBe(lit.pulsesLeft)
    expect(tickEcho(tickEcho(state, 100), 100).clock).toBe(200)
  })
})
